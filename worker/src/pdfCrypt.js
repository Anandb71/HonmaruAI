// Opening a PDF that is encrypted with no password to open it (pdfText.js).
// Many PDFs are: an "owner password" stops printing or copying, and anyone
// may still open them, which means the key to read them is in the file.
// That is the Standard security handler, revisions 2 to 6: RC4 with 40 to
// 128-bit keys, AES-128, and AES-256. A PDF that asks for a password to open
// is not read, and neither is any other handler (certificates, DRM).
//
// MD5 and RC4 are written out here because WebCrypto has neither; AES and
// the SHA-2 family come from WebCrypto. None of this protects anything: it
// only undoes what a reader would undo anyway, to check the words.

const PAD = Uint8Array.from([
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08,
  0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
]);

export const bytesOf = (s) => Uint8Array.from(String(s || ""), (c) => c.charCodeAt(0) & 0xff);

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// ---- MD5 (RFC 1321) ----

const MD5_K = Int32Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) | 0);
const MD5_S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];

export function md5(bytes) {
  const n = bytes.length;
  const len = Math.ceil((n + 9) / 64) * 64;
  const buf = new Uint8Array(len);
  buf.set(bytes);
  buf[n] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(len - 8, (n * 8) >>> 0, true);
  dv.setUint32(len - 4, Math.floor(n / 0x20000000), true);
  let a0 = 0x67452301 | 0, b0 = 0xefcdab89 | 0, c0 = 0x98badcfe | 0, d0 = 0x10325476 | 0;
  const M = new Int32Array(16);
  for (let off = 0; off < len; off += 64) {
    for (let j = 0; j < 16; j++) M[j] = dv.getInt32(off + j * 4, true);
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) & 15; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) & 15; }
      else { F = C ^ (B | ~D); g = (7 * i) & 15; }
      const s = MD5_S[(i >> 4) * 4 + (i & 3)];
      const x = (A + F + MD5_K[i] + M[g]) | 0;
      A = D; D = C; C = B;
      B = (B + ((x << s) | (x >>> (32 - s)))) | 0;
    }
    a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0;
  }
  const out = new Uint8Array(16);
  const ov = new DataView(out.buffer);
  ov.setInt32(0, a0, true); ov.setInt32(4, b0, true); ov.setInt32(8, c0, true); ov.setInt32(12, d0, true);
  return out;
}

// ---- RC4 ----

export function rc4(key, data) {
  const S = new Uint8Array(256);
  for (let i = 0; i < 256; i++) S[i] = i;
  for (let i = 0, j = 0; i < 256; i++) {
    j = (j + S[i] + key[i % key.length]) & 255;
    const t = S[i]; S[i] = S[j]; S[j] = t;
  }
  const out = new Uint8Array(data.length);
  for (let k = 0, i = 0, j = 0; k < data.length; k++) {
    i = (i + 1) & 255;
    j = (j + S[i]) & 255;
    const t = S[i]; S[i] = S[j]; S[j] = t;
    out[k] = data[k] ^ S[(S[i] + S[j]) & 255];
  }
  return out;
}

// ---- AES-CBC, without WebCrypto's padding ----

const aesKey = (raw) => crypto.subtle.importKey("raw", raw, "AES-CBC", false, ["encrypt", "decrypt"]);

/// CBC encryption of whole blocks, no padding added.
async function aesEncryptRaw(raw, iv, data) {
  const out = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-CBC", iv }, await aesKey(raw), data));
  return out.subarray(0, data.length);
}

/// CBC decryption of whole blocks, no padding taken off. WebCrypto insists
/// on PKCS#7, so a block that decrypts to a full block of padding is added
/// first: it is the encryption of that padding chained after the last one.
async function aesDecryptRaw(raw, iv, data) {
  const whole = data.subarray(0, data.length - (data.length % 16));
  if (!whole.length) return new Uint8Array(0);
  const key = await aesKey(raw);
  const tail = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-CBC", iv: whole.subarray(whole.length - 16) }, key, new Uint8Array(16).fill(16))).subarray(0, 16);
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-CBC", iv }, key, concat(whole, tail)));
}

/// A stream or string encrypted with AES: its IV first, PKCS#7 padding last.
async function aesOpen(raw, data) {
  if (data.length < 32) return new Uint8Array(0);
  const out = await aesDecryptRaw(raw, data.subarray(0, 16), data.subarray(16));
  const pad = out[out.length - 1];
  if (pad >= 1 && pad <= 16 && out.length >= pad && out.subarray(out.length - pad).every((x) => x === pad)) return out.subarray(0, out.length - pad);
  return out;
}

const sha = async (alg, data) => new Uint8Array(await crypto.subtle.digest(alg, data));

// ---- The file key ----

