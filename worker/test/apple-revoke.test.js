import { env } from "cloudflare:test";
import { afterEach, beforeAll, beforeEach, expect, test } from "vitest";
import worker from "../src/index.js";
import { forgetProviderDocs } from "../src/sso.js";
import { sha256Hex } from "../src/auth.js";
import { appleClientSecret, keepRefreshToken } from "../src/apple.js";
import { isSealed, openField, useSecretKey } from "../src/secrets.js";
import { fetchMock } from "./helpers/fetch-mock.js";

// Sign in with Apple's other end (src/apple.js): the app's authorization code
// traded for a refresh token and kept sealed, and that token revoked at Apple
// when the account is deleted — against a pretend Apple that checks the client
// secret the way Apple would. Neither half may cost the person their sign-in
// or their deletion.

const pending = [];
const ctx = { waitUntil: (p) => pending.push(p) };
const enc = new TextEncoder();
const dec = new TextDecoder();
const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const APPLE = "https://appleid.apple.com";
const SUBJECT = "001234.abcdef.0001";
const DATA_KEY = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));

let appleKeys; let jwks; let signinKey; let pem;
// Every path asked of Apple, so a test can say a call was never made.
const asked = [];

async function signRS(payload) {
  const head = b64url(enc.encode(JSON.stringify({ alg: "RS256", kid: "apple-1" })));
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign({ name: "RSASSA-PKCS1-v1_5" }, appleKeys.privateKey, enc.encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(sig)}`;
}

async function appleToken(nonce, over = {}) {
  const now = Math.floor(Date.now() / 1000);
  return signRS({
    iss: APPLE, aud: "com.honmaru.ai.poc", sub: SUBJECT,
    email: "new@privaterelay.appleid.com", email_verified: "true",
    nonce: await sha256Hex(nonce), iat: now, exp: now + 600, ...over,
  });
}

// What Apple's token endpoint answers: an id_token it signs (its signature is
// not what is checked here) naming the person, and the tokens.
const idTokenFor = (sub) => `${b64url(enc.encode("{\"alg\":\"RS256\"}"))}.${b64url(enc.encode(JSON.stringify({ iss: APPLE, sub })))}.sig`;

const configured = { DATA_KEY, APPLE_SIGNIN_KEY: "", APPLE_SIGNIN_KEY_ID: "KEY1234567", APPLE_TEAM_ID: "TEAM123456" };
const withKey = () => ({ ...env, ...configured, APPLE_SIGNIN_KEY: pem });

async function call(path, init, extraEnv) {
  const res = await worker.fetch(new Request(`https://api.example.com${path}`, init), { ...env, ...extraEnv }, ctx);
  while (pending.length) await pending.shift();
  return { status: res.status, body: await res.json() };
}

const signIn = (body, extraEnv) => call("/auth/apple", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
}, extraEnv);
const deleteAccount = (token, extraEnv) => call("/account", { method: "DELETE", headers: { "x-session-token": token } }, extraEnv);

/// A client secret Apple would accept: its header, its claims, and an ES256
/// signature that holds under the public half of our key.
async function expectValidSecret(secret, clientId) {
  const [h, c, s] = secret.split(".");
  expect(JSON.parse(dec.decode(unb64url(h)))).toEqual({ alg: "ES256", kid: "KEY1234567" });
  const claims = JSON.parse(dec.decode(unb64url(c)));
  expect(claims).toMatchObject({ iss: "TEAM123456", aud: APPLE, sub: clientId });
  const now = Math.floor(Date.now() / 1000);
  expect(Math.abs(claims.iat - now)).toBeLessThan(60);
  expect(claims.exp - claims.iat).toBe(300);
  expect(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, signinKey.publicKey, unb64url(s), enc.encode(`${h}.${c}`))).toBe(true);
}

/// Apple's token endpoint, once: checks the form it is sent and answers with
/// `answer` (a status and a body), or Apple's tokens for `sub`.
function expectExchange({ code = "code-1", sub = SUBJECT, status = 200, answer } = {}) {
  const seen = {};
  fetchMock.get(APPLE).intercept({ path: "/auth/token", method: "POST" }).reply(async (opts) => {
    Object.assign(seen, Object.fromEntries(new URLSearchParams(opts.body)));
    seen.contentType = opts.headers["content-type"];
    expect(seen).toMatchObject({ grant_type: "authorization_code", code, client_id: "com.honmaru.ai.poc" });
    return { statusCode: status, data: answer || { access_token: "at", token_type: "Bearer", expires_in: 3600, refresh_token: "rt-secret", id_token: idTokenFor(sub) } };
  });
  return seen;
}

