import { env } from "cloudflare:test";
import { fetchMock } from "./helpers/fetch-mock.js";
import { afterEach, beforeEach, expect, test } from "vitest";
import schemaSql from "../schema.sql?raw";
import worker from "../src/index.js";
import { translatedMessage } from "../src/localize.js";
import { readsDifferently } from "../src/language.js";
import { present, postMessage } from "../src/channels.js";
import { listMembers } from "../src/team.js";

// An agent's reply, asked for by one person, read by others in their own
// languages: made once per language, kept for the words as they stand, and
// shown to each reader in theirs.

const ORG = "team:babel";
const aiEnv = { ...env, OPENAI_API_KEY: "sk-test" };
let taro; let alice;
const pending = [];
const ctx = { waitUntil: (p) => pending.push(p) };
const call = async (path, token, { method = "GET", body } = {}) => {
  const res = await worker.fetch(new Request(`https://api.example.com${path}`, {
    method, headers: { "content-type": "application/json", "x-session-token": token }, ...(body ? { body: JSON.stringify(body) } : {}),
  }), aiEnv, ctx);
  while (pending.length) await pending.shift();
  return res;
};
const answer = (content) => fetchMock.get("https://api.openai.com")
  .intercept({ path: "/v1/chat/completions", method: "POST" })
  .reply(200, { choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 10 } });

beforeEach(async () => {
  await env.DB.exec(schemaSql.replace(/\n/g, " "));
  await env.DB.exec("DELETE FROM message_translations; DELETE FROM channel_messages; DELETE FROM rate_limits;");
  const { createSession, upsertUser, upsertMembership, upsertBusiness } = await import("../src/db.js");
  await upsertUser(env.DB, { githubId: "6101", login: "taro", name: "Taro", avatarUrl: null, locale: "ja" });
  await upsertUser(env.DB, { githubId: "6102", login: "alice", name: "Alice", avatarUrl: null, locale: "en" });
  await upsertMembership(env.DB, ORG, "6101", "owner");
  await upsertMembership(env.DB, ORG, "6102", "member");
  await upsertBusiness(env.DB, ORG, { name: "Cafe", createdBy: "6101" });
  taro = await createSession(env.DB, "6101", "a");
  alice = await createSession(env.DB, "6102", "b");
  fetchMock.activate();
});
afterEach(() => fetchMock.assertNoPendingInterceptors());

const reply = async (body, kind = "agent") => (await postMessage(env.DB, { orgId: ORG, key: "b:cafe", authorLogin: kind === "agent" ? "agent:x1" : null, body, kind })).row;
const shownTo = async (login, row) => {
  const members = await listMembers(env.DB, ORG, login === "taro" ? "6101" : "6102");
  return (await present(env.DB, ORG, [row], login, "b:cafe", members))[0];
};

test("only a reply in another language is translated", () => {
  expect(readsDifferently("The supplier can deliver on Friday.", "ja")).toBe(true);
  expect(readsDifferently("The supplier can deliver on Friday.", "en-US")).toBe(false);
  expect(readsDifferently("金曜日に納品できます。", "ja")).toBe(false);
  expect(readsDifferently("", "ja")).toBe(false);
  expect(readsDifferently("OK", null)).toBe(false);
});

test("made once for a language, kept, and shown to the reader who reads it — the writer's reader sees the original", async () => {
  const row = await reply("The supplier can deliver on Friday. Shall I confirm?");
  answer("仕入れ先は金曜日に納品できます。確定しますか？");
  const made = await translatedMessage(aiEnv, ORG, row, { locale: "ja", payerGithubId: "6101" });
  expect(made).toEqual({ lang: "ja", body: "仕入れ先は金曜日に納品できます。確定しますか？" });
  // From the store the second time: no model call.
  expect(await translatedMessage(aiEnv, ORG, row, { locale: "ja" })).toEqual(made);
  expect(await translatedMessage(aiEnv, ORG, row, { locale: "en" })).toBeNull();

  const forTaro = await shownTo("taro", row);
  expect(forTaro).toMatchObject({ lang: "en", translation: { lang: "ja", body: made.body } });
  expect(forTaro.body).toBe("The supplier can deliver on Friday. Shall I confirm?");
  const forAlice = await shownTo("alice", row);
  expect(forAlice).toMatchObject({ lang: "en", translation: null });

  // Changed words: the old translation is not shown for them.
  await env.DB.prepare("UPDATE channel_messages SET body = 'The supplier cannot deliver this week.' WHERE id = ?1").bind(row.id).run();
  const changed = await env.DB.prepare("SELECT * FROM channel_messages WHERE id = ?1").bind(row.id).first();
  expect((await shownTo("taro", changed)).translation).toBeNull();
});

test("the route translates only a reply the caller can see", async () => {
  const row = await reply("Order 40 bags of the house blend.");
  const person = (await postMessage(env.DB, { orgId: ORG, key: "b:cafe", authorLogin: "alice", body: "Order more coffee", kind: "message" })).row;
  answer("ハウスブレンドを40袋注文してください。");
  const res = await call("/channels/messages/translate", taro, { method: "POST", body: { orgId: ORG, channel: "b:cafe", messageId: row.id, locale: "ja" } });
  expect(await res.json()).toEqual({ translation: { lang: "ja", body: "ハウスブレンドを40袋注文してください。" } });
  expect((await call("/channels/messages/translate", taro, { method: "POST", body: { orgId: ORG, channel: "b:cafe", messageId: person.id } })).status).toBe(400);
  expect((await call("/channels/messages/translate", taro, { method: "POST", body: { orgId: ORG, channel: "b:nope", messageId: row.id } })).status).toBe(404);
  // Already in the reader's language: nothing to do, nothing asked.
  expect(await (await call("/channels/messages/translate", alice, { method: "POST", body: { orgId: ORG, channel: "b:cafe", messageId: row.id } })).json()).toEqual({ translation: null });
});
