import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import Icono from '../components/Iconos';
import { EsqueletoTablero } from '../components/Esqueleto';
import { NadaPendiente } from '../components/Ilustraciones';
import { useVolverALaPantalla } from '../useVolverALaPantalla';
import { useAuth } from '../auth/AuthContext';
import { Cifras, Titular, Tono } from '../components/Patron';
import { WO_STATUS_ES } from './omCatalogos';
import { fechaTabla } from '../fechas';

/**
 * El tono de la línea.
 *
 * SIN CÁMARAS NO ES «BIEN», ES «SIN DATOS». La versión anterior calculaba el
 * porcentaje con `total > 0 ? ... : 100` y un tren vacío salía al 100 % en
 * verde. Un tren que nadie ha cargado no está sano: está sin medir, y el
 * gris lo dice sin tranquilizar a nadie.
 */
const tono = (total: number, caidos: number): Tono => {
  if (total === 0) return 'sindatos';
  if (caidos === 0) return 'bien';
  /* Una sola cámara caída ya es «atender». Se pasa a grave a partir de dos, o
     cuando es más de la décima parte de la línea. */
  return caidos >= 2 || caidos / total > 0.1 ? 'grave' : 'atender';
};

/**
 * MI TREN — la pantalla de Producción.
 *
 * La pidió el ingeniero para el jefe de línea: que vea el estado de SU tren
 * y las órdenes en curso, que pueda descargarse el informe, y **que no pueda
 * intervenir**.
 *
 * POR QUÉ ES UNA PANTALLA APARTE Y NO EL TABLERO CON MENOS BOTONES
 *
 * Quien la usa no mantiene nada: produce. Su pregunta es una sola —
 * *"¿cuándo vuelve mi cámara?"*— y el tablero del ingeniero no la responde:
 * la entierra entre MTTR, avance del mapeo y repuestos bajo mínimo.
 *
 * Así que aquí no hay indicadores de gestión. Hay tres cosas:
 *   1. Si su tren está viendo o no, y cuánto.
 *   2. Qué está caído AHORA MISMO y qué se está haciendo al respecto.
 *   3. El informe, para llevárselo a su reunión.
 *
 * LA SEGURIDAD NO ESTÁ AQUÍ. Esta pantalla no filtra nada: el servidor ya
 * le devuelve únicamente su tren (bloque 4C). Si escribe otro tren en la
 * dirección, no lo ve. Un filtro de pantalla nunca es un permiso.
 */
