import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('admin@acerosarequipa.local');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
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
    } catch {
      const left = tries - 1;
      setTries(left);
      setError(left > 0
        ? `Contraseña incorrecta. Te quedan ${left} intento(s).`
        : 'Demasiados intentos fallidos. Espera un momento antes de reintentar.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <div className="logo">SGIT-CCTV</div>
          <div className="sub">Gestión de Infraestructura y Tecnología · Aceros Arequipa</div>
          <div className="bar" />
        </div>
        <label>Correo</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="username" />
        <label>Contraseña</label>
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" placeholder="••••••••" />
        {error && <div className="error">{error}</div>}
        <button className="btn" disabled={loading || tries <= 0}>{loading ? 'Ingresando…' : 'Ingresar'}</button>
      </form>
    </div>
  );
}
