import { describe, it, expect } from 'vitest';
import { KeyManager } from './key-manager';

describe('KeyManager', () => {
  const testKey = 'a'.repeat(64); // 32 bytes in hex
  const manager = new KeyManager(testKey);

  it('should encrypt and decrypt successfully', () => {
    const plaintext = 'sk-test-api-key-12345';
    const encrypted = manager.encrypt(plaintext);
    const decrypted = manager.decrypt(encrypted);

    expect(decrypted).toBe(plaintext);
  });

  it('should produce different ciphertext for same plaintext', () => {
    const plaintext = 'sk-test-api-key-12345';
    const enc1 = manager.encrypt(plaintext);
    const enc2 = manager.encrypt(plaintext);

    expect(enc1).not.toBe(enc2);
  });

  it('should mask key correctly', () => {
    const plaintext = 'sk-abcdefghijklmnop';
    const encrypted = manager.encrypt(plaintext);
    const masked = manager.maskKey(encrypted);

    expect(masked).toBe('sk-a...mnop');
  });

  it('should throw on invalid key length', () => {
    expect(() => new KeyManager('short')).toThrow();
  });

  it('should generate valid key', () => {
    const key = KeyManager.generateKey();
    expect(key).toHaveLength(64); // 32 bytes = 64 hex chars
  });
});