beforeAll(async () => {
  appleKeys = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  jwks = [{ ...(await crypto.subtle.exportKey("jwk", appleKeys.publicKey)), kid: "apple-1", alg: "RS256", use: "sig" }];
  // Our Sign in with Apple key, as the .p8 Apple hands out: PKCS#8 PEM.
  signinKey = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const der = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey("pkcs8", signinKey.privateKey))));
  pem = `-----BEGIN PRIVATE KEY-----\n${der.match(/.{1,64}/g).join("\n")}\n-----END PRIVATE KEY-----`;
  fetchMock.activate();
  const mocked = globalThis.fetch;
  globalThis.fetch = (input, init) => { asked.push(new URL(typeof input === "string" ? input : input.url).pathname); return mocked(input, init); };
  fetchMock.get(APPLE).intercept({ path: "/auth/keys", method: "GET" }).reply(200, () => ({ keys: jwks })).persist();
});

beforeEach(() => {
  forgetProviderDocs();
  asked.length = 0;
});
afterEach(() => {
  fetchMock.assertNoPendingInterceptors();
  useSecretKey({});
});

test("the client secret is an ES256 JWT Apple would accept", async () => {
  await expectValidSecret(await appleClientSecret(withKey(), "com.honmaru.ai"), "com.honmaru.ai");
  // A key pasted with literal \n, the way it survives a shell, is the same key.
  const flat = { ...withKey(), APPLE_SIGNIN_KEY: pem.replace(/\n/g, "\\n") };
  await expectValidSecret(await appleClientSecret(flat, "com.honmaru.ai.poc"), "com.honmaru.ai.poc");
});

test("the code is traded at sign-in and the refresh token kept sealed", async () => {
  const seen = expectExchange();
  const r = await signIn({ identityToken: await appleToken("n"), nonce: "n", authorizationCode: "code-1" }, withKey());
  expect(r.status).toBe(200);
  expect(seen.contentType).toMatch(/application\/x-www-form-urlencoded/);
  await expectValidSecret(seen.client_secret, "com.honmaru.ai.poc");
  const row = await env.DB.prepare("SELECT refresh_token, client_id FROM apple_identities WHERE subject = ?1").bind(SUBJECT).first();
  expect(row.client_id).toBe("com.honmaru.ai.poc");
  expect(isSealed(row.refresh_token)).toBe(true);
  expect(row.refresh_token).not.toContain("rt-secret");
  useSecretKey({ DATA_KEY });
  expect(await openField(row.refresh_token, `apple_identities.refresh_token:${SUBJECT}`)).toBe("rt-secret");
  // Sealed for this row: under another subject it does not open.
  expect(await openField(row.refresh_token, "apple_identities.refresh_token:someone-else")).toBeNull();
});

test("Apple refusing the code does not cost the sign-in", async () => {
  expectExchange({ status: 400, answer: { error: "invalid_grant" } });
  const r = await signIn({ identityToken: await appleToken("n"), nonce: "n", authorizationCode: "code-1" }, withKey());
  expect(r.status).toBe(200);
  expect(r.body.token).toBeTruthy();
  const row = await env.DB.prepare("SELECT refresh_token FROM apple_identities WHERE subject = ?1").bind(SUBJECT).first();
  expect(row.refresh_token).toBeNull();
});

test("Apple unreachable does not cost the sign-in", async () => {
  fetchMock.get(APPLE).intercept({ path: "/auth/token", method: "POST" }).replyWithError(new Error("connection reset"));
  const r = await signIn({ identityToken: await appleToken("n"), nonce: "n", authorizationCode: "code-1" }, withKey());
  expect(r.status).toBe(200);
});

test("a code for somebody else's Apple account is not kept", async () => {
  expectExchange({ sub: "009999.other.0001" });
  const r = await signIn({ identityToken: await appleToken("n"), nonce: "n", authorizationCode: "code-1" }, withKey());
  expect(r.status).toBe(200);
  const row = await env.DB.prepare("SELECT refresh_token FROM apple_identities WHERE subject = ?1").bind(SUBJECT).first();
  expect(row.refresh_token).toBeNull();
});

