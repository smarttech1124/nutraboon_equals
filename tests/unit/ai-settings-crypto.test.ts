import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createCredentialCipher,
  CredentialDecryptError,
  CredentialKeyError,
  credentialContext,
  maskKey,
  parseMasterKey,
} from "@/lib/ai/settings/crypto";

const KEY = "sk-test-0123456789abcdefghijklmnop9X2A";
const cipher = createCredentialCipher(randomBytes(32));

describe("credential encryption", () => {
  it("round-trips a key and never stores it in plain text", () => {
    const context = credentialContext("cfg-1", "openai");
    const stored = cipher.encrypt(KEY, context);
    expect(stored).toMatch(/^v1:[\w-]+:[\w-]+:[\w-]+$/);
    expect(stored).not.toContain(KEY);
    expect(stored).not.toContain("9X2A");
    expect(cipher.decrypt(stored, context)).toBe(KEY);
  });

  it("uses a fresh IV, so the same key encrypts differently each time", () => {
    const context = credentialContext("cfg-1", "openai");
    expect(cipher.encrypt(KEY, context)).not.toBe(cipher.encrypt(KEY, context));
  });

  it("refuses a ciphertext moved to another configuration or provider", () => {
    const stored = cipher.encrypt(KEY, credentialContext("cfg-1", "openai"));
    expect(() => cipher.decrypt(stored, credentialContext("cfg-2", "openai"))).toThrow(
      CredentialDecryptError,
    );
    expect(() => cipher.decrypt(stored, credentialContext("cfg-1", "deepseek"))).toThrow(
      CredentialDecryptError,
    );
  });

  it("detects tampering and a different master key, without echoing data", () => {
    const context = credentialContext("cfg-1", "openai");
    const stored = cipher.encrypt(KEY, context);
    const [v, iv, tag, data] = stored.split(":");
    const flipped = `${v}:${iv}:${tag}:${data.slice(0, -2)}${data.endsWith("A") ? "B" : "A"}${data.slice(-1)}`;
    expect(() => cipher.decrypt(flipped, context)).toThrow(CredentialDecryptError);
    expect(() => cipher.decrypt("garbage", context)).toThrow(CredentialDecryptError);

    const other = createCredentialCipher(randomBytes(32));
    try {
      other.decrypt(stored, context);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(CredentialDecryptError);
      expect(String((error as Error).message)).not.toContain(data);
    }
  });

  it("fingerprints consistently per master key and does not reveal the key", () => {
    const fp = cipher.fingerprint(KEY);
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
    expect(cipher.fingerprint(KEY)).toBe(fp);
    expect(cipher.fingerprint(`${KEY}x`)).not.toBe(fp);
    expect(createCredentialCipher(randomBytes(32)).fingerprint(KEY)).not.toBe(fp);
  });
});

describe("parseMasterKey", () => {
  it("accepts 32 base64 bytes", () => {
    expect(parseMasterKey(randomBytes(32).toString("base64"))).toHaveLength(32);
  });

  it.each([undefined, "", "short", randomBytes(16).toString("base64")])("rejects %s", (value) => {
    expect(() => parseMasterKey(value)).toThrow(CredentialKeyError);
  });
});

describe("maskKey", () => {
  it("keeps a known prefix and the last four characters only", () => {
    expect(maskKey(KEY)).toBe("sk-••••••••9X2A");
    expect(maskKey("sk-proj-abcdefghijklmnopqrstuvwxyz71KF")).toBe("sk-proj-••••••••71KF");
    expect(maskKey("AIzaSyA1234567890abcdefghijklmnopqrstu")).toBe("AIza••••••••rstu");
    expect(maskKey("xyz1234567890abcdefgh")).toBe("••••••••efgh");
  });

  it("shows nothing of a short key", () => {
    expect(maskKey("abc123")).toBe("••••••••");
  });
});
