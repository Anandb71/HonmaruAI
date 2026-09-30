// Firebase Cloud Messaging (HTTP v1), for Android phones.
//
// The same shape as apns.js, and the same reason for having no dependency:
// Google authenticates a server with an OAuth access token, which it hands out
// in exchange for an RS256 JWT signed with a service account's private key.
// Workers ship Web Crypto, so that is one `crypto.subtle.sign` and one POST —
// no Google SDK, which would not run here anyway.
//
// The service account is one secret, FCM_SERVICE_ACCOUNT: the JSON file the
// Firebase console downloads (Project settings → Service accounts → Generate
// new private key). Without it, Android tokens are skipped silently, the way
// iPhones are when the APNs key is not set.
//
// The access token lives an hour. It is cached in module scope until five
// minutes before it expires, so a cron run that pushes a hundred messages asks
// Google for one token, not a hundred.

import { base64url } from "./apns.js";

const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const EXPIRY_MARGIN_MS = 5 * 60 * 1000;

let cached = null; // { accessToken, expiresAt, clientEmail }

function base64urlJSON(object) {
  return base64url(new TextEncoder().encode(JSON.stringify(object)));
}

/// The service account, read from the secret. Pasted as JSON, or as base64 of
/// the JSON (what survives some CI secret stores). Null when it is unset or is
/// not a service account, so a mistyped secret reads as "not configured" and
/// never as a crash on the path of every push.
export function serviceAccount(env) {
  const raw = env?.FCM_SERVICE_ACCOUNT;
  if (!raw) return null;
  let text = String(raw).trim();
  try {
    if (!text.startsWith("{")) text = atob(text);
    const account = JSON.parse(text);
    if (!account?.client_email || !account?.private_key || !account?.project_id) return null;
    return account;
  } catch {
    return null;
  }
}

export function isFcmConfigured(env) {
  return Boolean(serviceAccount(env));
}

/// An FCM registration token: letters, digits, and `-_:`, usually around 160
/// characters. It goes into a JSON body rather than a URL path, so the check
/// is less about safety than about keeping an APNs token (or garbage) from
/// being filed as an Android phone.
export function isFcmToken(value) {
  return typeof value === "string" && /^[A-Za-z0-9_:-]{32,4096}$/.test(value);
}

// The private key in the JSON is PKCS#8 PEM with real newlines once parsed.
// A key pasted through a shell sometimes keeps a literal "\n" instead, so both
// spellings are accepted, as apns.js does for its .p8.
function derFromPEM(pem) {
  const body = String(pem)
    .replace(/\\n/g, "\n")
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/// The JWT Google trades for an access token: signed by the service account,
/// asking for the one scope sending needs, valid for the hour Google allows.
export async function assertion(account, now = Date.now()) {
  const key = await crypto.subtle.importKey(
    "pkcs8",
    derFromPEM(account.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const iat = Math.floor(now / 1000);
  const header = base64urlJSON({ alg: "RS256", typ: "JWT", ...(account.private_key_id ? { kid: account.private_key_id } : {}) });
  const claims = base64urlJSON({ iss: account.client_email, scope: SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600 });
  const signingInput = `${header}.${claims}`;
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64url(signature)}`;
}

/// An OAuth access token for sending, from the cache while it has more than
/// five minutes left. Throws when Google will not give one; sendFcm catches.
export async function accessToken(env, now = Date.now()) {
  const account = serviceAccount(env);
  if (!account) throw new Error("FCM_SERVICE_ACCOUNT is not set");
  if (cached && cached.clientEmail === account.client_email && now < cached.expiresAt - EXPIRY_MARGIN_MS) {
    return cached.accessToken;
  }
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: await assertion(account, now),
    }).toString(),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.access_token) {
    throw new Error(`Google refused the service account (${res.status} ${data?.error || ""})`.trim());
  }
  const lifetime = Number(data.expires_in) > 0 ? Number(data.expires_in) * 1000 : 3600 * 1000;
  cached = { accessToken: data.access_token, expiresAt: now + lifetime, clientEmail: account.client_email };
  return cached.accessToken;
}

/// Only for tests, and for the case where the service account is rotated.
export function resetAccessToken() {
  cached = null;
}

/// Send one message to one Android phone.
///
/// FCM data values must all be strings, so everything in `data` is stringified
/// here rather than trusted to arrive that way.
///
/// It is a data-only message, on purpose. expo-notifications on the phone
/// presents it itself, in every app state, from these keys: `title`,
/// `message` (the text shown), `channelId`, `tag` (a notification with the
/// same tag replaces the one in the tray), and `body` — a JSON string that
/// becomes the notification's `data` in the app, where a tap reads where to
/// go. A "notification" message would be drawn by the system instead while
/// the app is in the background, and its tap would reach the app without
/// that data.
///
/// Returns `{ ok, status, reason }` and never throws, for the reason
/// apns.js gives: a push is a courtesy on top of something already stored.
export async function sendFcm(env, { token, title, text, data = {}, tag, channelId = "messages", priority = "high", ttlSeconds = 86400 }) {
  try {
    const account = serviceAccount(env);
    if (!account) return { ok: false, status: 0, reason: "not-configured" };
    const strings = Object.fromEntries(
      Object.entries(data).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)])
    );
    const message = {
      token,
      data: {
        ...strings,
        ...(title ? { title: String(title) } : {}),
        ...(text ? { message: String(text) } : {}),
        body: JSON.stringify(data),
        channelId,
        ...(tag ? { tag: String(tag) } : {}),
      },
      android: {
        priority: priority === "high" ? "HIGH" : "NORMAL",
        ttl: `${Math.max(0, Math.floor(ttlSeconds))}s`,
        // While the phone is offline, only the newest message per
        // conversation is kept: one arrival, not a burst of stale ones.
        ...(tag ? { collapse_key: String(tag).slice(0, 128) } : {}),
      },
    };
    const send = async () => fetch(
      `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(account.project_id)}/messages:send`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${await accessToken(env)}`, "content-type": "application/json" },
        body: JSON.stringify({ message }),
        signal: AbortSignal.timeout(15_000),
      }
    );
    let res = await send();
    // A token revoked early (the key was rotated, say): mint a fresh one once.
    if (res.status === 401) {
      resetAccessToken();
      res = await send();
    }
    if (res.ok) return { ok: true, status: res.status };
    let reason = "";
    try {
      const body = await res.json();
      const details = body?.error?.details || [];
      reason = details.find((d) => d?.errorCode)?.errorCode || body?.error?.status || "";
    } catch {
      reason = "";
    }
    return { ok: false, status: res.status, reason };
  } catch (err) {
    console.error("fcm send failed", err?.message || err);
    return { ok: false, status: 0, reason: "exception" };
  }
}

/// The app was uninstalled, or the token was replaced: FCM answers 404 with
/// UNREGISTERED. The caller deletes it rather than retrying it forever.
export function isDeadFcmToken({ status, reason }) {
  return status === 404 || reason === "UNREGISTERED";
}