/// Revision 6's hash (ISO 32000-2, algorithm 2.B). `udata` is empty for the
/// user password, which is the only one asked about here.
async function hash2B(password, salt, udata) {
  let k = await sha("SHA-256", concat(password, salt, udata));
  let e = new Uint8Array(0);
  for (let i = 0; i < 64 || e[e.length - 1] > i - 32; i++) {
    const one = concat(password, k, udata);
    const k1 = new Uint8Array(one.length * 64);
    for (let j = 0; j < 64; j++) k1.set(one, j * one.length);
    e = await aesEncryptRaw(k.subarray(0, 16), k.subarray(16, 32), k1);
    let sum = 0;
    for (let j = 0; j < 16; j++) sum += e[j];
    k = await sha(sum % 3 === 0 ? "SHA-256" : sum % 3 === 1 ? "SHA-384" : "SHA-512", e);
    if (i > 2000) break;
  }
  return k.subarray(0, 32);
}

/// How one kind of object is encrypted: "rc4", "aes" (128), "aes256" or null.
function methodOf(enc, get, which) {
  const v = Number(get(enc.V)) || 0;
  if (v === 1 || v === 2) return "rc4";
  if (v !== 4 && v !== 5) return undefined;
  const name = get(enc[which])?.name || "Identity";
  if (name === "Identity") return null;
  const cf = get(get(enc.CF)?.[name]);
  const cfm = get(cf?.CFM)?.name || "None";
  if (cfm === "V2") return "rc4";
  if (cfm === "AESV2") return "aes";
  if (cfm === "AESV3") return "aes256";
  if (cfm === "None") return null;
  return undefined;
}

/// The key to a PDF encrypted with the Standard handler and an empty user
/// password, and how streams are encrypted; null when it cannot be opened.
/// `enc` is the Encrypt dictionary, `id0` the first file ID, `get` resolves
/// references.
export async function openEncryption(enc, id0, get) {
  if (!enc || typeof enc !== "object" || get(enc.Filter)?.name !== "Standard") return null;
  const r = Number(get(enc.R)) || 0;
  const stream = methodOf(enc, get, "StmF");
  if (stream === undefined) return null;
  const O = bytesOf(get(enc.O));
  const U = bytesOf(get(enc.U));
  const password = new Uint8Array(0);

  if (r === 5 || r === 6) {
    if (U.length < 48) return null;
    const hash = r === 6 ? (salt) => hash2B(password, salt, new Uint8Array(0)) : (salt) => sha("SHA-256", concat(password, salt));
    if (!same(await hash(U.subarray(32, 40)), U.subarray(0, 32))) return null;
    const UE = bytesOf(get(enc.UE));
    if (UE.length < 32) return null;
    const key = await aesDecryptRaw(await hash(U.subarray(40, 48)), new Uint8Array(16), UE.subarray(0, 32));
    return { key, stream, revision: r, encryptMetadata: get(enc.EncryptMetadata) !== false };
  }
  if (r < 2 || r > 4 || O.length < 32 || U.length < 32) return null;
  const v = Number(get(enc.V)) || 0;
  const n = r === 2 ? 5 : v === 4 ? 16 : Math.min(16, Math.max(5, (Number(get(enc.Length)) || 40) / 8));
  const p = new Uint8Array(4);
  new DataView(p.buffer).setInt32(0, Number(get(enc.P)) | 0, true);
  const encryptMetadata = get(enc.EncryptMetadata) !== false;
  let h = md5(concat(PAD, O.subarray(0, 32), p, bytesOf(id0), r >= 4 && !encryptMetadata ? Uint8Array.of(255, 255, 255, 255) : new Uint8Array(0)));
  if (r >= 3) for (let i = 0; i < 50; i++) h = md5(h.subarray(0, n));
  const key = h.subarray(0, n);
  // The empty password is the user password only if it makes U.
  if (r === 2) {
    if (!same(rc4(key, PAD), U.subarray(0, 32))) return null;
  } else {
    let x = rc4(key, md5(concat(PAD, bytesOf(id0))));
    for (let i = 1; i <= 19; i++) x = rc4(key.map((b) => b ^ i), x);
    if (!same(x, U.subarray(0, 16))) return null;
  }
  return { key, stream, revision: r, encryptMetadata };
}

/// One stream's bytes, decrypted with its object's own key.
export async function decryptStream(crypt, num, gen, data) {
  if (!crypt.stream) return data;
  if (crypt.stream === "aes256") return aesOpen(crypt.key, data);
  const salt = crypt.stream === "aes" ? bytesOf("sAlT") : new Uint8Array(0);
  const objKey = md5(concat(crypt.key, Uint8Array.of(num & 255, (num >> 8) & 255, (num >> 16) & 255, gen & 255, (gen >> 8) & 255), salt))
    .subarray(0, Math.min(crypt.key.length + 5, 16));
  return crypt.stream === "aes" ? aesOpen(objKey, data) : rc4(objKey, data);
}
