import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { encrypt, decrypt } from '../crypto';

const TEST_KEY = 'a'.repeat(64); // 32 bytes hex

describe('crypto', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = TEST_KEY;
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
  });

  it('encrypt then decrypt returns original plaintext', () => {
    const plaintext = 'hello world, this is a secret!';
    const encrypted = encrypt(plaintext);
    expect(decrypt(encrypted)).toBe(plaintext);
  });

  it('different plaintexts produce different ciphertexts', () => {
    const a = encrypt('plaintext-a');
    const b = encrypt('plaintext-b');
    expect(a).not.toBe(b);
  });

  it('encrypting the same plaintext twice produces different ciphertexts (random IV)', () => {
    const plaintext = 'same text';
    const first = encrypt(plaintext);
    const second = encrypt(plaintext);
    expect(first).not.toBe(second);
    // But both decrypt to the same value
    expect(decrypt(first)).toBe(plaintext);
    expect(decrypt(second)).toBe(plaintext);
  });

  it('decrypt with wrong key throws', () => {
    const encrypted = encrypt('secret');
    process.env.ENCRYPTION_KEY = 'b'.repeat(64);
    expect(() => decrypt(encrypted)).toThrow();
  });

  it('decrypt tampered ciphertext throws (GCM auth failure)', () => {
    const encrypted = encrypt('secret');
    const parts = encrypted.split(':');
    // Tamper with the ciphertext portion
    const tampered = parts[2].replace(/^./, parts[2][0] === 'a' ? 'b' : 'a');
    const modified = `${parts[0]}:${parts[1]}:${tampered}`;
    expect(() => decrypt(modified)).toThrow();
  });

  it('missing ENCRYPTION_KEY throws descriptive error', () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() => encrypt('test')).toThrow('ENCRYPTION_KEY environment variable is not set');
  });

  it('invalid ENCRYPTION_KEY length throws descriptive error', () => {
    process.env.ENCRYPTION_KEY = 'deadbeef'; // too short
    expect(() => encrypt('test')).toThrow('ENCRYPTION_KEY must be a 64-character hex string');
  });

  it('handles empty string plaintext', () => {
    const encrypted = encrypt('');
    expect(decrypt(encrypted)).toBe('');
  });

  it('handles unicode plaintext', () => {
    const plaintext = 'Ünïcödë 🔐 密码';
    const encrypted = encrypt(plaintext);
    expect(decrypt(encrypted)).toBe(plaintext);
  });
});
