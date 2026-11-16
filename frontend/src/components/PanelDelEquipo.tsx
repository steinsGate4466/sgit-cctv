import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { fecha } from '../fechas';
import Modal from './Modal';
import Icono from './Iconos';
import TrabajoDesdeElQR from './TrabajoDesdeElQR';
import HistorialActivo from './HistorialActivo';
import RepuestosDelActivo from './RepuestosDelActivo';
import DocumentosDelActivo from './DocumentosDelActivo';

/* =============================================================================
   GESTIONAR UN EQUIPO SIN SALIR DE DONDE ESTÁS — bloque 186
   -----------------------------------------------------------------------------
   Pedido: «que desde el mapa se puedan realizar varias gestiones, de
   infraestructura y de información». Hasta aquí la tarjeta del mapa sólo
   ENLAZABA: «Ficha», «Ir a la orden»… y cada enlace te sacaba del plano. Al
   volver había que buscar otra vez el punto.

   Esta ventana se abre ENCIMA y, al cerrarla, sigues en el mismo punto.

   NO ES UNA SEGUNDA FICHA NI UN FORMULARIO NUEVO. Cada pestaña es la pieza que
   ya usa su módulo, con sus permisos y su auditoría:
     · Trabajo     → la del QR: anotar el avance de las órdenes vivas.
     · Historial   → la línea de vida de Activos (órdenes, incidencias, fotos).
     · Repuestos   → lo que hay en almacén para este equipo.
     · Documentos  → los del módulo Documentos.
   Así sigue valiendo la regla del §58 con otras palabras: el mapa no gana
   reglas propias; el que guarda es el módulo. `verificar:mapa` sólo deja que
   el mapa abra ESTA ventana y los formularios de reporte.
============================================================================= */

interface Pestana { v: string; t: string; icono: string }

const LETRA: Record<string, string> = { A: 'A · se revisa más seguido', B: 'B', C: 'C · la que menos exige' };

export default function PanelDelEquipo({ assetId, codigo, generarOm, alCerrar, alCambiar }: {
  assetId: string;
  codigo: string;
  /** Enlace a «nueva OM» con el equipo ya puesto: lo arma quien abre el panel. */
  generarOm?: string;
  alCerrar: () => void;
  /** Se anotó un avance: quien abrió el panel vuelve a pedir su estado. */
  alCambiar?: () => void;
}) {
  const { can } = useAuth();
  const pestanas: Pestana[] = [
    { v: 'resumen', t: 'Resumen', icono: 'activos' },
    ...(can('wo.read') || can('om.mirar') || can('wo.update') ? [{ v: 'trabajo', t: 'Trabajo', icono: 'orden' }] : []),
    { v: 'historial', t: 'Historial', icono: 'reloj' },
    ...(can('inventory.read') ? [{ v: 'repuestos', t: 'Repuestos', icono: 'inventario' }] : []),
    ...(can('document.read') ? [{ v: 'documentos', t: 'Documentos', icono: 'pdf' }] : []),
  ];
  const [tab, setTab] = useState('resumen');
  const [a, setA] = useState<any>(null);
  const [fallo, setFallo] = useState('');
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let vivo = true;
    api.get('/assets/' + assetId)
      .then((r) => { if (vivo) { setA(r.data); setFallo(''); } })
      .catch(() => { if (vivo) setFallo('No se pudo leer la ficha de este equipo.'); });
    return () => { vivo = false; };
  }, [assetId, recarga]);

  const abiertas = (a?.workOrders || []).filter((o: any) => ['ABIERTA', 'EN_PROCESO', 'EN_ESPERA'].includes(o.status));
  const letra = a?.criticidadAbc?.letra;
  const guardado = () => { setRecarga((n) => n + 1); alCambiar?.(); };

  return (
    <Modal title={codigo} onClose={alCerrar} ancho>
      <div className="ficha-pestanas" role="tablist" aria-label="Gestión del equipo">
        {pestanas.map((p) => (
          <button key={p.v} type="button" role="tab" aria-selected={tab === p.v}
            className={'ficha-pestana' + (tab === p.v ? ' activa' : '')} onClick={() => setTab(p.v)}>
            <Icono n={p.icono} size={15} /> {p.t}
            {p.v === 'trabajo' && abiertas.length > 0 ? <span className="ficha-cuenta">{abiertas.length}</span> : null}
          </button>
        ))}
      </div>

      {fallo && <div role="alert" className="aviso-error">{fallo}</div>}

      {tab === 'resumen' && (!a ? !fallo && <p className="muted">Cargando…</p> : (
        <>
          <dl className="kv panel-equipo-datos">
            <dt>Equipo</dt><dd>{[a.brand, a.model].filter(Boolean).join(' ') || 'Sin marca ni modelo'}</dd>
            {a.serialNumber && <><dt>Serie</dt><dd>{a.serialNumber}</dd></>}
            {a.referencePlace && <><dt>Dónde</dt><dd>{a.referencePlace}</dd></>}
            {a.ipAddress && <><dt>IP</dt><dd>{a.ipAddress}</dd></>}
            <dt>Criticidad</dt>
            <dd>
              {letra && letra !== 'SIN_CLASIFICAR'
                ? `${LETRA[letra] || letra} · cada ${a.criticidadAbc.diasEntreRevisiones} días`
                : 'Sin clasificar'}
            </dd>
            <dt>Próximo preventivo</dt>
            <dd>{a.preventivePlan?.nextDueAt ? fecha(a.preventivePlan.nextDueAt) : 'Sin plan'}</dd>
          </dl>
          {letra === 'SIN_CLASIFICAR' && a.criticidadAbc?.faltaDeclarar?.length > 0 && (
            <p className="muted panel-equipo-nota">{a.criticidadAbc.faltaDeclarar.join(' ')}</p>
          )}
          {a.porQueEseEstado?.texto && <div className="aviso-mapa">{a.porQueEseEstado.texto}</div>}
          <div className="tarjeta-mapa-acciones">
            {(can('asset.read') || can('activos.mirar')) && (
              <Link className="btn-mini" to={can('asset.read') ? `/assets?activo=${assetId}` : `/a/${assetId}`}>Abrir la ficha completa</Link>
            )}
          </div>
        </>
      ))}

      {tab === 'trabajo' && (!a ? !fallo && <p className="muted">Cargando…</p> : (
        <>
          {abiertas.length === 0 && <p className="muted">No tiene órdenes abiertas.</p>}
          <TrabajoDesdeElQR ordenes={abiertas} alGuardar={guardado} />
          <div className="tarjeta-mapa-acciones">
            {abiertas.length === 0 && generarOm && can('wo.create') && <Link className="btn-primary" to={generarOm}>Generar OM</Link>}
            {abiertas.length > 0 && (can('wo.read') || can('om.mirar')) && (
              <Link className="btn-mini" to={`/maintenance?om=${encodeURIComponent(abiertas[0].code)}`}>Ir a la orden</Link>
            )}
          </div>
        </>
      ))}

      {tab === 'historial' && <HistorialActivo assetId={assetId} compacto />}
      {tab === 'repuestos' && <RepuestosDelActivo assetId={assetId} />}
      {tab === 'documentos' && <DocumentosDelActivo assetId={assetId} assetCode={codigo} />}
    </Modal>
  );
}
