import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { alCambiarPendientes, listarPendientes, borrarPendiente, subirPendientes, hayRed, Pendiente } from '../cola-offline';
import { useDialogos } from './Dialogos';
import { fechaHora } from '../fechas';

/**
 * LA BARRA DE PENDIENTES (bloque 12.6).
 *
 * Sólo aparece si hay algo esperando. Un aviso permanente de "todo bien" es
 * ruido que la gente aprende a no mirar, y el día que dice algo tampoco lo
 * miran.
 *
 * Reintenta solo cuando vuelve la conexión (`online`) y también cada 60 s,
 * porque `navigator.onLine` miente: en planta el móvil dice que tiene red y
 * en realidad no llega a ningún sitio.
 */
export default function AvisoPendientes() {
  const { confirmar } = useDialogos();
  const [cuantos, setCuantos] = useState(0);
  const [lista, setLista] = useState<Pendiente[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [subiendo, setSubiendo] = useState(false);

  const refrescar = useCallback(async () => setLista(await listarPendientes()), []);

  const intentar = useCallback(async () => {
    if (subiendo) return;
    setSubiendo(true);
    try {
      await subirPendientes(async (p) => {
        await api.request({ url: p.url, method: p.metodo, data: p.cuerpo });
      });
      await refrescar();
    } finally {
      setSubiendo(false);
    }
  }, [subiendo, refrescar]);

  useEffect(() => alCambiarPendientes(setCuantos), []);

  useEffect(() => {
    if (cuantos > 0) refrescar();
  }, [cuantos, refrescar]);

  useEffect(() => {
    const alVolver = () => { intentar(); };
    window.addEventListener('online', alVolver);
    // El temporizador existe porque `online` no siempre dispara: el móvil
    // puede tener "red" y no alcanzar el servidor. Cada minuto se prueba.
    const t = setInterval(() => { if (hayRed()) intentar(); }, 60_000);
    // Un intento al montar, por si quedó algo de la sesión anterior.
    if (hayRed()) intentar();
    return () => { window.removeEventListener('online', alVolver); clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (cuantos === 0) return null;

  return (
    <div className="pendientes">
      <div className="pd-barra" onClick={() => setAbierto((v) => !v)} role="button" tabIndex={0}>
        <span className="pd-punto" />
        <span>
          <b>{cuantos}</b> {cuantos === 1 ? 'registro guardado en este teléfono' : 'registros guardados en este teléfono'}
          {' '}— se suben solos cuando haya señal
        </span>
        <button
          className="btn-mini"
          onClick={(e) => { e.stopPropagation(); intentar(); }}
          disabled={subiendo}
        >
          {subiendo ? 'Subiendo…' : 'Reintentar'}
        </button>
        <span className="pd-chevron">{abierto ? '▾' : '▸'}</span>
      </div>

      {abierto && (
        <div className="pd-lista">
          {lista.map((p) => (
            <div key={p.id} className="pd-item">
              <div>
                <b>{p.titulo}</b>
                <div className="muted" style={{ fontSize: 11.5 }}>
                  Guardado {fechaHora(p.creadoEn)}
                  {p.intentos > 0 && ` · ${p.intentos} intento(s)`}
                  {p.ultimoError && ` · ${p.ultimoError}`}
                </div>
              </div>
              <button
                className="btn-mini"
                title="Descartar este borrador"
                onClick={async () => {
                  if (await confirmar(`¿Descartar «${p.titulo}»?\n\nSe pierde lo escrito y no se subirá nunca.`)) {
                    borrarPendiente(p.id).then(refrescar);
                  }
                }}
              >
                Descartar
              </button>
            </div>
          ))}
          <div className="pd-nota">
            Esto está guardado <b>sólo en este teléfono</b>. Si borras los datos del
            navegador o cambias de equipo, se pierde. Por eso conviene subirlo en
            cuanto haya señal.
          </div>
        </div>
      )}
    </div>
  );
}
