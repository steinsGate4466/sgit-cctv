import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGO = 'aes-256-gcm';

const CLAVE_DE_DESARROLLO = 'dev-credential-key-change-me';

/**
 * Deriva una clave de 32 bytes desde CREDENTIAL_ENC_KEY.
 *
 * OJO CON LA CLAVE POR DEFECTO.
 * Antes, si la variable no estaba puesta, esto seguía adelante cifrando con
 * una clave que está ESCRITA EN EL CÓDIGO y por tanto en el repositorio.
 * El sistema arrancaba, las contraseñas de los grabadores se guardaban
 * "cifradas", y nadie se enteraba de que cualquiera con acceso al código
 * podía descifrarlas. Un fallo así no da la cara: da la cara el día de la
 * auditoría.
 *
 * En producción ahora revienta al primer uso. Es preferible que no arranque
 * a que arranque dando una seguridad que no tiene.
 */
function getKey(): Buffer {
  const secret = process.env.CREDENTIAL_ENC_KEY;
  const enProduccion = process.env.NODE_ENV === 'production';

  if (enProduccion && (!secret || secret === CLAVE_DE_DESARROLLO)) {
    throw new Error(
      'CREDENTIAL_ENC_KEY no está configurada (o sigue siendo la de desarrollo). ' +
      'Las credenciales de los grabadores no se pueden cifrar con una clave pública. ' +
      'Define la variable en el entorno antes de arrancar.',
    );
  }

  return scryptSync(secret || CLAVE_DE_DESARROLLO, 'sgit-cctv-cred-salt', 32);
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
