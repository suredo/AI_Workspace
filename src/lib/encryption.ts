import crypto from "crypto";
import { logger } from "./logger";

const CTX = "lib:encryption";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const keyEnv = process.env.LLM_ENCRYPTION_KEY;
  if (!keyEnv) {
    throw new Error("LLM_ENCRYPTION_KEY environment variable is required");
  }

  const key = Buffer.from(keyEnv, "base64");
  if (key.length !== 32) {
    throw new Error("LLM_ENCRYPTION_KEY must be 32 bytes (base64 encoded)");
  }

  return key;
}

export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  // Format: iv (16 bytes) + authTag (16 bytes) + ciphertext
  const combined = Buffer.concat([iv, authTag, encrypted]);

  logger.debug(CTX, "Encrypted data", {
    inputLength: plaintext.length,
    outputLength: combined.length,
  });

  return combined.toString("base64");
}

export function decrypt(encryptedBase64: string): string {
  const key = getEncryptionKey();
  const combined = Buffer.from(encryptedBase64, "base64");

  if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error("Invalid encrypted data: too short");
  }

  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  logger.debug(CTX, "Decrypted data", {
    inputLength: combined.length,
    outputLength: decrypted.length,
  });

  return decrypted.toString("utf8");
}
