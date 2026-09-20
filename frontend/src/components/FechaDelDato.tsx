import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { escucharUltimaCarga, reiniciarUltimaCarga, ultimaCarga } from '../api/client';
import { hora } from '../fechas';

/**
 * CUÁNDO SE TRAJO LO QUE ESTÁS VIENDO — bloque 112.
 *
 * =============================================================================
 *  LA PETICIÓN, Y EL NÚMERO QUE LA JUSTIFICA
 * =============================================================================
 *  «En cada dashboard siempre tiene que haber un apartado de fecha en la que se
 *   actualizó.»
 *
 *  De las 56 pantallas, **7** lo enseñaban. Las otras 49 dejaban creer que lo
 *  que se ve es de ahora mismo. En el púlpito de Laminación, donde la pantalla
 *  lleva ocho horas abierta, eso no es un detalle de presentación: el jefe de
 *  turno mira de pasada, ve todo en verde y está leyendo la madrugada.
 *
 *  Es un fallo mudo — la pantalla no parece rota, parece tranquila — y por eso
 *  llevaba tanto tiempo ahí.
 *
 * =============================================================================
 *  POR QUÉ VIVE EN LA CABECERA Y NO EN CADA PANTALLA
 * =============================================================================
 *  Ponerlo pantalla por pantalla son tres ediciones en cada una de las 49 y
 *  147 sitios donde equivocarse. Y la que se olvide queda igual que antes sin
 *  que nadie lo note, porque **la ausencia de un aviso no se ve**.
 *
 *  Aquí es un solo sitio, y una pantalla nueva nace cubierta sin que su autor
 *  tenga que acordarse de nada.
 *
 * =============================================================================
 *  LO QUE AFIRMA, Y LO QUE NO
 * =============================================================================
 *  Afirma cuándo llegó la última respuesta buena. NO afirma que todos los
 *  paneles sean de esa hora: si uno falló, el suyo es más viejo. Por eso dice
 *  «Datos traídos hace X» y no «todo actualizado» — un hecho comprobable en
 *  lugar de una garantía que no se puede dar.
 *
 *  Y cuando el dato envejece se pone en ámbar. El umbral es generoso a
 *  propósito: si se encendiera a los dos minutos estaría encendido siempre, y
 *  un aviso que está siempre encendido no avisa de nada.
 */

/** A partir de aquí el dato deja de ser «de ahora». */
const VIEJO_MIN = 10;

export default function FechaDelDato() {
  const loc = useLocation();
  const [t, setT] = useState<number | null>(() => ultimaCarga());
  const [, repintar] = useState(0);

  /* AL CAMBIAR DE PANTALLA SE REINICIA. Sin esto, una pantalla que todavía no
     ha respondido heredaría la hora de la anterior y diría «hace 3 s» sobre
     una tabla vacía — exactamente la mentira que esto viene a quitar. */
  useEffect(() => {
    reiniciarUltimaCarga();
    setT(null);
  }, [loc.pathname]);

  useEffect(() => escucharUltimaCarga(setT), []);

  /* El número avanza solo. Un «hace 2 min» congelado en 2 durante media hora
     es el mismo engaño con otra cara (bloque 42). */
  useEffect(() => {
    const id = window.setInterval(() => repintar((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  if (!t) return <span className="fecha-dato muted">Consultando…</span>;

  const seg = Math.max(0, Math.floor((Date.now() - t) / 1000));
  const min = Math.floor(seg / 60);
  const cuanto = seg < 60 ? 'hace un momento'
    : min < 60 ? `hace ${min} min`
      : `hace ${Math.floor(min / 60)} h`;

  return (
    <span className={min >= VIEJO_MIN ? 'fecha-dato viejo' : 'fecha-dato'}
      title={`Última respuesta del servidor a las ${hora(t)}`}>
      Datos {cuanto}
    </span>
  );
}
