import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';

function getEncryptionKey(): Buffer {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) throw new Error('ENCRYPTION_KEY is not set');
    return Buffer.from(key, 'hex');
}

/** Encrypt plaintext → `iv:authTag:ciphertext` (all base64) */
export function encrypt(plaintext: string): string {
    const key = getEncryptionKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

/** Decrypt `iv:authTag:ciphertext` → plaintext */
export function decrypt(encrypted: string): string {
    const key = getEncryptionKey();
    const [ivB64, authTagB64, ciphertextB64] = encrypted.split(':');
    if (!ivB64 || !authTagB64 || !ciphertextB64) throw new Error('Invalid encrypted format');
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(authTagB64, 'base64');
    const ciphertext = Buffer.from(ciphertextB64, 'base64');
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8');
}
