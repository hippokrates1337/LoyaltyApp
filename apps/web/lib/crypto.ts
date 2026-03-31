import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex) {
    throw new Error(
      'ENCRYPTION_KEY environment variable is not set. ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }
  const buf = Buffer.from(hex, 'hex');
  if (buf.length !== 32) {
    throw new Error(
      `ENCRYPTION_KEY must be a 64-character hex string (32 bytes). Got ${hex.length} hex chars.`,
    );
  }
  return buf;
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a string in the format: `{iv_hex}:{authTag_hex}:{ciphertext_hex}`
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt a string previously encrypted with `encrypt()`.
 * Expects format: `{iv_hex}:{authTag_hex}:{ciphertext_hex}`
 */
export function decrypt(encrypted: string): string {
  const key = getEncryptionKey();
  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    throw new Error(
      'Invalid encrypted string format. Expected iv:authTag:ciphertext.',
    );
  }

  const [ivHex, authTagHex, ciphertextHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}
