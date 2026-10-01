import { env } from "cloudflare:test";
import { beforeEach, expect, test, vi } from "vitest";
import schemaSql from "../schema.sql?raw";
import { joined, message } from "./helpers.js";
import { memberRef } from "../src/team.js";
import { OrgRelay } from "../src/relay.js";
import { handleTyping, TYPING_BUDGET } from "../src/typing.js";

// "Aki is typing…": the relay passes it to whoever can read the conversation
// it is typed in, under the name they give it, and to nobody else — not the
// people outside a private channel, not a third person beside a direct
// conversation, and not the typist's own tabs.

const ORG = "typing-team";
const typing = (pred = () => true) => (m) => m.type === "CUSTOM" && m.name === "typing" && pred(m.value);
const say = (ws, payload, type = "typing") => ws.send(JSON.stringify({ type, payload }));
const now = () => new Date().toISOString();

/// A relay that only records what it would send, for the checks that
/// something is never sent: awaited to the end, nothing is left in flight.
/// Everybody has a socket open, and a stranger one that never joined.
function recorder(orgId = ORG) {
  const sent = [];
  const socket = (login, authed = true) => ({ login, deserializeAttachment: () => ({ orgId, userId: login, authed }) });
  const sockets = [socket("toru"), socket("mika"), socket("kenji"), socket(null, false)];
  return {
    sent,
    db: env.DB,
    state: { getWebSockets: () => sockets },
    constructor: { deliver: (ws, text) => sent.push({ to: ws.login, value: JSON.parse(text).value }) },
  };
}
const as = (login, githubId, orgId = ORG) => ({ orgId, userId: login, githubId, authed: true });

/// The database, losing the lookup of whether a channel is private from the
/// `from`th time it is asked: one query failed, as D1 fails one now and then.
function losing(db, from) {
  let asked = 0;
  return {
    prepare(sql) {
      if (!/FROM businesses/.test(sql) || (asked += 1) < from) return db.prepare(sql);
      return { bind: () => ({ first: () => Promise.reject(new Error("D1_ERROR: overloaded")) }) };
    },
  };
}

beforeEach(async () => {
  await env.DB.exec(schemaSql.replace(/\n/g, " "));
  await env.DB.prepare("DELETE FROM businesses WHERE org_id = ?1").bind(ORG).run();
  await env.DB.prepare("DELETE FROM conversation_members WHERE org_id = ?1").bind(ORG).run();
  const { createSession, upsertUser, upsertMembership } = await import("../src/db.js");
  await upsertUser(env.DB, { githubId: "3001", login: "toru", name: "Toru", avatarUrl: null, locale: "en" });
  await upsertUser(env.DB, { githubId: "3002", login: "mika", name: "Mika", avatarUrl: null, locale: "en" });
  await upsertUser(env.DB, { githubId: "3003", login: "kenji", name: "Kenji", avatarUrl: null, locale: "en" });
  for (const id of ["3001", "3002", "3003"]) await upsertMembership(env.DB, ORG, id, "member");
  // A private channel with Toru and Mika in it, and not Kenji.
  await env.DB.prepare("INSERT INTO businesses (org_id, slug, name, created_at, private) VALUES (?1, 'payroll', 'Payroll', ?2, 1)").bind(ORG, now()).run();
  for (const login of ["toru", "mika"]) {
    await env.DB.prepare("INSERT INTO conversation_members (org_id, channel, login, added_at) VALUES (?1, 'b:payroll', ?2, ?3)").bind(ORG, login, now()).run();
  }
  globalThis.__typT = await createSession(env.DB, "3001", "gho_t");
  globalThis.__typM = await createSession(env.DB, "3002", "gho_m");
  globalThis.__typK = await createSession(env.DB, "3003", "gho_k");
});

test("typing in a channel reaches the others there, with the thread it is in, and none of the typist's tabs", async () => {
  const toru = await joined(ORG, globalThis.__typT);
  const toruElsewhere = await joined(ORG, globalThis.__typT);
  const mika = await joined(ORG, globalThis.__typM);

  say(toru.ws, { channel: "b:general", parentId: null });
  const seen = await message(mika.messages, typing());
  expect(seen.value).toEqual({ channel: "b:general", parentId: null, who: { ref: await memberRef(ORG, "3001"), name: "Toru" } });

  // In a thread, which one; and done, said so.
  say(toru.ws, { channel: "b:general", parentId: "m-1" }, "typing_stop");
  const stopped = await message(mika.messages, typing((v) => v.stop));
  expect(stopped.value).toMatchObject({ channel: "b:general", parentId: "m-1", stop: true });

  expect(toru.messages.some(typing())).toBe(false);
  expect(toruElsewhere.messages.some(typing())).toBe(false);
});

