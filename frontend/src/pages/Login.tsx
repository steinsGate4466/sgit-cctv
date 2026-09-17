import { useState, FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { MarcaSGIT, LineaLaminacion } from '../components/Ilustraciones';
import Icono from '../components/Iconos';

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  // Ruta a la que el usuario quería llegar (ej.: la ficha del activo del QR).
  // DESTINO TRAS INICIAR SESIÓN — validado a propósito.
  //
  // Viene del estado del router: ProtectedRoute guarda aquí a dónde iba el
  // usuario, para devolverlo ahí (el técnico que escanea un QR no debe acabar
  // en el tablero). Pero es un valor que llega desde fuera de este componente,
  // y react-router 6 tiene un aviso de REDIRECCIÓN ABIERTA: una ruta que
  // empieza por barra invertida o por doble barra puede interpretarse como una
  // dirección EXTERNA. Un enlace preparado llevaría al usuario a una copia del
  // login en otro sitio, y ahí entregaría su contraseña.
  //
  // Se valida aquí y no solo actualizando la librería porque esto lo cierra
  // pase lo que pase con la versión: solo se acepta una ruta interna.
  const destino = rutaInternaSegura((location.state as any)?.from);
  // Las dos rutas de QR: /a/ es un equipo, /g/ un gabinete. Si sólo se
  // mirara /a/, quien escanea la etiqueta de un armario sin sesión entraría
  // sin entender por qué acaba en otra pantalla.
  const vieneDeQr = !!destino && (destino.startsWith('/a/') || destino.startsWith('/g/'));
  // El correo NO viene precargado: revelar el usuario administrador en la pantalla
  // de acceso es una fuga de información innecesaria.
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [blocked, setBlocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tries, setTries] = useState(5);
  // Si la sesión se cerró sola por inactividad, el usuario tiene que entender
  // por qué: si no, lo vive como un fallo del sistema.
  const [porInactividad] = useState(
    () => new URLSearchParams(location.search).get('motivo') === 'inactividad',
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      setTries(5);
      // Vuelve a donde iba (ficha del QR, por ejemplo) o al tablero.
      nav(destino || '/dashboard', { replace: true });
    } catch (err: any) {
      /* SIN RESPUESTA NO ES «CONTRASEÑA MAL» — bloque 103.
         ------------------------------------------------------------------
         Lo vio el usuario: con el equipo sin red, el login decía
         «Credenciales incorrectas. Te quedan 4 intento(s)» con la contraseña
         BIEN escrita. Dos daños, y el segundo es el peor:

           1. Miente sobre la causa. Manda a la persona a revisar su
              contraseña cuando lo que hay que revisar es el cable.
           2. GASTA un intento que el servidor nunca recibió. El contador
              baja a cero solo, y quien lo ve cree que está a punto de
              quedarse fuera.

         Cuando axios no recibe respuesta, `err.response` es `undefined`: el
         código de abajo leía un mensaje vacío, no casaba con «bloqueado» y
         caía en la rama de credenciales. Es el mismo fallo que el bloque 88
         encontró en el andamio de Playwright — y que allí se arregló sin
         mirar la pantalla que lo originaba.

         `avisos.ts` ya distingue este caso desde el bloque 67. El login era
         el único sitio que no lo usaba. */
      if (!err?.response) {
        setError('No se pudo conectar con el servidor. Revisa tu conexión y vuelve a '
          + 'intentarlo: la petición no llegó, así que no se ha gastado ningún intento.');
        return;
      }

      // El servidor manda el motivo real (credenciales o bloqueo temporal).
      // Antes se mostraba siempre "contraseña incorrecta", aunque la cuenta
      // estuviera bloqueada, y el usuario no entendía por qué no entraba.
      const raw = err.response?.data?.message;
      const msg = Array.isArray(raw) ? raw.join(', ') : raw || '';
      if (/bloquead/i.test(msg)) {
        setBlocked(true);
        setError(msg);
      } else if (err.response.status === 401) {
        /* SÓLO el 401 gasta intento: es la única respuesta en la que el
           servidor ha comprobado la contraseña y dice que no. */
        const left = tries - 1;
        setTries(left);
        setError(left > 0
          ? `Credenciales incorrectas. Te quedan ${left} intento(s).`
          : 'Demasiados intentos fallidos. La cuenta puede quedar bloqueada temporalmente.');
      } else {
        /* 429 del freno de fuerza bruta, 500, 502 de un despliegue a medias:
           el servidor contestó, pero no sobre la contraseña. Se dice lo que
           él diga, y tampoco se gasta intento. */
        setError(msg || 'El servidor no pudo atender la petición. Vuelve a intentarlo en un momento.');
      }
    } finally {
      setLoading(false);
    }
  }

  const year = new Date().getFullYear();

  return (
    <div className="login-page">
      {/* El aviso EMPUJA el contenido, no flota encima.
          Flotando y fijo, en un celular acostado tapaba el campo de correo
          justo cuando el usuario iba a escribir: el sistema parecía roto dos
          veces seguidas. */}
      {porInactividad && (
        <div className="login-aviso">
          Tu sesión se cerró por inactividad. Vuelve a ingresar.
        </div>
      )}

      <div className="login-wrap">
      {/* Panel de marca — identidad industrial */}
      <div className="login-brandside">
        {/* La línea de laminación, dibujada en vector: horno, castillos, la
            barra al rojo y las cámaras. Va detrás y muy tenue — da identidad
            sin competir con el formulario. Pesa 6 kB; una foto pesaría 300. */}
        <LineaLaminacion className="lb-arte" />
        <div className="lb-content">
          <div className="lb-logo">
            <span className="lb-logo-mark"><MarcaSGIT size={38} /></span>
            <div>
              <div className="lb-title">SGIT<span>-CCTV</span></div>
              <div className="lb-sub">Sistema de Gestión de Infraestructura Tecnológica</div>
            </div>
          </div>

          <div className="lb-company">
            <div className="lb-company-name">ACEROS AREQUIPA</div>
            <div className="lb-plant">Planta Pisco · Trenes de Laminación 1, 2 y 3</div>
          </div>

          <ul className="lb-features">
            <li>Control de activos de CCTV y red industrial</li>
            <li>Mantenimiento preventivo, correctivo y predictivo</li>
            <li>Trazabilidad con firma electrónica y auditoría</li>
          </ul>

          <div className="lb-foot">© {year} Aceros Arequipa · Uso interno autorizado</div>
        </div>
      </div>

      {/* Panel de acceso */}
      <div className="login-formside">
        <form className="login-card" onSubmit={submit}>
          <div className="login-head">
            <h1>Iniciar sesión</h1>
            <p>Ingresa con tu cuenta corporativa</p>
          </div>

          {vieneDeQr && (
            <div className="scan-note" style={{ marginBottom: 14 }}>
              <Icono n="etiqueta" size={16} />
              <span>Escaneaste la etiqueta de un equipo. Al ingresar te llevamos directo a su ficha.</span>
            </div>
          )}

          <label>Correo
            <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="username"
            placeholder="nombre@acerosarequipa.local"
            autoFocus
            required
          />
          </label>

          <label>Contraseña</label>
          <div className="input-pass">
            <input aria-label="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type={showPass ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••"
              required
            />
            <button
              type="button"
              className="pass-toggle"
              onClick={() => setShowPass((v) => !v)}
              tabIndex={-1}
              aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              <Icono n={showPass ? 'ojoNo' : 'ojo'} size={19} />
            </button>
          </div>

          {error && <div className={blocked ? 'error blocked' : 'error'}>{error}</div>}

          <button className="btn" disabled={loading || blocked}>
            {loading ? <><span className="btn-spin" />Verificando…</> : 'Ingresar'}
          </button>

          <div className="login-note">
            <Icono n="candado" size={13} />
            Los accesos quedan registrados en la auditoría del sistema.
          </div>
        </form>
      </div>
      </div>
    </div>
  );
}

/**
 * Solo deja pasar rutas de ESTA aplicación.
 *
 * Acepta:  /assets   ·  /a/123?x=1
 * Rechaza: //evil.com  ·  /\evil.com  ·  https://evil.com  ·  javascript:...
 *
 * La comprobación es por lista blanca (tiene que empezar por una sola barra
 * seguida de algo que no sea barra ni barra invertida), no por lista negra:
 * enumerar lo prohibido siempre deja un hueco.
 */
export function rutaInternaSegura(valor: unknown): string | undefined {
  if (typeof valor !== 'string') return undefined;
  const v = valor.trim();
  if (!/^\/[^/\\]/.test(v)) return undefined;
  return v;
}
