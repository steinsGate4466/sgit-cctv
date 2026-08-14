/* =============================================================================
   POLÍTICA DE CONTRASEÑA — bloque 26
   -----------------------------------------------------------------------------
   Antes: `@MinLength(8)` y nada más. Con eso `12345678` entraba, y `Pisco123`
   también. En una planta donde las cuentas se crean en grupo el día de la
   capacitación, eso significa veinte cuentas con la misma contraseña obvia.

   -----------------------------------------------------------------------------
   POR QUÉ ESTAS REGLAS Y NO LAS DE SIEMPRE
   La recomendación actual (NIST SP 800-63B) va contra lo que se hacía hace
   diez años, y va a contracorriente de lo que pide mucha auditoría:

     · LA LONGITUD MANDA. Doce caracteres corrientes resisten mucho más que
       ocho con símbolos raros.
     · NO se obliga a mayúscula + número + símbolo con la mano en el pecho.
       Obligarlo produce `Pisco2026!` en todas las cuentas: cumple la regla y
       es de las primeras que prueba cualquier diccionario.
     · SÍ se rechaza lo que ya se sabe que se usa: la lista de siempre, el
       nombre de la planta, la empresa, y la propia dirección de correo.
     · NO se fuerza el cambio cada 90 días. Rotar por calendario empuja a
       `Pisco1`, `Pisco2`, `Pisco3`. Se cambia cuando hay motivo.

   Si TI exige la política antigua por norma interna, se cambia aquí y en un
   solo sitio. Por eso es una función pura y no está desperdigada por los DTO.
============================================================================= */

export const LONGITUD_MINIMA = 12;

/** Lo que no puede aparecer dentro de la contraseña, en ninguna combinación
 *  de mayúsculas. Son las que un atacante prueba en los primeros diez
 *  segundos porque sabe dónde está atacando. */
const PROHIBIDAS = [
  'password', 'contrasena', 'contraseña', 'qwerty', 'asdf', 'zxcv',
  '123456', '1234567', '12345678', '123456789', 'abcdef',
  'admin', 'administrador', 'usuario', 'invitado', 'default',
  'aceros', 'arequipa', 'aasa', 'pisco', 'sgit', 'cctv',
  'laminacion', 'laminación', 'mantenimiento', 'siderperu',
];

export interface ResultadoPolitica {
  valida: boolean;
  /** Todos los motivos, no sólo el primero: que no tenga que probar cinco veces. */
  motivos: string[];
}

/** Detecta 4 o más caracteres consecutivos en el teclado o en el abecedario. */
function tieneSecuenciaLarga(txt: string): boolean {
  const s = txt.toLowerCase();
  let seguidos = 1;
  for (let i = 1; i < s.length; i++) {
    const paso = s.charCodeAt(i) - s.charCodeAt(i - 1);
    if (paso === 1 || paso === -1) {
      seguidos++;
      if (seguidos >= 4) return true;
    } else {
      seguidos = 1;
    }
  }
  return false;
}

/** Detecta el mismo carácter repetido 4 veces o más: `aaaa`, `1111`. */
function tieneRepeticionLarga(txt: string): boolean {
  return /(.)\1{3,}/.test(txt);
}

/**
 * Revisa una contraseña contra la política.
 *
 * @param datosDelUsuario correo, nombre… Se comprueba que la contraseña no
 *   los contenga: `cristhian2026` es fácil de adivinar precisamente para
 *   quien conoce a Cristhian, que es quien tiene acceso a la planta.
 */
export function revisarPassword(
  password: string,
  datosDelUsuario: (string | null | undefined)[] = [],
): ResultadoPolitica {
  const motivos: string[] = [];
  const p = (password ?? '').trim();

  if (p.length < LONGITUD_MINIMA) {
    motivos.push(
      `Tiene que tener al menos ${LONGITUD_MINIMA} caracteres. ` +
      'Una frase corta y fácil de recordar sirve: "el foso del tren dos".',
    );
  }

  const bajo = p.toLowerCase();
  const encontrada = PROHIBIDAS.find((mala) => bajo.includes(mala));
  if (encontrada) {
    motivos.push(
      `No puede contener «${encontrada}». Es de las primeras que se prueban ` +
      'cuando ya se sabe de qué empresa es el sistema.',
    );
  }

  for (const dato of datosDelUsuario) {
    if (!dato) continue;
    // Se parte el correo y el nombre en trozos: basta con que uno aparezca.
    const trozos = String(dato).toLowerCase().split(/[@._\s-]+/).filter((t) => t.length >= 4);
    if (trozos.some((t) => bajo.includes(t))) {
      motivos.push('No puede contener tu nombre ni tu correo.');
      break;
    }
  }

  if (tieneSecuenciaLarga(p)) {
    motivos.push('No puede llevar cuatro caracteres seguidos del teclado o del abecedario.');
  }
  if (tieneRepeticionLarga(p)) {
    motivos.push('No puede llevar el mismo carácter repetido cuatro veces.');
  }
  // Un solo tipo de carácter en toda la cadena la vuelve trivial aunque sea
  // larga: `aaaaaaaaaaaa` ya lo corta la regla de arriba, pero `abcdefghijkl`
  // no. Se pide al menos dos tipos distintos — no cuatro.
  const tipos = [/[a-záéíóúñ]/i.test(p), /\d/.test(p), /[^a-záéíóúñ\d]/i.test(p)]
    .filter(Boolean).length;
  if (p.length < 20 && tipos < 2) {
    motivos.push(
      'Mezcla al menos dos cosas: letras y números, o letras y espacios. ' +
      'Si prefieres sólo letras, escribe una frase de más de 20 caracteres.',
    );
  }

  return { valida: motivos.length === 0, motivos };
}
