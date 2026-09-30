/// The two files that let the phone apps open links to the web app
/// (docs/architecture/discord-model-platform-plan.md §11.3):
///
///   /.well-known/apple-app-site-association   iOS Universal Links
///   /.well-known/assetlinks.json              Android App Links
///
/// Made here from the Worker's variables, because the Apple Team ID and the
/// Android signing fingerprints are not in the repository. The web app
/// (Cloudflare Pages, app.honmaruai.com) answers the same two paths by asking
/// this Worker (web-react/functions/.well-known/[file].ts), so the files are
/// on the domain the links point at, with no redirect.
///
///   APPLE_TEAM_ID          e.g. ABCDE12345 — without it there is no AASA (404)
///   ANDROID_CERT_SHA256    signing certificate fingerprints, comma separated
///                          (AA:BB:… as `eas credentials` or Play Console shows
///                          them) — without them there is no assetlinks.json
///
/// The paths the apps claim, and the app ids, change with packages/core
/// src/links.ts (LINK_PATH_PREFIXES) and apps/mobile/app.json.

/// The App Store app and the Expo PoC beside it.
export const IOS_BUNDLE_IDS = ["com.honmaru.ai", "com.honmaru.ai.poc"];
export const ANDROID_PACKAGES = ["com.honmaru.ai", "com.honmaru.ai.poc"];
/// What a link can be: a conversation, an invitation.
export const LINK_PATH_PREFIXES = ["/c/", "/join/"];

const TEAM_ID = /^[A-Z0-9]{10}$/;
const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

function teamId(env) {
  const id = String(env.APPLE_TEAM_ID || "").trim().toUpperCase();
  return TEAM_ID.test(id) ? id : null;
}

/// The fingerprints, normalized to upper-case colon pairs; anything else is dropped.
export function certFingerprints(env) {
  return String(env.ANDROID_CERT_SHA256 || "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .map((s) => (/^[0-9A-F]{64}$/.test(s) ? s.match(/.{2}/g).join(":") : s))
    .filter((s) => FINGERPRINT.test(s));
}

/// The AASA document, or null when the Team ID is not set.
export function appSiteAssociation(env) {
  const team = teamId(env);
  if (!team) return null;
  const appIDs = IOS_BUNDLE_IDS.map((id) => `${team}.${id}`);
  return {
    applinks: {
      details: [{
        appIDs,
        components: LINK_PATH_PREFIXES.map((prefix) => ({ "/": `${prefix}*` })),
      }],
    },
  };
}

/// The Digital Asset Links statement list, or null without fingerprints.
export function assetLinks(env) {
  const fingerprints = certFingerprints(env);
  if (!fingerprints.length) return null;
  return ANDROID_PACKAGES.map((pkg) => ({
    relation: ["delegate_permission/common.handle_all_urls"],
    target: { namespace: "android_app", package_name: pkg, sha256_cert_fingerprints: fingerprints },
  }));
}

/// Answers the two paths, or null for anything else.
export function handleWellKnown(request, env, url) {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  let body;
  if (url.pathname === "/.well-known/apple-app-site-association") body = appSiteAssociation(env);
  else if (url.pathname === "/.well-known/assetlinks.json") body = assetLinks(env);
  else return null;
  if (!body) {
    return new Response(JSON.stringify({ message: "Not configured on this deployment." }), {
      status: 404,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }
  return new Response(request.method === "HEAD" ? null : JSON.stringify(body), {
    headers: {
      "content-type": "application/json",
      // Apple's CDN and Google's verifier fetch these; an hour is plenty.
      "cache-control": "public, max-age=3600",
      "access-control-allow-origin": "*",
    },
  });
}
