import { describe, it, expect, beforeEach, vi } from "vitest";
import crypto from "crypto";

// Set test encryption key (32 bytes base64 encoded)
const TEST_KEY = crypto.randomBytes(32).toString("base64");

describe("encryption", () => {
  beforeEach(() => {
    vi.stubEnv("LLM_ENCRYPTION_KEY", TEST_KEY);
  });

  describe("encrypt", () => {
    it("should encrypt plaintext and return base64 string", async () => {
      const { encrypt } = await import("./encryption");
      const plaintext = "gsk_xxxxx123456789";
      const encrypted = encrypt(plaintext);

      expect(encrypted).toBeTruthy();
      expect(typeof encrypted).toBe("string");
      // Should be valid base64
      expect(() => Buffer.from(encrypted, "base64")).not.toThrow();
    });

    it("should produce different output for same input (random IV)", async () => {
      const { encrypt } = await import("./encryption");
      const plaintext = "same input";

      const encrypted1 = encrypt(plaintext);
      const encrypted2 = encrypt(plaintext);

      // Different due to random IV
      expect(encrypted1).not.toBe(encrypted2);
    });
  });

  describe("decrypt", () => {
    it("should decrypt encrypted data back to original", async () => {
      const { encrypt, decrypt } = await import("./encryption");
      const plaintext = "my-secret-api-key-12345";

      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it("should handle empty string", async () => {
      const { encrypt, decrypt } = await import("./encryption");
      const plaintext = "";

      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it("should handle long strings", async () => {
      const { encrypt, decrypt } = await import("./encryption");
      const plaintext = "a".repeat(10000);

      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it("should handle special characters", async () => {
      const { encrypt, decrypt } = await import("./encryption");
      const plaintext = "key-with-symbols!@#$%^&*()_+-=[]{}|;':\",./<>?`~";

      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });
  });

  describe("error handling", () => {
    it("should throw if LLM_ENCRYPTION_KEY is missing", async () => {
      vi.unstubAllEnvs();
      vi.resetModules();

      const { encrypt } = await import("./encryption");

      expect(() => encrypt("test")).toThrow("LLM_ENCRYPTION_KEY environment variable is required");
    });

    it("should throw if key is wrong length", async () => {
      vi.stubEnv("LLM_ENCRYPTION_KEY", Buffer.from("short-key").toString("base64"));
      vi.resetModules();

      const { encrypt } = await import("./encryption");

      expect(() => encrypt("test")).toThrow("LLM_ENCRYPTION_KEY must be 32 bytes");
    });

    it("should throw on decryption with wrong key", async () => {
      const { encrypt } = await import("./encryption");
      const encrypted = encrypt("secret");

      // Change the key
      vi.stubEnv("LLM_ENCRYPTION_KEY", crypto.randomBytes(32).toString("base64"));
      vi.resetModules();

      const { decrypt } = await import("./encryption");

      expect(() => decrypt(encrypted)).toThrow();
    });

    it("should throw on tampered data", async () => {
      const { encrypt } = await import("./encryption");
      const encrypted = encrypt("secret");

      // Tamper with the encrypted data
      const combined = Buffer.from(encrypted, "base64");
      combined[combined.length - 1] ^= 0xff; // Flip last byte
      const tampered = combined.toString("base64");

      const { decrypt } = await import("./encryption");

      expect(() => decrypt(tampered)).toThrow();
    });

    it("should throw on invalid base64", async () => {
      const { decrypt } = await import("./encryption");

      expect(() => decrypt("not-valid-base64!@#")).toThrow();
    });

    it("should throw on data too short", async () => {
      const { decrypt } = await import("./encryption");
      const shortData = Buffer.from([1, 2, 3]).toString("base64");

      expect(() => decrypt(shortData)).toThrow("Invalid encrypted data: too short");
    });
  });

  describe("roundtrip with various API key formats", () => {
    it("should handle OpenAI-style key", async () => {
      const { encrypt, decrypt } = await import("./encryption");
      const key = "sk-proj-1234567890abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopq";

      expect(decrypt(encrypt(key))).toBe(key);
    });

    it("should handle Groq-style key", async () => {
      const { encrypt, decrypt } = await import("./encryption");
      const key = "gsk_1234567890abcdefghijklmnopqrstuvwxyz1234567890abcdefghij";

      expect(decrypt(encrypt(key))).toBe(key);
    });

    it("should handle base64-encoded key", async () => {
      const { encrypt, decrypt } = await import("./encryption");
      const key = Buffer.from("raw-api-key-bytes").toString("base64");

      expect(decrypt(encrypt(key))).toBe(key);
    });
  });
});