export default function MiTren() {
  const { can } = useAuth();
  const [datos, setDatos] = useState<any>(null);
  /* Órdenes VIVAS por tren (código → lista). AUDITORÍA 21/10: antes se pedía
     `status=ABIERTA` y se filtraba por `o.tren`, un campo que la lista de
     órdenes no trae: la pantalla decía «nada pendiente» con cuatro órdenes en
     marcha en el tren. Ahora se piden al servidor por tren, ya cruzadas con el
     ámbito del usuario. */
  const [ordenes, setOrdenes] = useState<Record<string, any[]>>({});
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState('');

  const cargar = useCallback(async () => {
    // No se traga el error en silencio: «no hay datos» y «no pude preguntar»
    // son cosas distintas.
    try {
      const infra = await api.get('/dashboard/infra/trenes').then((r) => r.data);
      const trenes: any[] = infra?.trenes || [];
      const listas = await Promise.all(trenes.map((t) =>
        api.get('/work-orders', { params: { vivas: 1, tren: t.code, pageSize: 50 } })
          .then((r) => [t.code, r.data?.data || r.data?.items || []] as const)));
      setDatos(infra);
      setOrdenes(Object.fromEntries(listas));
      setFallo('');
    } catch (e: any) {
      setFallo(
        e?.response?.status === 403
          ? 'Tu usuario no tiene permiso para ver esta pantalla.'
          : 'No se pudo consultar el estado. Vuelve a intentarlo en un momento.',
      );
    }
  }, []);

  useEffect(() => { cargar().finally(() => setCargando(false)); }, [cargar]);

  // Bloque 37: al volver del bolsillo, lo que se ve es lo que hay.
  useVolverALaPantalla(cargar);

  if (cargando) return <EsqueletoTablero kpis={3} paneles={1} />;

  if (fallo) {
    return (
      <div className="card vacio">
        <h3>No se pudo cargar</h3>
        <p>{fallo}</p>
        <button className="btn-primary" style={{ marginTop: 16 }}
          onClick={() => { setCargando(true); cargar().finally(() => setCargando(false)); }}>
          Reintentar
        </button>
      </div>
    );
  }

  const trenes: any[] = datos?.trenes || [];

  if (trenes.length === 0) {
    return (
      <div className="card vacio">
        <h3>Todavía no tienes un tren asignado</h3>
        <p>Pide al ingeniero que te lo asigne en Usuarios.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="page-title">Mi tren</h1>

      {trenes.map((t) => {
        const a = t.activos || {};
        /* AUDITORÍA 21/10: contaba TODOS los equipos y sumaba `a.mantenimiento`,
           un campo que no existe (el servidor manda `enMantenimiento`). Decía
           «1 cámara no está viendo» con cuatro caídas. Ahora son CÁMARAS, con
           el mismo cálculo que «Cámaras» y «Comparar trenes». */
        const total = a.camaras ?? 0;
        const caidos = Math.min(a.camarasCaidas ?? 0, total);
        const viendo = total - caidos;
        const suyas = ordenes[t.code] || [];
        const nombre = t.nombre || t.code;

        return (
          <div key={t.code || t.id} style={{ marginBottom: 26 }}>
            <Titular
              tono={tono(total, caidos)}
              texto={
                total === 0
                  ? `${nombre}: todavía sin cámaras cargadas`
                  : caidos === 0
                    ? `${nombre}: con vista completa`
                    : `${caidos} ${caidos === 1 ? 'cámara sin imagen' : 'cámaras sin imagen'} en ${nombre}`
              }
              apoyo={total === 0 ? 'Sin cámaras no se mide nada: ni 0 % ni 100 %.' : undefined}
            />

            {total > 0 && (
              <Cifras
                datos={[
                  { n: viendo, de: total, et: 'con imagen' },
                  { n: suyas.length, et: suyas.length === 1 ? 'orden en curso' : 'órdenes en curso' },
                ]}
              />
            )}

            <div className="bloque-titulo">Órdenes en curso</div>

            {suyas.length === 0 ? (
              <div className="card vacio">
                <NadaPendiente size={110} />
                <h3>Nada pendiente en tu línea</h3>
              </div>
            ) : (
              <div className="card desliza">
                <table>
                  <thead>
                    <tr><th>Orden</th><th>Equipo</th><th>Qué pasa</th><th>Estado</th><th>Avance</th><th>Prevista</th></tr>
                  </thead>
                  <tbody>
                    {suyas.map((o) => (
                      <tr key={o.id}>
                        {/* §58: la orden lleva a la orden, ya filtrada. */}
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <Link to={`/maintenance?om=${encodeURIComponent(o.code)}`}>{o.code}</Link>
                          {/* Bloque 180: Producción la reconoce por el N° que creó en SAP. */}
                          {o.externalRef
                            ? <div className="num-sap muted" style={{ fontSize: 11 }}>{'SAP ' + o.externalRef}</div>
                            : <div className="num-sap-falta" style={{ fontSize: 11 }} title="Sin él no se abre: lo apunta quien la creó en SAP">{'Sin N° SAP'}</div>}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>{o.asset?.assetCode || o.zone || '—'}</td>
                        <td title={o.activity || undefined}>{primeraFrase(o.activity || o.description)}</td>
                        <td><span className={'badge ' + (o.status || '')}>{WO_STATUS_ES[o.status] || o.status}</span></td>
                        <td className="num">{o.progressPct ?? 0} %</td>
                        <td>{fechaTabla(o.scheduledDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}

      {/* AUDITORÍA 21/10: decía «sólo consulta; para reportar avisa al
          ingeniero». Falso desde el bloque 139: Producción reporta sus
          incidencias. Se le lleva al formulario, no se le explica. */}
      {can('incident.create') && (
        <div className="hint-link">
          <Icono n="alerta" size={14} />
          <span>¿Una cámara sin imagen?</span>
          <Link className="btn-mini" to="/incidents?nueva=1">Reportar incidencia</Link>
        </div>
      )}
    </div>
  );
}

/** La actividad en la tabla: sólo su primera frase; entera en el `title`. */
function primeraFrase(t?: string | null): string {
  if (!t) return '—';
  const corte = t.search(/[.:;]\s/);
  return corte > 0 && corte < 90 ? t.slice(0, corte) : t.length > 90 ? t.slice(0, 88) + '…' : t;
}
