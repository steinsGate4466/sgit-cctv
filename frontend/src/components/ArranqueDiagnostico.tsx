import { useEffect, useState } from 'react';
import { api } from '../api/client';
import Icono from './Iconos';
import { useAuth } from '../auth/AuthContext';

/**
 * POR DÓNDE EMPEZAR — bloque 51.
 *
 * =============================================================================
 *  QUÉ AÑADE A LA FICHA DEL QR
 * =============================================================================
 *  Cuatro líneas, y ni un dato nuevo. Todo esto ya estaba en el sistema,
 *  repartido entre «De qué depende», «Mapa de red» y el almacén. El técnico no
 *  lo miraba porque a las tres de la mañana, en planta y con el celular, nadie
 *  abre tres pantallas más.
 *
 *  Lo que aporta es el DESCARTE: «los otros 5 equipos de esa antena funcionan,
 *  así que la antena está sana». Eso ahorra el viaje al sitio equivocado, que
 *  es la media hora más cara del turno de noche.
 *
 * =============================================================================
 *  SÓLO PARA QUIEN VA A REPARAR
 * =============================================================================
 *  Se pide con `wo.read`. Producción escanea el mismo QR y ve la ficha del
 *  activo igual que siempre, sin esto: no necesita saber de tableros ni de
 *  repuestos, y llenarle la pantalla de datos técnicos es exactamente lo que
 *  hace que deje de usar el sistema.
 *
 * =============================================================================
 *  SI FALLA, NO DICE NADA
 * =============================================================================
 *  Se carga APARTE de la ficha, porque recorre los enlaces de red y consulta
 *  el almacén. Si esa llamada se cae, la ficha del activo tiene que seguir
 *  sirviendo — un aviso rojo aquí haría creer que el problema es el equipo.
 */
export default function ArranqueDiagnostico({ assetId }: { assetId: string }) {
  const { can } = useAuth();
  const [d, setD] = useState<any>(null);

  useEffect(() => {
    if (!can('wo.read')) return;
    let vivo = true;
    setD(null);
    api.get(`/network/arranque/${assetId}`)
      .then((r) => { if (vivo) setD(r.data); })
      .catch(() => { /* silencio a propósito: ver el comentario de arriba */ });
    return () => { vivo = false; };
  }, [assetId, can]);

  if (!can('wo.read') || !d) return null;

  return (
    <div className={`arranque arranque-${d.veredicto}`}>
      <div className="arranque-cabeza">
        <Icono n={d.veredicto === 'COMPARTIDO' ? 'mapeo' : 'alerta'} size={16} />
        <span>Por dónde empezar</span>
      </div>

      {/* El descarte, solo y grande. Es lo único que se lleva quien mira cinco
          segundos antes de salir. */}
      <p className="arranque-descarta">{d.queDescarta}</p>
      <p className="arranque-paso">
        <Icono n="flecha" size={13} /> {d.porDondeEmpezar}
      </p>

      <ul className="arranque-pistas">
        {d.pistas.map((p: any) => (
          <li key={p.clave} className={`pista pista-${p.tono}`}>
            {/* Icono distinto por tono, no sólo color: en el púlpito hay
                reflejo del sol y hay gente que no distingue rojo de ámbar. */}
            <Icono
              n={p.tono === 'PELIGRO' ? 'alerta'
                : p.tono === 'AVISO' ? 'reloj'
                  : p.tono === 'BIEN' ? 'ok' : 'nota'}
              size={14}
            />
            <span>{p.texto}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
