import { expect, test } from "vitest";
import { md5, rc4, bytesOf } from "../src/pdfCrypt.js";
import { pdfText } from "../src/pdfText.js";
import { ENCRYPTED } from "./fixtures-encrypted-pdfs.js";

const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

test("MD5 and RC4 give the published answers", () => {
  expect(hex(md5(bytesOf("")))).toBe("d41d8cd98f00b204e9800998ecf8427e");
  expect(hex(md5(bytesOf("abc")))).toBe("900150983cd24fb0d6963f7d28e17f72");
  expect(hex(md5(bytesOf("12345678901234567890123456789012345678901234567890123456789012345678901234567890")))).toBe("57edf4a22be3c955ac49da2e2107b67a");
  // Lengths at the edge of a block, where the padding spills over.
  expect(hex(md5(bytesOf("a".repeat(56))))).toBe("3b0c8ac703f828b04c6c197006d17218");
  expect(hex(md5(bytesOf("b".repeat(64))))).toBe("0b649bcb5a82868817fec9a6e709d233");
  expect(hex(rc4(bytesOf("Key"), bytesOf("Plaintext")))).toBe("bbf316e8d940af0ad3");
  expect(hex(rc4(bytesOf("Secret"), bytesOf("Attack at dawn")))).toBe("45a01f645fc35b383552544b9bf5");
});

test("a PDF encrypted with no password to open is read, in every revision of the standard handler", async () => {
  for (const [name, r] of [["rc4_40", 2], ["rc4_128", 3], ["aes_128", 4], ["aes_256_r5", 5], ["aes_256", 6]]) {
    const text = await pdfText(b64(ENCRYPTED[name]));
    expect(text, `${name} (R${r})`).toContain("4111 1111 1111 1111");
    expect(text).toContain(name);
  }
});

test("a PDF that asks for a password to open is not read", async () => {
  expect(await pdfText(b64(ENCRYPTED.locked))).toBe(null);
});