test("without the key, or without a code, nothing is traded", async () => {
  // No interceptor for /auth/token: a call to it would throw and be logged,
  // so the answers themselves say it was never made.
  expect(await keepRefreshToken({ ...env }, { subject: SUBJECT, clientId: "com.honmaru.ai", code: "c" })).toEqual({ kept: false, reason: "no-key" });
  expect(await keepRefreshToken(withKey(), { subject: SUBJECT, clientId: "com.honmaru.ai" })).toEqual({ kept: false, reason: "no-code" });
  const r = await signIn({ identityToken: await appleToken("n"), nonce: "n", authorizationCode: "code-1" });
  expect(r.status).toBe(200);
  expect(asked).not.toContain("/auth/token");
});

test("deleting the account revokes the refresh token at Apple first", async () => {
  expectExchange();
  const r = await signIn({ identityToken: await appleToken("n"), nonce: "n", authorizationCode: "code-1" }, withKey());
  const seen = {};
  fetchMock.get(APPLE).intercept({ path: "/auth/revoke", method: "POST" }).reply(async (opts) => {
    Object.assign(seen, Object.fromEntries(new URLSearchParams(opts.body)));
    // The rows are still there when Apple is asked.
    seen.rowThen = await env.DB.prepare("SELECT subject FROM apple_identities WHERE subject = ?1").bind(SUBJECT).first();
    return { statusCode: 200, data: "" };
  });
  const gone = await deleteAccount(r.body.token, withKey());
  expect(gone.status).toBe(200);
  expect(seen).toMatchObject({ client_id: "com.honmaru.ai.poc", token: "rt-secret", token_type_hint: "refresh_token" });
  expect(seen.rowThen).toBeTruthy();
  await expectValidSecret(seen.client_secret, "com.honmaru.ai.poc");
  expect(await env.DB.prepare("SELECT subject FROM apple_identities WHERE subject = ?1").bind(SUBJECT).first()).toBeNull();
  expect(await env.DB.prepare("SELECT github_id FROM users WHERE github_id = ?1").bind(r.body.userId).first()).toBeNull();
});

test("Apple refusing the revocation does not keep the account alive", async () => {
  expectExchange();
  const r = await signIn({ identityToken: await appleToken("n"), nonce: "n", authorizationCode: "code-1" }, withKey());
  fetchMock.get(APPLE).intercept({ path: "/auth/revoke", method: "POST" }).reply(400, { error: "invalid_client" });
  expect((await deleteAccount(r.body.token, withKey())).status).toBe(200);
  expect(await env.DB.prepare("SELECT subject FROM apple_identities WHERE subject = ?1").bind(SUBJECT).first()).toBeNull();
  expect(await env.DB.prepare("SELECT github_id FROM users WHERE github_id = ?1").bind(r.body.userId).first()).toBeNull();
});

test("Apple unreachable at deletion does not keep the account alive", async () => {
  expectExchange();
  const r = await signIn({ identityToken: await appleToken("n"), nonce: "n", authorizationCode: "code-1" }, withKey());
  fetchMock.get(APPLE).intercept({ path: "/auth/revoke", method: "POST" }).replyWithError(new Error("connection reset"));
  expect((await deleteAccount(r.body.token, withKey())).status).toBe(200);
  expect(await env.DB.prepare("SELECT github_id FROM users WHERE github_id = ?1").bind(r.body.userId).first()).toBeNull();
});

test("with the key gone by deletion time, the account still goes", async () => {
  expectExchange();
  const r = await signIn({ identityToken: await appleToken("n"), nonce: "n", authorizationCode: "code-1" }, withKey());
  // No revoke interceptor: without the key there is no client secret to ask with.
  expect((await deleteAccount(r.body.token, { DATA_KEY })).status).toBe(200);
  expect(asked).not.toContain("/auth/revoke");
  expect(await env.DB.prepare("SELECT github_id FROM users WHERE github_id = ?1").bind(r.body.userId).first()).toBeNull();
});

test("a sign-in from before tokens were kept has nothing to revoke", async () => {
  const r = await signIn({ identityToken: await appleToken("n"), nonce: "n" });
  expect(r.status).toBe(200);
  // The key is there, but no token: Apple is not called.
  expect((await deleteAccount(r.body.token, withKey())).status).toBe(200);
  expect(asked).not.toContain("/auth/revoke");
  expect(await env.DB.prepare("SELECT github_id FROM users WHERE github_id = ?1").bind(r.body.userId).first()).toBeNull();
});
