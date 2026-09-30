import { env } from "cloudflare:test";
import { afterEach, beforeEach, expect, test } from "vitest";
import schemaSql from "../schema.sql?raw";
import { useSecretKey, sealField, openField, sealLegacySecrets, isSealed } from "../src/secrets.js";
import { loadAISettings, saveAISettings } from "../src/orgAI.js";
import { createSession, getSession } from "../src/db.js";
import { getWorkspaceGitHub } from "../src/githubWorkspace.js";

// Secrets in D1 columns sealed under DATA_KEY: stored sealed, read back plain,
// old plaintext rows still read and then moved over, and a sealed value that
// is moved to another row does not open.

const KEY = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
const withKey = { ...env, DATA_KEY: KEY };

beforeEach(async () => {
  await env.DB.exec(schemaSql.replace(/\n/g, " "));
  await env.DB.exec("DELETE FROM org_ai_settings; DELETE FROM sessions; DELETE FROM org_github; DELETE FROM org_webhooks; DELETE FROM ai_teammates;");
  useSecretKey(withKey);
});
afterEach(() => useSecretKey({}));

test("a workspace's AI key is stored sealed and read back plain", async () => {
  await saveAISettings(env.DB, "team:a", { openaiKey: "sk-workspace-abcdefghijkl1234" }, "1");
  const row = await env.DB.prepare("SELECT openai_key FROM org_ai_settings WHERE org_id = 'team:a'").first();
  expect(isSealed(row.openai_key)).toBe(true);
  expect(row.openai_key).not.toContain("abcdefghijkl");
  expect((await loadAISettings(env.DB, "team:a")).openaiKey).toBe("sk-workspace-abcdefghijkl1234");
});

test("a sealed value copied to another workspace does not open there", async () => {
  await saveAISettings(env.DB, "team:a", { openaiKey: "sk-workspace-abcdefghijkl1234" }, "1");
  const { openai_key } = await env.DB.prepare("SELECT openai_key FROM org_ai_settings WHERE org_id = 'team:a'").first();
  await env.DB.prepare("INSERT INTO org_ai_settings (org_id, openai_key, updated_by, updated_at) VALUES ('team:b', ?1, '1', 'now')").bind(openai_key).run();
  expect((await loadAISettings(env.DB, "team:b")).openaiKey).toBeNull();
});

test("a session's GitHub token is sealed; the email marker is not", async () => {
  const token = await createSession(env.DB, "42", "gho_realtoken123");
  const raw = await env.DB.prepare("SELECT github_access_token FROM sessions WHERE token = ?1").bind(token).first();
  expect(isSealed(raw.github_access_token)).toBe(true);
  expect((await getSession(env.DB, token)).github_access_token).toBe("gho_realtoken123");

  const email = await createSession(env.DB, "43", "email-auth");
  const rawEmail = await env.DB.prepare("SELECT github_access_token FROM sessions WHERE token = ?1").bind(email).first();
  expect(rawEmail.github_access_token).toBe("email-auth");
  expect((await getSession(env.DB, email)).github_access_token).toBe("email-auth");
});

