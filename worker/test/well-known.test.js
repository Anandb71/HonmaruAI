import { env } from "cloudflare:test";
import { expect, test } from "vitest";
import worker from "../src/index.js";

// The files that let the phone apps open links to the web app
// (src/wellKnown.js): made from the Worker's variables, JSON, no redirect.

const ctx = { waitUntil: () => {} };
const get = (path, vars = {}, method = "GET") =>
  worker.fetch(new Request(`https://api.example.com${path}`, { method, redirect: "manual" }), { ...env, ...vars }, ctx);

const FP = "14:6D:E9:83:51:7F:66:01:84:93:4F:2F:5E:E0:8F:3A:D6:F4:CA:41:1A:CF:45:BF:8D:10:76:76:CD:00:11:22";

test("apple-app-site-association names both apps under the Team ID, for /c/ and /join/", async () => {
  const res = await get("/.well-known/apple-app-site-association", { APPLE_TEAM_ID: "abcde12345" });
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("application/json");
  expect(res.headers.get("location")).toBeNull();
  expect(await res.json()).toEqual({
    applinks: {
      details: [{
        appIDs: ["ABCDE12345.com.honmaru.ai", "ABCDE12345.com.honmaru.ai.poc"],
        components: [{ "/": "/c/*" }, { "/": "/join/*" }],
      }],
    },
  });
});

test("without a Team ID there is no association to serve", async () => {
  expect((await get("/.well-known/apple-app-site-association", { APPLE_TEAM_ID: "" })).status).toBe(404);
  expect((await get("/.well-known/apple-app-site-association", { APPLE_TEAM_ID: "not a team" })).status).toBe(404);
});

test("assetlinks.json names both packages with every fingerprint", async () => {
  const bare = "AABBCCDDEEFF00112233445566778899AABBCCDDEEFF00112233445566778899";
  const res = await get("/.well-known/assetlinks.json", { ANDROID_CERT_SHA256: ` ${FP.toLowerCase()} ,${bare}, junk` });
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("application/json");
  const body = await res.json();
  expect(body.map((s) => s.target.package_name)).toEqual(["com.honmaru.ai", "com.honmaru.ai.poc"]);
  for (const statement of body) {
    expect(statement.relation).toEqual(["delegate_permission/common.handle_all_urls"]);
    expect(statement.target.namespace).toBe("android_app");
    expect(statement.target.sha256_cert_fingerprints).toEqual([FP, bare.match(/.{2}/g).join(":")]);
  }
});

test("without fingerprints there is no assetlinks.json", async () => {
  expect((await get("/.well-known/assetlinks.json", { ANDROID_CERT_SHA256: "" })).status).toBe(404);
});

test("HEAD answers, other methods and paths fall through", async () => {
  const head = await get("/.well-known/assetlinks.json", { ANDROID_CERT_SHA256: FP }, "HEAD");
  expect(head.status).toBe(200);
  expect((await get("/.well-known/assetlinks.json", { ANDROID_CERT_SHA256: FP }, "POST")).status).not.toBe(200);
  expect((await get("/.well-known/security.txt")).status).toBe(404);
});
