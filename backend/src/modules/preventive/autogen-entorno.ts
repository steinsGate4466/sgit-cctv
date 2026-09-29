/**
 * ¿APAGA EL DESPLIEGUE LOS PREVENTIVOS AUTOMÁTICOS? — bloque 164.
 *
 * Antes sólo valía `PREVENTIVE_AUTOGEN=off`. Con `=false`, `=0` o `=no` —lo que
 * cualquiera escribe en un .env— el log decía «activada» y el programador
 * seguía creando OM preventivas cada madrugada. Eso es parte de por qué el
 * reparto de Indicadores salía con más preventivas de las que se registraron
 * a mano. Un interruptor que sólo entiende una palabra es una trampa.
 */
const APAGADO = new Set(['off', 'false', '0', 'no', 'apagado', 'desactivado']);

export function autogenApagadaPorEntorno(valor = process.env.PREVENTIVE_AUTOGEN): boolean {
  return APAGADO.has(String(valor ?? 'on').trim().toLowerCase());
}
