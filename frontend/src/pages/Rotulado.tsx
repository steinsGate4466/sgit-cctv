import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';

/**
 * ESTÁNDAR DE ROTULADO — bloque 36.
 *
 * =============================================================================
 *  QUÉ RESUELVE
 * =============================================================================
 *  En un rack de planta conviven cables de varios contratistas y de varias
 *  épocas. Cuando cada uno rotula a su manera —o no rotula— la consecuencia no
 *  es estética: es que para saber a dónde va un cable hay que TIRAR DE ÉL, y
 *  tirar de un cable en un rack de CCTV de laminación es cómo se cae una zona.
 *
 *  ANSI/TIA-606-C es la norma que ordena esto. Dice dos cosas distintas y
 *  conviene no mezclarlas, porque una auditoría sí las distingue:
 *
 *    · EL IDENTIFICADOR ES OBLIGATORIO. Único, jerárquico, y presente en el
 *      cable, en el puerto y en el registro. Sin eso no hay nada que auditar.
 *
 *    · EL COLOR ES RECOMENDADO. La norma sugiere una correspondencia, pero lo
 *      exigible es que exista un estándar interno, escrito, y aplicado en TODA
 *      la instalación. Un color a medias es PEOR que ninguno: enseña a
 *      desconfiar del rótulo, y a partir de ahí nadie vuelve a fiarse.
 *
 * =============================================================================
 *  POR QUÉ ESTA PANTALLA Y NO UN PDF EN UNA CARPETA
 * =============================================================================
 *  Un estándar en un documento se consulta el primer mes. Aquí el generador
 *  está al lado de la tabla: el técnico que va a instalar una cámara escribe
 *  tipo, tren y zona, y sale el código exacto que tiene que imprimir. No hay
 *  que interpretar la fórmula, y por tanto no hay dos personas que la
 *  interpreten distinto.
 *
 *  El revisor hace el camino inverso: se teclea un código que ya está pegado
 *  en un equipo y dice si cumple. Distingue ERROR de AVISO a propósito —un
 *  formato imposible no entra, pero un desfase con el árbol sólo avisa,
 *  porque puede ser que el equipo se haya movido y el rótulo esté bien.
 *
 *  TODO EL CÁLCULO ESTÁ EN EL BACKEND (`estandar-rotulado.ts`, con pruebas).
 *  Esta pantalla no valida nada por su cuenta: si la fórmula cambiara y la
 *  pantalla tuviera su propia copia, empezarían a discrepar y ganaría la
 *  equivocada, que es la que la gente tiene delante.
 */

const TIPOS = [
  ['CAMERA', 'Cámara'], ['NVR', 'Grabador NVR'], ['SWITCH', 'Switch'],
  ['WIRELESS', 'Punto de acceso'], ['ROUTER', 'Router'], ['FIREWALL', 'Cortafuegos'],
  ['SERVER', 'Servidor'], ['UPS', 'UPS'], ['Fibra'], ['CABINET', 'Gabinete'],
  ['DECODER', 'Decodificador'], ['PC', 'PC'], ['SCREEN', 'Monitor'], ['OTHER', 'Otro'],
];

