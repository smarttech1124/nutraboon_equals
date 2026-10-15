import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";

/**
 * Encryption for stored AI provider keys (ADR-047). AES-256-GCM with a
 * random 96-bit IV per key. The configuration id and provider are bound in as
 * additional authenticated data, so a ciphertext copied onto another row fails
 * to decrypt instead of silently becoming that row's key.
 */

const VERSION = "v1";

/** Raised when AI_CREDENTIALS_KEY is missing or malformed. Never contains the key. */
export class CredentialKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredentialKeyError";
  }
}

/** Raised when a stored key cannot be decrypted (wrong master key or tampering). */
export class CredentialDecryptError extends Error {
  constructor() {
    super("Stored AI credential could not be decrypted");
    this.name = "CredentialDecryptError";
  }
}

export type CredentialCipher = {
  encrypt(plaintext: string, context: string): string;
  decrypt(stored: string, context: string): string;
  fingerprint(plaintext: string): string;
};

/** Parses AI_CREDENTIALS_KEY: 32 random bytes, base64 encoded. */
export function parseMasterKey(value: string | undefined): Buffer {
  if (!value) throw new CredentialKeyError("AI_CREDENTIALS_KEY is not set");
  const key = Buffer.from(value.trim(), "base64");
  if (key.length !== 32) {
    throw new CredentialKeyError("AI_CREDENTIALS_KEY must be 32 bytes, base64 encoded");
  }
  return key;
}

export function createCredentialCipher(masterKey: Buffer): CredentialCipher {
  // Separate subkeys, so the fingerprint can never help decrypt anything.
  const encryptionKey = Buffer.from(
    hkdfSync("sha256", masterKey, "", "ai-credential-encryption", 32),
  );
  const fingerprintKey = Buffer.from(
    hkdfSync("sha256", masterKey, "", "ai-credential-fingerprint", 32),
  );

  return {
    encrypt(plaintext, context) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
      cipher.setAAD(Buffer.from(context, "utf8"));
      const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      const tag = cipher.getAuthTag();
      return [VERSION, iv, tag, ciphertext]
        .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
        .join(":");
    },

    decrypt(stored, context) {
      const [version, iv, tag, ciphertext] = stored.split(":");
      if (version !== VERSION || !iv || !tag || ciphertext === undefined) {
        throw new CredentialDecryptError();
      }
      try {
        const decipher = createDecipheriv(
          "aes-256-gcm",
          encryptionKey,
          Buffer.from(iv, "base64url"),
        );
        decipher.setAAD(Buffer.from(context, "utf8"));
        decipher.setAuthTag(Buffer.from(tag, "base64url"));
        return Buffer.concat([
          decipher.update(Buffer.from(ciphertext, "base64url")),
          decipher.final(),
        ]).toString("utf8");
      } catch {
        // The cause can include buffer details; it is dropped on purpose.
        throw new CredentialDecryptError();
      }
    },

    fingerprint(plaintext) {
      return createHmac("sha256", fingerprintKey).update(plaintext, "utf8").digest("hex");
    },
  };
}

/** The additional authenticated data for a configuration's key. */
export function credentialContext(configId: string, provider: string): string {
  return `${configId}:${provider}`;
}

/**
 * The masked form shown to admins: a known prefix, dots, and the last four
 * characters, e.g. "sk-••••••••9X2A". Short keys show only dots.
 */
export function maskKey(key: string): string {
  const dots = "••••••••";
  if (key.length < 16) return dots;
  const prefix = /^(sk-proj-|sk-|AIza)/.exec(key)?.[0] ?? "";
  return `${prefix}${dots}${key.slice(-4)}`;
}
