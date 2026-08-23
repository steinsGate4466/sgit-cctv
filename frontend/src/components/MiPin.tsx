import { useEffect, useState, FormEvent } from 'react';
import { api } from '../api/client';
import Modal from './Modal';

/**
 * PIN de campo del propio usuario.
 *
 * Para qué sirve: reanudar una orden en campo sin teclear la contraseña
 * completa con guantes puestos. NO sustituye a la firma — abrir y cerrar una
 * orden siguen exigiendo contraseña.
 *
 * El PIN lo elige el usuario, no se envía por correo: en el piso del tren la
 * señal es mala y depender del correo dejaría al técnico trabado sin poder
 * registrar nada. El correo se usa para AVISAR del cambio, que es lo que
 * protege de verdad: si alguien te lo cambia, te enteras.
 */
export default function MiPin({ onClose }: { onClose: () => void }) {
  const [estado, setEstado] = useState<any>(null);
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [listo, setListo] = useState('');

  useEffect(() => {
    api.get('/users/pin').then((r) => setEstado(r.data)).catch(() => setEstado({ tienePin: false }));
  }, []);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(''); setListo('');
    if (pin !== pin2) { setError('Los dos PIN no coinciden.'); return; }
    setGuardando(true);
    try {
      const r = await api.post('/users/pin', { password, pin });
      setListo(`PIN actualizado. Se envió aviso a ${r.data?.email || 'tu correo'}.`);
      setPassword(''); setPin(''); setPin2('');
      setEstado({ tienePin: true, actualizadoEn: new Date().toISOString() });
    } catch (err: any) {
      const m = err?.response?.data?.message;
      setError(Array.isArray(m) ? m.join(', ') : m || 'No se pudo guardar el PIN.');
    } finally { setGuardando(false); }
  }

  return (
    <Modal title="Mi PIN de campo" onClose={onClose}>
      <form onSubmit={guardar}>
        <div className="sign-note">
          Sirve para reanudar una orden en campo sin escribir la contraseña
          completa. Abrir y cerrar una orden seguirán pidiendo tu contraseña.
        </div>

        {estado && (
          <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
            {estado.tienePin
              ? `Ya tienes un PIN configurado${estado.actualizadoEn
                  ? ` (${new Date(estado.actualizadoEn).toLocaleDateString('es-PE')})` : ''}.`
              : 'Todavía no tienes PIN.'}
          </div>
        )}

        <label>Tu contraseña actual
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          required autoComplete="current-password" />
        </label>
        <div className="muted" style={{ fontSize: 11, marginTop: -6, marginBottom: 10 }}>
          Se pide para que nadie pueda ponerte un PIN aprovechando tu sesión abierta.
        </div>

        <label>PIN nuevo (4 a 8 dígitos)
          <input type="password" inputMode="numeric" pattern="\d{4,8}" maxLength={8}
          value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} required />
        </label>

        <label>Repite el PIN
          <input type="password" inputMode="numeric" pattern="\d{4,8}" maxLength={8}
          value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))} required />
        </label>
        <div className="muted" style={{ fontSize: 11, marginTop: -6, marginBottom: 10 }}>
          No puede ser un dígito repetido (1111) ni una secuencia (1234).
        </div>

        {error && (
          <div style={{ background: '#fee2e2', color: '#991b1b', padding: '8px 10px', borderRadius: 6, fontSize: 13 }}>
            {error}
          </div>
        )}
        {listo && (
          <div style={{ background: '#dcfce7', color: '#166534', padding: '8px 10px', borderRadius: 6, fontSize: 13 }}>
            {listo}
          </div>
        )}

        <button className="btn" disabled={guardando} style={{ marginTop: 12 }}>
          {guardando ? 'Guardando…' : estado?.tienePin ? 'Cambiar PIN' : 'Crear PIN'}
        </button>
      </form>
    </Modal>
  );
}
