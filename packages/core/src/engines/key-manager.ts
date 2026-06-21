import crypto from 'node:crypto';

/**
 * KeyManager — AES-256-GCM encryption for LLM API keys.
 *
 * Keys are encrypted at rest using a user-provided encryption key.
 * The encryption key is never stored; it must be provided at startup.
 */
export class KeyManager {
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32; // 256 bits
  private readonly ivLength = 16;
  private readonly tagLength = 16;
  private encryptionKey: Buffer;

  constructor(encryptionKey: string) {
    // Accept both hex (64 chars) and base64 (44 chars) formats
    let key: Buffer;
    if (encryptionKey.length === this.keyLength * 2 && /^[0-9a-fA-F]+$/.test(encryptionKey)) {
      // Hex format
      key = Buffer.from(encryptionKey, 'hex');
    } else {
      // Base64 format
      key = Buffer.from(encryptionKey, 'base64');
    }

    if (key.length !== this.keyLength) {
      throw new Error(
        `Encryption key must decode to ${this.keyLength} bytes. ` +
        `Generate with: openssl rand -base64 ${this.keyLength}`,
      );
    }
    this.encryptionKey = key;
  }

  /**
   * Encrypt an API key.
   * Returns base64-encoded ciphertext (IV + ciphertext + auth tag).
   */
  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(this.ivLength);
    const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag();

    // Combine IV + ciphertext + tag
    const combined = Buffer.concat([
      iv,
      Buffer.from(encrypted, 'hex'),
      tag,
    ]);

    return combined.toString('base64');
  }

  /**
   * Decrypt an encrypted API key.
   * Input is base64-encoded (IV + ciphertext + auth tag).
   */
  decrypt(encryptedBase64: string): string {
    const combined = Buffer.from(encryptedBase64, 'base64');

    const iv = combined.subarray(0, this.ivLength);
    const tag = combined.subarray(combined.length - this.tagLength);
    const encrypted = combined.subarray(this.ivLength, combined.length - this.tagLength);

    const decipher = crypto.createDecipheriv(this.algorithm, this.encryptionKey, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString('utf8');
  }

  /**
   * Mask an API key for display (show first 4 and last 4 characters).
   */
  maskKey(encryptedKey: string): string {
    try {
      const decrypted = this.decrypt(encryptedKey);
      if (decrypted.length <= 8) return '****';
      return `${decrypted.slice(0, 4)}...${decrypted.slice(-4)}`;
    } catch {
      return '****';
    }
  }

  /**
   * Generate a new random encryption key (for initial setup).
   */
  static generateKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }
}
