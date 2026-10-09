/* =============================================================================
   ¿ROBO O DOS PETICIONES A LA VEZ? — bloque 170
   -----------------------------------------------------------------------------
   EL BUG, reportado por el usuario: «cuando estás mucho tiempo, a pesar de que
   estás moviendo todo, cambiando de página, igual se sale».

   La actividad no tenía nada que ver. Lo que pasaba:

     1. El token de acceso dura 15 minutos.
     2. Al caducar, la pantalla que estés abriendo lanza VARIAS peticiones a la
        vez (el panel pide órdenes, indicadores, avisos…). Todas reciben 401.
     3. Cada una pedía renovar con EL MISMO refresh token.
     4. La primera lo rotaba. La segunda llegaba 100 ms tarde con el ya rotado,
        y el servidor lo tomaba por un token ROBADO: cerraba TODAS las sesiones
        del usuario, también la recién renovada. Fuera.

   Lo mismo con dos pestañas abiertas: una renueva y la otra llega tarde.

   Reproducido en pruebas con el token a 5 s: 1ª renovación 201, 2ª con el
   mismo token 401 «se cerró por seguridad», y el token NUEVO de la 1ª también
   401. O sea: trabajando, te echa cada vez que coinciden dos peticiones al
   caducar — que con el panel abierto es casi siempre.

   -----------------------------------------------------------------------------
   EL ARREGLO EN EL SERVIDOR (el del navegador está en api/client.ts)

   Un token rotado HACE MENOS DE `GRACIA_MS` y rotado por renovación normal no
   es un robo: es la otra petición del mismo lote. Se le da su par nuevo y no
   se cierra nada. Pasado ese margen, o si se revocó por otro motivo (cierre de
   sesión, cambio de contraseña, «cerrar todas»), sigue valiendo la regla de
   siempre: reutilización = cerrar todo.

   Es la «ventana de reutilización» que usan Auth0 y Okta (OAuth 2.0 Security
   BCP, rotación de refresh tokens). El coste: quien robara un token tendría
   30 segundos justo después de que la víctima lo rotara. Frente a echar a la
   planta cada quince minutos, es el lado bueno del trato.
============================================================================= */

export const GRACIA_MS = 30_000;

export function esRotacionConcurrente(
  sesion: { revocadaEn: Date | null; motivoRevocacion: string | null } | null,
  ahora = Date.now(),
): boolean {
  if (!sesion?.revocadaEn) return false;
  if (sesion.motivoRevocacion !== 'rotado') return false;
  const hace = ahora - new Date(sesion.revocadaEn).getTime();
  return hace >= 0 && hace < GRACIA_MS;
}