test("rows from before sealing read as they are, then get sealed", async () => {
  const at = new Date().toISOString();
  const later = new Date(Date.now() + 86_400_000).toISOString();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO org_ai_settings (org_id, openai_key, gemini_key, updated_by, updated_at) VALUES ('team:old', 'sk-old-abcdefghijklmnop', 'AIza-old-key-abcdefghij', '1', ?1)").bind(at),
    env.DB.prepare("INSERT INTO org_github (org_id, repo, token, connected_by, updated_at) VALUES ('team:old', 'o/r', 'ghp_oldtoken', '1', ?1)").bind(at),
    env.DB.prepare("INSERT INTO sessions (token, github_id, github_access_token, created_at, expires_at) VALUES ('s-old', '7', 'gho_old', ?1, ?2)").bind(at, later),
    env.DB.prepare("INSERT INTO sessions (token, github_id, github_access_token, created_at, expires_at) VALUES ('s-mail', '8', 'email-auth', ?1, ?2)").bind(at, later),
    env.DB.prepare("INSERT INTO org_webhooks (id, org_id, created_by, name, url, events, include_dms, secret, created_at) VALUES ('wh1', 'team:old', '1', 'n', 'https://x.test', '[]', 0, 'whsec_old', ?1)").bind(at),
  ]);
  expect((await loadAISettings(env.DB, "team:old")).openaiKey).toBe("sk-old-abcdefghijklmnop");
  expect((await getSession(env.DB, "s-old")).github_access_token).toBe("gho_old");

  const { sealed } = await sealLegacySecrets(withKey);
  expect(sealed).toBe(4);

  const ai = await env.DB.prepare("SELECT openai_key, typesafe_key, gemini_key FROM org_ai_settings WHERE org_id = 'team:old'").first();
  expect(isSealed(ai.openai_key)).toBe(true);
  expect(isSealed(ai.gemini_key)).toBe(true);
  expect(ai.typesafe_key).toBeNull();
  const s = await env.DB.prepare("SELECT token, github_access_token FROM sessions ORDER BY token").all();
  expect(s.results.map((r) => [r.token, isSealed(r.github_access_token)])).toEqual([["s-mail", false], ["s-old", true]]);
  const hook = await env.DB.prepare("SELECT secret FROM org_webhooks WHERE id = 'wh1'").first();
  expect(isSealed(hook.secret)).toBe(true);

  // Everything still reads the same.
  const settings = await loadAISettings(env.DB, "team:old");
  expect(settings.openaiKey).toBe("sk-old-abcdefghijklmnop");
  expect(settings.geminiKey).toBe("AIza-old-key-abcdefghij");
  expect((await getWorkspaceGitHub(env.DB, "team:old")).token).toBe("ghp_oldtoken");
  expect((await getSession(env.DB, "s-old")).github_access_token).toBe("gho_old");
  expect(await openField(hook.secret, "org_webhooks.secret:wh1")).toBe("whsec_old");

  // A second run finds nothing left.
  expect((await sealLegacySecrets(withKey)).sealed).toBe(0);
});

test("without a key, values pass through as before", async () => {
  useSecretKey({});
  expect(await sealField("plain", "x")).toBe("plain");
  expect(await openField("plain", "x")).toBe("plain");
  useSecretKey(withKey);
  const sealed = await sealField("plain", "x");
  useSecretKey({});
  expect(await openField(sealed, "x")).toBeNull();
});

test("an AI teammate's API key and GitHub token are sealed, read back plain, and old rows are moved over", async () => {
  const { loadTeammate } = await import("../src/teammates.js");
  const at = new Date().toISOString();
  await env.DB.prepare("INSERT INTO ai_teammates (org_id, provider, enabled, api_key, github_token, updated_at) VALUES ('team:a', 'claude', 0, 'sk-ant-plain123', 'ghp_plain456', ?1)").bind(at).run();
  expect((await loadTeammate(env.DB, "team:a", "claude")).apiKey).toBe("sk-ant-plain123");
  await sealLegacySecrets(withKey);
  const row = await env.DB.prepare("SELECT api_key, github_token FROM ai_teammates WHERE org_id = 'team:a'").first();
  expect(isSealed(row.api_key) && isSealed(row.github_token)).toBe(true);
  expect(row.api_key).not.toContain("plain123");
  const t = await loadTeammate(env.DB, "team:a", "claude");
  expect([t.apiKey, t.githubToken]).toEqual(["sk-ant-plain123", "ghp_plain456"]);
  // Another workspace's row does not open it.
  await env.DB.prepare("INSERT INTO ai_teammates (org_id, provider, enabled, api_key, updated_at) VALUES ('team:b', 'claude', 0, ?1, ?2)").bind(row.api_key, at).run();
  expect((await loadTeammate(env.DB, "team:b", "claude")).apiKey).toBeNull();
});