export default function Rotulado() {
  const [norma, setNorma] = useState<any>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  // --- Generador ---
  const [tipo, setTipo] = useState('CAMERA');
  const [tren, setTren] = useState('T2');
  const [zona, setZona] = useState('');
  const [n, setN] = useState('1');
  const [generado, setGenerado] = useState<any>(null);

  // --- Revisor ---
  const [codigo, setCodigo] = useState('');
  const [revision, setRevision] = useState<any>(null);
  /* Bloque 45. La leyenda de colores viene del CATÁLOGO, no está escrita
     aquí: es la misma lista que usará el formulario de instalación y la
     ficha de cableado. Si cada pantalla tuviera la suya, en seis meses
     dirían cosas distintas. */
  const [colores, setColores] = useState<any[]>([]);

  useEffect(() => {
    api.get('/estandares')
      .then((r) => setNorma(r.data))
      .catch(() => setError('No se pudo cargar el estándar.'))
      .finally(() => setCargando(false));
    api.get('/estandares/colores')
      .then((r) => setColores(r.data || []))
      .catch(() => setColores([]));
  }, []);

  const generar = useCallback(async () => {
    try {
      const r = await api.get('/estandares/rotulo', { params: { tipo, tren, zona, n } });
      setGenerado(r.data);
    } catch { setGenerado(null); }
  }, [tipo, tren, zona, n]);

  /* Se genera EN CUANTO cambia cualquier campo. Sin botón: el código es la
     respuesta directa a lo que se acaba de escribir, y obligar a pulsar
     «Generar» sólo añade un paso donde alguien se queda mirando un resultado
     viejo creyendo que es el nuevo. */
  useEffect(() => { generar(); }, [generar]);

  async function revisar() {
    if (!codigo.trim()) { setRevision(null); return; }
    try {
      const r = await api.post('/estandares/revisar-rotulo', { codigo, tipoActivo: tipo, trenCode: tren });
      setRevision(r.data);
    } catch { setRevision(null); }
  }

  if (cargando) return <div className="page"><div className="card">Cargando el estándar…</div></div>;
  if (error) return <div className="page"><div className="card peligro">{error}</div></div>;

  return (
    <div className="page">
      <h1 className="page-title">Estándar de rotulado</h1>

      <div className="card explica">
        <b>{norma?.norma}</b>
        <div style={{ marginTop: 8 }}>{norma?.nota}</div>
      </div>

      {/* ---------------- COLORES DE CHAQUETA (bloque 45) ----------------
          El color es el rótulo dicho en otro idioma: AA-CAM-... y «cable
          verde» significan lo mismo, uno para quien lee la etiqueta y otro
          para quien está frente al rack con una linterna. */}
      {colores.length > 0 && (
        <div className="card">
          <div className="section-title">Colores de chaqueta del cable</div>
          <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
            La norma no impone un color: exige coherencia. Éste es el estándar
            interno de la planta, y se edita como cualquier catálogo.
          </p>
          <div className="leyenda-colores">
            {colores.map((c) => (
              <div key={c.code} className="color-item">
                <span className="color-chip" style={{ background: c.hex }} />
                <div>
                  <b>{c.nombre}</b> — {c.uso}
                  {c.porQue && <div className="muted" style={{ fontSize: 12 }}>{c.porQue}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---------------- GENERADOR ---------------- */}
      <div className="card">
        <div className="section-title">Cómo se llama este equipo</div>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          Fórmula: <code>{norma?.formula}</code> — por ejemplo <code>{norma?.ejemplo}</code>.
          Se lee de un vistazo estando delante del equipo, que es cuando hace
          falta: el técnico ve el rótulo y ya sabe tren y zona sin sacar el teléfono.
        </p>

        <div className="form-grid">
          <div>
            <label htmlFor="rt-tipo">Tipo de equipo</label>
            <select id="rt-tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {TIPOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="rt-tren">Tren</label>
            <select id="rt-tren" value={tren} onChange={(e) => setTren(e.target.value)}>
              <option value="T1">Tren 1</option>
              <option value="T2">Tren 2</option>
              <option value="T3">Tren 3</option>
              <option value="">Fuera de tren</option>
            </select>
          </div>
          <div>
            <label htmlFor="rt-zona">Zona</label>
            <input
              id="rt-zona" value={zona} onChange={(e) => setZona(e.target.value)}
              placeholder="LECHO, PULPITO, HORNO…"
            />
          </div>
          <div>
            <label htmlFor="rt-n">Número</label>
            <input id="rt-n" type="number" min={1} value={n} onChange={(e) => setN(e.target.value)} />
          </div>
        </div>

        {generado && (
          <>
            {/* LA ETIQUETA, TAL COMO SE VA A IMPRIMIR.
                Dos líneas y monoespaciada, como sale de la impresora de
                campo. Enseñar el código en la tipografía de la web haría que
                pareciera correcto algo que en la etiqueta real no cabe. */}
            <div className="etiqueta-previa">
              <div className="etiqueta-l1">{generado.etiqueta?.linea1 ?? generado.codigo}</div>
              {generado.etiqueta?.linea2 && <div className="etiqueta-l2">{generado.etiqueta.linea2}</div>}
            </div>

            {/* Los avisos NO impiden generar el codigo: lo marcan. Un equipo
                sin zona asignada existe, y negarle rótulo sólo consigue que
                se quede sin rotular. Pero el hueco tiene que verse. */}
            {generado.avisos?.length > 0 && (
              <div className="card peligro" style={{ marginTop: 12 }}>
                <b>El código sale, pero con huecos:</b>
                <ul style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.7 }}>
                  {generado.avisos.map((a: string) => <li key={a}>{a}</li>)}
                </ul>
              </div>
            )}
          </>
        )}
      </div>

      {/* ---------------- REVISOR ---------------- */}
      <div className="card">
        <div className="section-title">Revisar un rótulo que ya está pegado</div>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          Se teclea el código de una etiqueta existente y dice si cumple. Un
          formato imposible es <b>error</b>; un desfase con el árbol es sólo
          <b> aviso</b>, porque puede ser que el equipo se haya movido y el
          rótulo esté bien.
        </p>
        <div className="filters">
          <div style={{ flex: 1 }}>
            <label htmlFor="rt-cod">Código de la etiqueta</label>
            <input
              id="rt-cod" value={codigo}
              onChange={(e) => setCodigo(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === 'Enter') revisar(); }}
              placeholder="AA-CAM-T2-LECHO-014"
              style={{ fontFamily: 'ui-monospace, monospace' }}
            />
          </div>
          <div>
            <label>&nbsp;</label>
            <button className="btn" onClick={revisar}>Revisar</button>
          </div>
        </div>

        {revision && (
          <div className={'card ' + (revision.valido ? 'explica' : 'peligro')} style={{ marginTop: 10 }}>
            <b>{revision.valido ? 'El formato cumple el estándar.' : 'El formato NO cumple.'}</b>
            {revision.errores?.length > 0 && (
              <ul style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.7 }}>
                {revision.errores.map((x: string) => <li key={x}>{x}</li>)}
              </ul>
            )}
            {revision.avisos?.length > 0 && (
              <>
                <div style={{ marginTop: 8, fontSize: 13 }}><b>Avisos</b> (no impiden nada):</div>
                <ul style={{ margin: '4px 0 0', fontSize: 13, lineHeight: 1.7 }}>
                  {revision.avisos.map((x: string) => <li key={x}>{x}</li>)}
                </ul>
              </>
            )}
          </div>
        )}
      </div>

      {/* ---------------- CÓDIGO DE COLOR ---------------- */}
      <div className="card">
        <div className="section-title">Código de color del cable</div>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          El color es <b>recomendado</b>, no obligatorio. Lo que se audita es que
          el criterio esté escrito y se aplique igual en toda la planta. Cada
          fila dice de dónde sale el color: la norma o una decisión interna.
        </p>
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="tabla">
            <thead>
              <tr><th>Color</th><th>Para qué</th><th>De dónde sale</th></tr>
            </thead>
            <tbody>
              {norma?.colores?.map((c: any) => (
                <tr key={c.proposito}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {/* La muestra lleva borde propio: el blanco de VOZ sobre
                        fondo blanco sería invisible sin él. */}
                    <span className="muestra-color" style={{ background: c.hex }} aria-hidden="true" />
                    <b>{c.color}</b>
                  </td>
                  <td style={{ fontSize: 13 }}>{c.usa}</td>
                  <td style={{ fontSize: 12.5 }} className="muted">{c.origen}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---------------- ABREVIATURAS ---------------- */}
      <div className="card">
        <div className="section-title">Abreviaturas por tipo</div>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          Cortas y sin vocales ambiguas: tienen que leerse en una etiqueta de
          6 mm impresa con una etiquetadora de campo.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {Object.entries(norma?.abreviaturas ?? {}).map(([k, v]) => (
            <span key={k} className="chip">
              <b style={{ fontFamily: 'ui-monospace, monospace' }}>{String(v)}</b>
              <span className="muted"> · {k}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
