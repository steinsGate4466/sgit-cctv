import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  // El correo NO viene precargado: revelar el usuario administrador en la pantalla
  // de acceso es una fuga de información innecesaria.
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [blocked, setBlocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tries, setTries] = useState(5);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      setTries(5);
      nav('/dashboard');
    } catch (err: any) {
      // El servidor manda el motivo real (credenciales o bloqueo temporal).
      // Antes se mostraba siempre "contraseña incorrecta", aunque la cuenta
      // estuviera bloqueada, y el usuario no entendía por qué no entraba.
      const raw = err?.response?.data?.message;
      const msg = Array.isArray(raw) ? raw.join(', ') : raw || '';
      if (/bloquead/i.test(msg)) {
        setBlocked(true);
        setError(msg);
      } else {
        const left = tries - 1;
        setTries(left);
        setError(left > 0
          ? `Credenciales incorrectas. Te quedan ${left} intento(s).`
          : 'Demasiados intentos fallidos. La cuenta puede quedar bloqueada temporalmente.');
      }
    } finally {
      setLoading(false);
    }
  }

  const year = new Date().getFullYear();

  return (
    <div className="login-wrap">
      {/* Panel de marca — identidad industrial */}
      <div className="login-brandside">
        <div className="lb-content">
          <div className="lb-logo">
            <span className="lb-logo-mark" />
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

          <label>Correo</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="username"
            placeholder="nombre@acerosarequipa.local"
            autoFocus
            required
          />

          <label>Contraseña</label>
          <div className="input-pass">
            <input
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
              {showPass ? '🙈' : '👁'}
            </button>
          </div>

          {error && <div className={blocked ? 'error blocked' : 'error'}>{error}</div>}

          <button className="btn" disabled={loading || blocked}>
            {loading ? 'Verificando…' : 'Ingresar'}
          </button>

          <div className="login-note">
            🔒 Los accesos quedan registrados en la auditoría del sistema.
          </div>
        </form>
      </div>
    </div>
  );
}
