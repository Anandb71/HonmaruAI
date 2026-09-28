import { env } from "cloudflare:test";
import { expect, test } from "vitest";
import worker from "../src/index.js";

// What the iPhone app should be on: the oldest version the service still
// works with, and where to get a newer one. Open to anyone, signed in or not.

const ask = async (overrides = {}) => {
  const res = await worker.fetch(new Request("https://example.com/app/ios"), { ...env, ...overrides }, { waitUntil: () => {} });
  return { status: res.status, body: await res.json() };
};

test("with nothing set, no version is required and no link is made up", async () => {
  expect(await ask({ IOS_MIN_VERSION: undefined, IOS_APP_STORE_URL: undefined })).toEqual({ status: 200, body: { minimumVersion: null, storeUrl: null } });
});

test("a minimum and an App Store link are passed on; anything else is not", async () => {
  expect((await ask({ IOS_MIN_VERSION: "1.0.2", IOS_APP_STORE_URL: "https://apps.apple.com/jp/app/id123" })).body)
    .toEqual({ minimumVersion: "1.0.2", storeUrl: "https://apps.apple.com/jp/app/id123" });
  expect((await ask({ IOS_MIN_VERSION: "latest", IOS_APP_STORE_URL: "https://evil.example/app" })).body)
    .toEqual({ minimumVersion: null, storeUrl: null });
});
