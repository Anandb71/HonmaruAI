import { env } from "cloudflare:test";
import { beforeEach, expect, test } from "vitest";
import schemaSql from "../schema.sql?raw";
import worker from "../src/index.js";

// Threads you are in, newest reply first; read and unread across devices.

const ORG = "personal:threads";
let toru; let mika; let kenji;
const ctx = { waitUntil: () => {} };
const call = async (path, token, { method = "GET", body } = {}) => worker.fetch(new Request(`https://example.com${path}`, {
  method, headers: { "content-type": "application/json", "x-session-token": token }, body: body ? JSON.stringify(body) : undefined,
}), env, ctx);
const say = async (token, text, parentId) => (await (await call("/channels/messages", token, { method: "POST", body: { orgId: ORG, channel: "b:cafe", body: text, parentId } })).json()).message;
const threads = async (token) => (await (await call(`/channels/threads?orgId=${encodeURIComponent(ORG)}`, token)).json()).threads;
const pause = () => new Promise((r) => setTimeout(r, 5));

beforeEach(async () => {
  await env.DB.exec(schemaSql.replace(/\n/g, " "));
  const { createSession, upsertUser, upsertMembership, upsertBusiness } = await import("../src/db.js");
  for (const [id, login, name] of [["6601", "toru", "Toru"], ["6602", "mika", "Mika"], ["6603", "kenji", "Kenji"]]) {
    await upsertUser(env.DB, { githubId: id, login, name, avatarUrl: null, locale: "en" });
    await upsertMembership(env.DB, ORG, id, "member");
  }
  await upsertBusiness(env.DB, ORG, { name: "Cafe", createdBy: "6601" });
  toru = await createSession(env.DB, "6601", "gho_t");
  mika = await createSession(env.DB, "6602", "gho_m");
  kenji = await createSession(env.DB, "6603", "gho_k");
});

test("the threads you are in, newest reply first, and whether one is new", async () => {
  const beans = await say(toru, "New beans?");
  await pause();
  const hours = await say(mika, "Opening hours");
  await pause();
  await say(mika, "Ethiopian", beans.id);
  await pause();
  await say(kenji, "Nobody asked me", hours.id);
  await pause();
  // Toru started one; Mika is in both.
  expect((await threads(toru)).map((x) => x.parent.body)).toEqual(["New beans?"]);
  const forMika = await threads(mika);
  expect(forMika.map((x) => x.parent.body)).toEqual(["Opening hours", "New beans?"]);
  expect(forMika[0]).toMatchObject({ replyCount: 1, unread: true });
  expect(forMika[1].unread).toBe(false); // her own reply is the last word
  // Kenji is named in a reply: now he is in it.
  expect((await threads(kenji)).map((x) => x.parent.body)).toEqual(["Opening hours"]);
  await say(mika, "@Kenji roast date?", beans.id);
  expect((await threads(kenji)).map((x) => x.parent.body)).toEqual(["New beans?", "Opening hours"]);

  // Read on one device, read everywhere.
  const t0 = (await threads(toru))[0];
  expect(t0.unread).toBe(true);
  expect(t0.replies.map((r) => r.body)).toEqual(["Ethiopian", "@Kenji roast date?"]);
  await call("/channels/read", toru, { method: "POST", body: { orgId: ORG, channel: "b:cafe", thread: beans.id } });
  expect((await threads(toru))[0].unread).toBe(false);
  // And back to unread from a reply.
  const reply = t0.replies[0];
  const back = await call("/channels/unread", toru, { method: "POST", body: { orgId: ORG, channel: "b:cafe", messageId: reply.id } });
  expect((await back.json()).thread).toBe(beans.id);
  expect((await threads(toru))[0].unread).toBe(true);
});

test("mark unread moves a conversation's read position back", async () => {
  const a = await say(mika, "one");
  await pause();
  await say(mika, "two");
  await call("/channels/read", toru, { method: "POST", body: { orgId: ORG, channel: "b:cafe" } });
  const res = await call("/channels/unread", toru, { method: "POST", body: { orgId: ORG, channel: "b:cafe", messageId: a.id } });
  const { lastReadAt } = await res.json();
  expect(lastReadAt < a.createdAt).toBe(true);
  const list = await (await call(`/channels?orgId=${encodeURIComponent(ORG)}`, toru)).json();
  expect(list.reads["b:cafe"]).toBe(lastReadAt);
  expect((await call("/channels/unread", toru, { method: "POST", body: { orgId: ORG, channel: "b:cafe", messageId: "nope" } })).status).toBe(404);
});

// Activity and Threads are two views of the same replies: read in either,
// no longer new in the other.
test("a reply read in Activity is read in Threads, and a thread read clears its replies in Activity", async () => {
  const activity = async (token) => (await (await call(`/channels/activity?orgId=${encodeURIComponent(ORG)}`, token)).json()).items;
  const beans = await say(toru, "New beans?");
  await pause();
  const first = await say(mika, "Ethiopian", beans.id);
  await pause();
  expect((await threads(toru))[0].unread).toBe(true);
  const item = (await activity(toru)).find((i) => i.message.id === first.id);
  expect(item).toMatchObject({ type: "reply", unread: true });

  // Looked at in Activity: gone from Threads too, and said so for other devices.
  const seen = await (await call("/channels/read", toru, { method: "POST", body: { orgId: ORG, channel: "activity", items: [item.key] } })).json();
  expect(seen.threads).toEqual([{ thread: beans.id, lastReadAt: first.createdAt }]);
  expect((await threads(toru))[0].unread).toBe(false);

  // A later reply is new in both, until read in either.
  await pause();
  const second = await say(kenji, "or Kenyan", beans.id);
  expect((await threads(toru))[0].unread).toBe(true);
  expect((await activity(toru)).find((i) => i.message.id === second.id).unread).toBe(true);
  await call("/channels/read", toru, { method: "POST", body: { orgId: ORG, channel: "b:cafe", thread: beans.id } });
  expect((await activity(toru)).find((i) => i.message.id === second.id).unread).toBe(false);
  expect((await threads(toru))[0].unread).toBe(false);

  // A reply in a conversation this person cannot read moves nothing.
  const { upsertBusiness } = await import("../src/db.js");
  await upsertBusiness(env.DB, ORG, { name: "Board", createdBy: "6602" });
  await env.DB.prepare("UPDATE businesses SET private = 1 WHERE org_id = ?1 AND slug = 'board'").bind(ORG).run();
  await env.DB.prepare("INSERT INTO conversation_members (org_id, channel, login, added_at) VALUES (?1, 'b:board', 'mika', ?2)").bind(ORG, new Date().toISOString()).run().catch(() => {});
  const secret = await (await call("/channels/messages", mika, { method: "POST", body: { orgId: ORG, channel: "b:board", body: "secret" } })).json();
  const secretReply = await (await call("/channels/messages", mika, { method: "POST", body: { orgId: ORG, channel: "b:board", body: "reply", parentId: secret.message?.id } })).json();
  expect(secretReply.message?.parentId).toBe(secret.message.id);
  const other = await (await call("/channels/read", toru, { method: "POST", body: { orgId: ORG, channel: "activity", items: [`m:${secretReply.message.id}`] } })).json();
  expect(other.threads).toEqual([]);
});
