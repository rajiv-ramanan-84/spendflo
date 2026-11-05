import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { decryptToken, encryptToken, parseKey } from "@/lib/crypto/tokens";

const key = randomBytes(32);

describe("token encryption", () => {
  it("round-trips a refresh token", () => {
    const sealed = encryptToken("1//0g-refresh-token", key);
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(sealed).not.toContain("refresh");
    expect(decryptToken(sealed, key)).toBe("1//0g-refresh-token");
  });

  it("uses a fresh IV every time", () => {
    expect(encryptToken("same", key)).not.toBe(encryptToken("same", key));
  });

  it("rejects tampered ciphertext", () => {
    const [v, iv, tag, ct] = encryptToken("secret", key).split(".");
    const flipped = Buffer.from(ct, "base64url");
    flipped[0] ^= 1;
    expect(() => decryptToken([v, iv, tag, flipped.toString("base64url")].join("."), key)).toThrow();
  });

  it("rejects the wrong key", () => {
    expect(() => decryptToken(encryptToken("secret", key), randomBytes(32))).toThrow();
  });

  it("validates the key", () => {
    expect(() => parseKey(undefined)).toThrow();
    expect(() => parseKey(Buffer.from("short").toString("base64"))).toThrow();
    expect(parseKey(key.toString("base64")).length).toBe(32);
  });
});
