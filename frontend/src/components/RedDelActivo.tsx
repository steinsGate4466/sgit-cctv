import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';

/**
 * LA RED DE ESTE EQUIPO — bloque 109.
 *
 * =============================================================================
 *  LO QUE PEDÍA EL USUARIO, RESUELTO SIN CAMPOS NUEVOS
 * =============================================================================
 *  «No sólo la IP: también la máscara, el prefijo, /16, /24.»
 *
 *  El prefijo, la máscara, la VLAN y la puerta de enlace NO son campos del
 *  equipo: son de la subred a la que pertenece su IP, y esa subred ya está
 *  declarada en IPAM. El servidor cruza las dos cosas y devuelve la ficha de
 *  red entera. Copiarlas al activo habría creado cuatro campos capaces de
 *  contradecir a la subred, y en planta eso es salir con una máscara mala.
 *
 * =============================================================================
 *  LOS DOS AVISOS QUE VALEN UNA MAÑANA
 * =============================================================================
 *  · IP FUERA DE TODA SUBRED DECLARADA — no se inventa una máscara; se dice que
 *    no se sabe y qué hacer para saberlo.
 *  · ESTÁTICA DENTRO DEL POOL DEL DHCP — el servidor puede entregar esa misma
 *    IP a otro equipo la semana que viene y los dos se quedan sin red. El aviso
 *    estaba sólo en la pantalla de IPAM, que casi nadie abre; ahora sale con el
 *    equipo delante.
 */
export default function RedDelActivo({ assetId }: { assetId: string }) {
  const { can } = useAuth();
  const [d, setD] = useState<any>(null);

  /* Guardia del bloque 115. */
  useEffect(() => {
    if (!can('red.read')) return;
    let vivo = true;
    api.get(`/assets/${assetId}/red`)
      .then((r) => { if (vivo) setD(r.data); })
      .catch(() => { if (vivo) setD(null); });
    return () => { vivo = false; };
  }, [assetId, can]);

  if (!can('red.read') || !d || !d.ip) return null;

  const s = d.subred;
  const desajusteVlan = s && d.vlanDeclarada && String(d.vlanDeclarada) !== String(s.vlan);

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <h3 style={{ margin: '0 0 6px', fontSize: 14 }}>Red</h3>

      <div style={{ fontSize: 13 }}>
        <b>{d.ip}</b>
        {s && <span className="muted">{s.prefijo}</span>}
        {d.campo && <span className="muted"> · {d.campo}</span>}
      </div>

      {!s ? (
        <div className="card aviso" style={{ marginTop: 8 }}>
          <b>No se puede saber la máscara de esta IP.</b>
          <p style={{ margin: '4px 0 0', fontSize: 13 }}>{d.motivo}</p>
        </div>
      ) : (
        <table className="tabla" style={{ marginTop: 8 }}>
          <thead>
            <tr><th>Dato</th><th>Valor</th></tr>
          </thead>
          <tbody>
            <tr><td>Subred</td><td>{s.cidr} — {s.nombre}</td></tr>
            <tr><td>Máscara</td><td>{s.mascara || '—'}</td></tr>
            <tr><td>Puerta de enlace</td><td>{s.gateway || 'sin declarar'}</td></tr>
            <tr><td>VLAN</td><td>{s.vlan ?? 'sin declarar'}</td></tr>
            <tr><td>DNS</td><td>{s.dns?.length ? s.dns.join(' · ') : 'sin declarar'}</td></tr>
            <tr><td>Rango</td><td>{s.red} – {s.broadcast} ({s.utiles} útiles)</td></tr>
          </tbody>
        </table>
      )}

      {d.enPoolDhcp && (
        <div className="card peligro" style={{ marginTop: 8 }}>
          <b>Esta IP está dentro del rango que reparte el DHCP.</b>
          <p style={{ margin: '4px 0 0', fontSize: 13 }}>
            El servidor puede entregarla a otro equipo y dejar a los dos sin red.
          </p>
        </div>
      )}

      {desajusteVlan && (
        <div className="card aviso" style={{ marginTop: 8 }}>
          <b>La VLAN del equipo no coincide con la de su subred.</b>
          <p style={{ margin: '4px 0 0', fontSize: 13 }}>
            El equipo dice {String(d.vlanDeclarada)} y la subred {String(s.vlan)}.
          </p>
        </div>
      )}
    </div>
  );
}
