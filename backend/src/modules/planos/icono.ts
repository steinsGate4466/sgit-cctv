/**
 * QUÉ DIBUJO LLEVA CADA PUNTO DEL MAPA — bloque 161.
 *
 * Pedido de Cristhian: «que los íconos se ajusten según el dispositivo». Un
 * domo, una bala y una PTZ no se atienden igual (la PTZ tiene motor, la bala
 * se ensucia de frente, el domo se empaña), y en el plano tienen que
 * reconocerse sin tocar el punto. Lo mismo la antena base del púlpito frente a
 * una suscriptora.
 *
 * El tipo de cámara hoy se escribe a mano en la ficha («Fija, domo, PTZ,
 * bullet, térmica»), así que aquí se INTERPRETA ese texto sin inventar: si no
 * se reconoce, sale la cámara genérica — nunca se adivina un domo.
 */
export type Icono =
  | 'camara' | 'camara-domo' | 'camara-bala' | 'camara-ptz' | 'camara-termica' | 'camara-360'
  | 'antena' | 'antena-base' | 'antena-suscriptor' | 'antena-ptp'
  | 'switch' | 'nvr' | 'fuente' | 'ups' | 'router' | 'firewall' | 'servidor'
  | 'pc' | 'pantalla' | 'decodificador' | 'telefono' | 'otro';

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Lee el texto libre de «Tipo de cámara». El orden importa: «domo PTZ» es una PTZ. */
export function estiloDeCamara(texto: string | null | undefined): Icono {
  const t = sinTildes(texto || '');
  if (!t.trim()) return 'camara';
  if (/\bptz\b|speed ?dome|motoriz/.test(t)) return 'camara-ptz';
  if (/term|thermal|radiometr/.test(t)) return 'camara-termica';
  if (/fish ?eye|ojo de pez|360|panoram/.test(t)) return 'camara-360';
  if (/dom[oe]|turret|torreta|eyeball/.test(t)) return 'camara-domo';
  if (/bullet|bala|tubular|cilindr/.test(t)) return 'camara-bala';
  return 'camara';
}

export function iconoDelEquipo(tipo: string, cameraStyle?: string | null, modoInalambrico?: string | null): Icono {
  switch (tipo) {
    case 'CAMERA': return estiloDeCamara(cameraStyle);
    case 'WIRELESS':
      // Sin ficha de radio no se sabe si es base o suscriptora: antena a secas.
      return modoInalambrico === 'PMP_BASE' ? 'antena-base'
        : modoInalambrico === 'PTP' ? 'antena-ptp'
          : modoInalambrico ? 'antena-suscriptor' : 'antena';
    case 'SWITCH': return 'switch';
    case 'NVR': return 'nvr';
    case 'PSU': return 'fuente';
    case 'UPS': return 'ups';
    case 'ROUTER': return 'router';
    case 'FIREWALL': return 'firewall';
    case 'SERVER': return 'servidor';
    case 'PC': return 'pc';
    case 'PANTALLA': return 'pantalla';
    case 'DECODER': return 'decodificador';
    case 'PHONE': return 'telefono';
    default: return 'otro';
  }
}
