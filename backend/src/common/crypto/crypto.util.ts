import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGO = 'aes-256-gcm';

// Deriva una clave de 32 bytes desde CREDENTIAL_ENC_KEY (variable de entorno).
function getKey(): Buffer {
  const secret = process.env.CREDENTIAL_ENC_KEY || 'dev-credential-key-change-me';
  return scryptSync(secret, 'sgit-cctv-cred-salt', 32);
}

/**
 * Cifra un texto con AES-256-GCM.
 * Devuelve una cadena "ivB64.tagB64.dataB64" apta para almacenar en secretEnc.
 */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join('.');
}

/** Descifra el formato producido por encryptSecret(). */
export function decryptSecret(stored: string): string {
  const [ivB64, tagB64, dataB64] = stored.split('.');
  const decipher = createDecipheriv(ALGO, getKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const dec = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
  return dec.toString('utf8');
}
