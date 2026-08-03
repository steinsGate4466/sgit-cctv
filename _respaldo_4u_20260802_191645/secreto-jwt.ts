/**
 * SECRETO DE FIRMA DE LOS TOKENS.
 *
 * Antes esto era `process.env.JWT_SECRET || 'change_me_in_prod'`. Si la
 * variable faltaba en Railway, la aplicación arrancaba tan tranquila y
 * firmaba los tokens con un secreto que está escrito en el repositorio.
 * Cualquiera que leyera el código podía fabricarse un token de administrador
 * válido. Y no había ninguna señal: todo parecía funcionar.
 *
 * Ahora falla al arrancar, igual que ya hace CORS. Un sistema que no puede
 * protegerse no debe levantarse: es preferible un despliegue que no arranca
 * —y se ve— a uno que arranca abierto —y no se ve—.
 *
 * Fuera de producción se permite un valor de desarrollo para no estorbar.
 */
export function secretoJwt(): string {
  const s = process.env.JWT_SECRET;
  if (s && s.trim().length >= 16) return s;
  if (process.env.NODE_ENV === 'production') {
    // eslint-disable-next-line no-console
    console.error(
      '\n[ARRANQUE ABORTADO] Falta JWT_SECRET, o tiene menos de 16 caracteres.\n' +
      'Sin él los tokens se firmarían con un secreto conocido y cualquiera\n' +
      'podría fabricarse una sesión de administrador.\n' +
      'Ponlo en las variables del servicio:  JWT_SECRET=<cadena larga y aleatoria>\n',
    );
    process.exit(1);
  }
  return 'desarrollo_local_no_usar_en_produccion';
}
