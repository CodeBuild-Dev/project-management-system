import crypto from 'node:crypto';

/**
 * AES-256-GCM at-rest encryption for short secrets (passwords, API keys).
 * Reads the key from RESOURCE_VAULT_KEY (base64, 32 bytes after decode).
 *
 * The ciphertext / iv / tag triplet is what we persist; the plaintext
 * password never lands in Postgres or in any log line. Failing to
 * configure the key throws at first use — we never silently fall back
 * to no-encryption.
 */

const KEY_ENV = 'RESOURCE_VAULT_KEY';
const ALG = 'aes-256-gcm';

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env[KEY_ENV];
  if (!raw) {
    throw new Error(
      `[secret-vault] ${KEY_ENV} is not set. Generate one with \`openssl rand -base64 32\` and set it in Railway env vars before storing credentials.`
    );
  }
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) {
    throw new Error(
      `[secret-vault] ${KEY_ENV} must decode to exactly 32 bytes (256-bit AES key); got ${buf.length}.`
    );
  }
  cachedKey = buf;
  return buf;
}

export interface SealedSecret {
  ciphertext: string;
  iv: string;
  tag: string;
}

export function sealSecret(plaintext: string): SealedSecret {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALG, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

export function openSecret(sealed: SealedSecret): string {
  const key = getKey();
  const iv = Buffer.from(sealed.iv, 'base64');
  const tag = Buffer.from(sealed.tag, 'base64');
  const ciphertext = Buffer.from(sealed.ciphertext, 'base64');
  const decipher = crypto.createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

export function isVaultConfigured(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}
