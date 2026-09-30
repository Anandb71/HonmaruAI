/// Sign in with Apple, from the phone app (POST /auth/apple).
///
/// The app asks Apple for an identity token with a nonce it made up — it
/// hands Apple the SHA-256 of a random string and sends us the string. The
/// token is a JWT signed by Apple (RS256, keys at appleid.apple.com/auth/keys,
/// fetched like an identity provider's in sso.js and kept an hour). Checked:
/// the signature, the issuer, that it is for one of our apps (APPLE_CLIENT_IDS,
/// comma separated; the App Store app and the PoC by default), that it has not
/// expired, and that its nonce is the hash of the string we were sent — so a
/// token lifted from somewhere else is no use without the string behind it.
///
/// Then the person: the Apple account already linked here, or the account
/// with the address Apple vouches for (one that proved it here too), or a new
/// account made the way an emailed-code sign-up makes one. A private relay
/// address (…@privaterelay.appleid.com) is an address like any other.

import { signedClaims } from "./sso.js";
import { signup, acceptInvite, sha256Hex, EMAIL_AUTH_TOKEN, MAX_NAME_CHARS } from "./auth.js";
import { createSession, primaryOrgId } from "./db.js";

export const APPLE_ISSUER = "https://appleid.apple.com";
export const APPLE_KEYS_URL = "https://appleid.apple.com/auth/keys";
export const DEFAULT_APPLE_CLIENT_IDS = ["com.honmaru.ai", "com.honmaru.ai.poc"];
const SKEW_SECONDS = 120;

export function appleClientIds(env) {
  const list = String(env.APPLE_CLIENT_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
  return list.length ? list : DEFAULT_APPLE_CLIENT_IDS;
}

/// Apple's claims when the token holds, or a thrown error that says why not.
export async function verifyAppleToken(token, { clientIds, nonce, now = Date.now() }) {
  const head = String(token || "").split(".")[0];
  let alg = null;
  try { alg = JSON.parse(atob(head.replace(/-/g, "+").replace(/_/g, "/"))).alg; } catch { /* checked below */ }
  // Apple signs with RS256 and nothing else; anything else is not from Apple.
  if (alg !== "RS256") throw new Error("That is not a token from Apple.");
  const c = await signedClaims(token, { jwks_uri: APPLE_KEYS_URL });
  const seconds = Math.floor(now / 1000);
  if (c.iss !== APPLE_ISSUER) throw new Error("That is not a token from Apple.");
  const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (!aud.some((a) => clientIds.includes(a))) throw new Error("The token from Apple is for a different app.");
  if (!Number.isFinite(c.exp) || c.exp + SKEW_SECONDS < seconds) throw new Error("The token from Apple has expired. Try again.");
  if (Number.isFinite(c.iat) && c.iat - SKEW_SECONDS > seconds) throw new Error("The token from Apple was issued in the future.");
  if (typeof c.sub !== "string" || !c.sub) throw new Error("The token from Apple names nobody.");
  if (typeof nonce !== "string" || !nonce || typeof c.nonce !== "string" || c.nonce.toLowerCase() !== (await sha256Hex(nonce))) {
    throw new Error("The token from Apple is not for this sign-in.");
  }
  return c;
}

const verified = (v) => v === true || v === "true";

async function link(env, subject, githubId, email) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO apple_identities (subject, user_github_id, email, created_at, last_login_at) VALUES (?1, ?2, ?3, ?4, ?4)
     ON CONFLICT(subject) DO UPDATE SET email = COALESCE(excluded.email, apple_identities.email), last_login_at = excluded.last_login_at`
  ).bind(subject, String(githubId), email || null, now).run();
}

/// Verify the token and sign the person in. The same answer as
/// /auth/otp/verify: { token, userId, login, orgId, created, inviteError? },
/// or { error, status }.
export async function signInWithApple(env, { identityToken, nonce, name, inviteCode, locale }) {
  let claims;
  try {
    claims = await verifyAppleToken(identityToken, { clientIds: appleClientIds(env), nonce });
  } catch (err) {
    return { error: err?.message || "Apple could not sign you in.", status: 401 };
  }
  const subject = claims.sub;
  const email = typeof claims.email === "string" && verified(claims.email_verified) ? claims.email.trim().toLowerCase() : null;

  // Linked before: that account, whatever address Apple now forwards to.
  const linked = await env.DB.prepare(
    "SELECT u.github_id, u.login FROM apple_identities a JOIN users u ON u.github_id = a.user_github_id WHERE a.subject = ?1"
  ).bind(subject).first();
  let user = linked;
  if (!user && email) {
    const byEmail = await env.DB.prepare("SELECT github_id, login, email_verified_at FROM users WHERE email = ?1").bind(email).first();
    if (byEmail) {
      // The same address is the same person only where it was proved here as
      // well (the rule SSO keeps, sso.js accountFor): an address someone typed
      // at a password sign-up and never received mail at is not enough.
      if (!byEmail.email_verified_at) {
        return { error: "An account with this address exists but has not proved it. Sign in with an email code once, then try again.", status: 409 };
      }
      user = byEmail;
    }
  }

  if (!user) {
    if (!email) {
      return { error: "Apple did not share an email address with us. Sign in with Apple again and share one (Hide My Email works), or use an email code.", status: 400 };
    }
    const displayName = typeof name === "string" ? name.trim().slice(0, MAX_NAME_CHARS) : undefined;
    const created = await signup(env, { email, name: displayName || undefined, inviteCode, locale, passwordless: true });
    if (created.error) return { error: created.error, status: 400 };
    // Apple proved the address, as a code would have.
    await env.DB.prepare("UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?2) WHERE github_id = ?1")
      .bind(created.userId, new Date().toISOString()).run();
    await link(env, subject, created.userId, email);
    return { ...created, created: true };
  }

  await link(env, subject, user.github_id, email);
  const token = await createSession(env.DB, user.github_id, EMAIL_AUTH_TOKEN);
  // An invitation means the same here as on every other way in; a bad one
  // does not cost the sign-in.
  let joined = null;
  let inviteError;
  if (typeof inviteCode === "string" && inviteCode.trim()) {
    const redeemed = await acceptInvite(env, { code: inviteCode.trim(), userId: user.github_id });
    if (redeemed.error) inviteError = redeemed.error;
    else if (!redeemed.pending) joined = redeemed.orgId;
  }
  return {
    token,
    userId: user.github_id,
    login: user.login,
    created: false,
    orgId: joined || (await primaryOrgId(env.DB, user.github_id)) || undefined,
    ...(inviteError ? { inviteError } : {}),
  };
}
