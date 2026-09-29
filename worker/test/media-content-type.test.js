import { expect, test } from "vitest";
import { uploadMedia, serveMedia } from "../src/media.js";

// What comes back out of /media is served from the Worker's own origin, and
// what it is served *as* came straight off the upload's Content-Type header.
//
// So a valid session could store HTML and have this origin serve it as HTML —
// script running on the API's origin, from a URL that looks like ours, cached
// `public, immutable` by everything in between. The `<video>` element that
// makes GET /media unauthenticated needs a video and nothing else; there is no
// reason for this to be a general-purpose file host.
//
// Driven against the two functions rather than through SELF, and so against no
// bucket at all: the harness cannot pop R2's isolated storage once a file has
// written to it more than once, and media.test.js already spends that one
// write on the round trip.

function bucket() {
  const put = [];
  return {
    put,
    env: { MEDIA: { put: async (id, bytes, opts) => { put.push({ id, opts }); } } },
  };
}

function post(contentType, body = "abc") {
  // A string body makes Request set `text/plain` for you, which is not the
  // same thing as sending no type at all — bytes are how you actually send
  // none, and how an older client that set no header did.
  const payload = contentType === null ? new Uint8Array([1, 2, 3]) : body;
  return new Request("https://example.com/media", {
    method: "POST",
    headers: contentType ? { "content-type": contentType } : {},
    body: payload,
  });
}

const url = new URL("https://example.com/media");

test("the formats a camera produces are stored as themselves", async () => {
  for (const type of ["video/mp4", "video/quicktime", "video/webm"]) {
    const store = bucket();
    const res = await uploadMedia(post(type), store.env, url);
    expect(res.status).toBe(200);
    expect(store.put[0].opts.httpMetadata.contentType).toBe(type);
  }
});

test("a parameter on the header does not make it a different format", async () => {
  const store = bucket();
  const res = await uploadMedia(post("video/mp4; charset=binary"), store.env, url);
  expect(res.status).toBe(200);
  expect(store.put[0].opts.httpMetadata.contentType).toBe("video/mp4");
});

test("no header at all still means what it always meant", async () => {
  // Older builds sent none, and the route read that as mp4.
  const store = bucket();
  const res = await uploadMedia(post(null), store.env, url);
  expect(res.status).toBe(200);
  expect(store.put[0].opts.httpMetadata.contentType).toBe("video/mp4");
});

test("anything that is not a video is turned away, with the reason", async () => {
  for (const type of ["text/html", "image/svg+xml", "application/xhtml+xml", "text/plain"]) {
    const store = bucket();
    const res = await uploadMedia(post(type, "<svg/>"), store.env, url);
    expect(res.status).toBe(415);
    // Refused before a byte reaches the bucket.
    expect(store.put).toHaveLength(0);
    expect((await res.json()).message).toContain("video/mp4");
  }
});

test("an object stored before this was fussy is not served as a document", async () => {
  // The bucket predates the check, so whatever is already in it, the side that
  // decides what a browser does with those bytes is this one.
  const stored = (contentType) => ({
    MEDIA: {
      get: async () => ({ body: new Uint8Array([1, 2, 3]), httpMetadata: { contentType } }),
    },
  });

  for (const type of ["text/html", "image/svg+xml"]) {
    const res = await serveMedia("0f8e2c1a-3b4d-4e5f-8a9b-0c1d2e3f4a5b", stored(type));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/octet-stream");
  }

  const good = await serveMedia("1a2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d", stored("video/mp4"));
  expect(good.headers.get("content-type")).toBe("video/mp4");
  // And nothing downstream may sniff its way back to a document either.
  expect(good.headers.get("x-content-type-options")).toBe("nosniff");
});

test("a missing object is still a 404", async () => {
  const res = await serveMedia("gone", { MEDIA: { get: async () => null } });
  expect(res.status).toBe(404);
});

test("only a video this route stored is served: a file, an export or an avatar in the same bucket is not", async () => {
  const every = { MEDIA: { get: async () => ({ body: new Uint8Array([1]), httpMetadata: { contentType: "application/gzip" } }) } };
  for (const key of ["compliance-export-0f8e2c1a-3b4d-4e5f-8a9b-0c1d2e3f4a5b", "file-f_abc123", "jam/0f8e2c1a", "user-avatar-x", "../x"]) {
    expect((await serveMedia(key, every)).status).toBe(404);
  }
});
