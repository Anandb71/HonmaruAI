import { env } from "cloudflare:test";
import { fetchMock } from "./helpers/fetch-mock.js";
import { beforeEach, afterEach, expect, test } from "vitest";
import schemaSql from "../schema.sql?raw";
import worker from "../src/index.js";
import { messageLanguage, wantsTranslation } from "../src/translate.js";

// Each reader reads a conversation in their own language: a message in
// another language is translated for them, once, and kept.

const ORG = "cafe/translate";
const ctx = { waitUntil: (p) => p, passThroughOnException() {} };
const headers = (token) => ({ "content-type": "application/json", "x-session-token": token });
const call = (path, init, over = {}) => worker.fetch(new Request("https://example.com" + path, init), { ...env, OPENAI_API_KEY: "sk-test", ...over }, ctx);
const post = (path, token, body, over) => call(path, { method: "POST", headers: headers(token), body: JSON.stringify(body) }, over);
let toru; let mika;

beforeEach(async () => {
  await env.DB.exec(schemaSql.replace(/\n/g, " "));
  const { createSession, upsertUser, upsertMembership, upsertBusiness } = await import("../src/db.js");
  await upsertUser(env.DB, { githubId: "9901", login: "toru", name: "Toru", avatarUrl: null, locale: "ja" });
  await upsertUser(env.DB, { githubId: "9902", login: "mika", name: "Mika", avatarUrl: null, locale: "en" });
  await upsertMembership(env.DB, ORG, "9901", "admin");
  await upsertMembership(env.DB, ORG, "9902", "member");
  await upsertBusiness(env.DB, ORG, { name: "Cafe", createdBy: "9901" });
  toru = await createSession(env.DB, "9901", "a");
  mika = await createSession(env.DB, "9902", "b");
  fetchMock.activate();
});
afterEach(() => fetchMock.assertNoPendingInterceptors());

test("a message says the language it is in; names, links and emoji alone say none", () => {
  expect(messageLanguage("Autumn menu launches on the 1st")).toBe("en");
  expect(messageLanguage("ポスターの方向性をください")).toBe("ja");
  expect(messageLanguage("@hayao https://x.com/a 👍")).toBe(null);
  // Too short to name: translated into whatever language the reader set.
  expect(messageLanguage("hello!")).toBe("latn");
  expect(wantsTranslation("latn", "ja")).toBe(true);
  expect(wantsTranslation("latn", "es")).toBe(true);
  expect(wantsTranslation("ja", "ja-JP")).toBe(false);
  expect(wantsTranslation("en", "ja")).toBe(true);
});

test("the language the reader's screen is set to wins over the profile's", async () => {
  const said = (await (await post("/channels/messages", mika, { orgId: ORG, channel: "b:cafe", body: "hello!" })).json()).message;
  expect(said.lang).toBe("latn");
  let asked;
  fetchMock.get("https://api.openai.com").intercept({ path: "/v1/chat/completions", method: "POST" }).reply(200, (opts) => {
    asked = JSON.parse(opts.body);
    return { choices: [{ message: { content: JSON.stringify({ items: [{ id: said.id, text: "¡hola!" }] }) } }] };
  });
  // Toru's profile says Japanese; his screen says Spanish.
  const out = await (await post("/channels/translate", toru, { orgId: ORG, channel: "b:cafe", ids: [said.id], locale: "es" })).json();
  expect(out).toMatchObject({ locale: "es", translations: { [said.id]: "¡hola!" } });
  expect(asked.messages[1].content).toContain("Reader language: es");
});

test("a message in another language is translated for its reader, once; edited, it is translated again; off, never", async () => {
  const said = (await (await post("/channels/messages", toru, { orgId: ORG, channel: "b:cafe", body: "秋メニューは1日から、@Mika よろしく" })).json()).message;
  expect(said.lang).toBe("ja");
  const asked = [];
  fetchMock.get("https://api.openai.com").intercept({ path: "/v1/chat/completions", method: "POST" }).reply(200, (opts) => {
    const body = JSON.parse(opts.body);
    asked.push(body);
    const items = JSON.parse(body.messages[1].content.split("\n\n")[1]).items;
    return { choices: [{ message: { content: JSON.stringify({ items: items.map((i) => ({ id: i.id, text: i.text.startsWith("秋") ? "The autumn menu starts on the 1st, @Mika thanks" : "Fixed: starts on the 2nd" })) }) } }] };
  }).times(2);
  const translate = async (token, ids) => (await (await post("/channels/translate", token, { orgId: ORG, channel: "b:cafe", ids })).json());
  expect((await translate(mika, [said.id])).translations).toEqual({ [said.id]: "The autumn menu starts on the 1st, @Mika thanks" });
  expect(asked[0].messages[1].content).toContain("Reader language: en");
  expect(asked[0].messages[0].content).toContain("Keep exactly as written: @names");
  // Kept: asked again, no model.
  expect((await translate(mika, [said.id])).translations[said.id]).toContain("autumn menu");
  expect(asked).toHaveLength(1);
  // Toru reads Japanese: his own message needs nothing.
  expect((await translate(toru, [said.id])).translations).toEqual({});
  // Edited: translated again.
  const { editMessage } = await import("../src/channels.js");
  await editMessage(env.DB, { orgId: ORG, id: said.id, authorLogin: "toru", body: "修正：2日からです" });
  const again = await translate(mika, [said.id]);
  expect(again.translations[said.id]).toBe("Fixed: starts on the 2nd");
  expect(asked).toHaveLength(2);
  // Turned off: nothing translated for her.
  await call("/me", { method: "PUT", headers: headers(mika), body: JSON.stringify({ translateMessages: false }) });
  expect(await translate(mika, [said.id])).toMatchObject({ translations: {}, off: true });
  const me = await (await call("/me", { headers: headers(mika) })).json();
  expect(me.translateMessages).toBe(false);
});