test("a private channel's typing reaches its members and never anyone outside it", async () => {
  const toru = await joined(ORG, globalThis.__typT);
  const mika = await joined(ORG, globalThis.__typM);
  const kenji = await joined(ORG, globalThis.__typK);

  say(toru.ws, { channel: "b:payroll" });
  await message(mika.messages, typing((v) => v.channel === "b:payroll"));
  // Kenji hears typing where he can read, which comes after the payroll
  // one on the same socket: had that one been sent to him, it is here.
  say(toru.ws, { channel: "b:general" });
  await message(kenji.messages, typing((v) => v.channel === "b:general"));
  expect(kenji.messages.some(typing((v) => v.channel === "b:payroll"))).toBe(false);

  // Nor can he type into it: nobody is told anything.
  const r = recorder();
  await handleTyping(r, as("kenji", "3003"), "typing", { channel: "b:payroll" });
  expect(r.sent).toEqual([]);
  await handleTyping(r, as("toru", "3001"), "typing", { channel: "b:payroll" });
  expect(r.sent.map((s) => s.to)).toEqual(["mika"]);
});

test("a private channel's typing stays with its members when the database loses a query", async () => {
  // Who hears it is who the channel was resolved to, once: nothing is looked
  // up a second time that could fail and call the channel public.
  const r = recorder();
  r.db = losing(env.DB, 2);
  await handleTyping(r, as("toru", "3001"), "typing", { channel: "b:payroll" });
  expect(r.sent.map((s) => s.to)).toEqual(["mika"]);
});

test("a direct conversation's typing reaches the other one, under their name for it, and nobody beside it", async () => {
  const [toruRef, mikaRef] = await Promise.all([memberRef(ORG, "3001"), memberRef(ORG, "3002")]);
  const toru = await joined(ORG, globalThis.__typT);
  const mika = await joined(ORG, globalThis.__typM);
  const kenji = await joined(ORG, globalThis.__typK);

  say(toru.ws, { channel: `dm:${mikaRef}` });
  const seen = await message(mika.messages, typing());
  // Mika names it by the other person in it: Toru.
  expect(seen.value).toMatchObject({ channel: `dm:${toruRef}`, who: { ref: toruRef, name: "Toru" } });

  say(toru.ws, { channel: "b:general" });
  await message(kenji.messages, typing((v) => v.channel === "b:general"));
  expect(kenji.messages.some(typing((v) => v.channel.startsWith("dm:")))).toBe(false);

  // A direct conversation somebody is not in cannot even be named.
  const r = recorder();
  await handleTyping(r, as("kenji", "3003"), "typing", { channel: "dm:nobody" });
  expect(r.sent).toEqual([]);
});

test("a guest hears typing only in the channels they were let into", async () => {
  const GUESTS = "typing-guests";
  const { upsertMembership } = await import("../src/db.js");
  await upsertMembership(env.DB, GUESTS, "3001", "member");
  await upsertMembership(env.DB, GUESTS, "3002", "member");
  await upsertMembership(env.DB, GUESTS, "3003", "guest");
  await env.DB.prepare("INSERT OR IGNORE INTO conversation_members (org_id, channel, login, added_at) VALUES (?1, 'b:launch', 'kenji', ?2)").bind(GUESTS, now()).run();

  const r = recorder(GUESTS);
  await handleTyping(r, as("toru", "3001", GUESTS), "typing", { channel: "b:general" });
  expect(r.sent.map((s) => s.to)).toEqual(["mika"]);
  r.sent.length = 0;
  await handleTyping(r, as("toru", "3001", GUESTS), "typing", { channel: "b:launch" });
  expect(r.sent.map((s) => s.to).sort()).toEqual(["kenji", "mika"]);
});

test("a public channel's typing goes to everyone who joined but the typist, never to a socket that did not", async () => {
  const r = recorder();
  await handleTyping(r, as("toru", "3001"), "typing", { channel: "b:general", parentId: "m-1" });
  expect(r.sent.map((s) => s.to)).toEqual(["mika", "kenji"]);
  expect(r.sent[0].value).toMatchObject({ channel: "b:general", parentId: "m-1", who: { name: "Toru" } });
});

test("a thread named wrongly is dropped, not turned into the conversation", async () => {
  const r = recorder();
  for (const parentId of ["../x", 42, "x".repeat(81), { id: "m-1" }]) {
    await handleTyping(r, as("toru", "3001"), "typing", { channel: "b:payroll", parentId });
  }
  expect(r.sent).toEqual([]);
});

test("typing has an allowance of its own, and past it is dropped without a word", async () => {
  const r = new OrgRelay({ getWebSockets: () => [], acceptWebSocket() {} }, { DB: null });
  const sent = [];
  const ws = {
    deserializeAttachment: () => ({ orgId: "acme/web", userId: "octocat", agui: true, authed: true }),
    serializeAttachment() {},
    send: (t) => sent.push(t),
    close() { this.closed = true; },
  };
  // No database here: each one that is let through fails quietly too.
  const quiet = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    for (let i = 0; i < TYPING_BUDGET + 20; i += 1) {
      await r.webSocketMessage(ws, JSON.stringify({ type: "typing", payload: { channel: "b:general" } }));
    }
  } finally {
    quiet.mockRestore();
  }
  expect(sent).toEqual([]);
  expect(ws.closed).toBeUndefined();
  // Spent on typing, and only on typing.
  expect(r.overBudget("octocat", "typing")).toBe(true);
  expect(r.overBudget("octocat")).toBe(false);
});
