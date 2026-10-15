import { describe, expect, it } from "vitest";
import { hashPassword, isPasswordHash, verifyPassword } from "@/lib/admin/password";

describe("admin password", () => {
  it("hashes with scrypt in a .env-safe format and verifies", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash).toMatch(/^scrypt:32768:8:1:[\w-]+:[\w-]+$/);
    expect(hash).not.toContain("$");
    expect(isPasswordHash(hash)).toBe(true);
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("wrong horse battery", hash)).toBe(false);
  });

  it("salts each hash", async () => {
    expect(await hashPassword("same password")).not.toBe(await hashPassword("same password"));
  });

  it.each(["", "plain", "bcrypt:1:2:3:abc:def", "scrypt:0:8:1:abcdefghijk:abcdefghijklmnopqrstuv"])(
    "rejects a malformed hash %j",
    async (stored) => {
      expect(await verifyPassword("anything", stored)).toBe(false);
    },
  );
});
