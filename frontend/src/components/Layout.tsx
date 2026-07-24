import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard Ejecutivo',
  '/assets': 'Activos Tecnológicos',
  '/incidents': 'Incidencias',
  '/maintenance': 'Órdenes de Mantenimiento',
  '/preventive': 'Mantenimiento Preventivo',
  '/corrective': 'Mantenimiento Correctivo',
  '/cabinets': 'Gabinetes',
  '/locations': 'Ubicaciones',
  '/inventory': 'Inventario de Repuestos',
  '/audit': 'Auditoría',
  '/users': 'Usuarios',
};

export default function Layout() {
  const { user, logout, can } = useAuth();
  const loc = useLocation();
  const title = TITLES[loc.pathname] || 'SGIT-CCTV';
  const initials = (user?.fullName || 'U')
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">SGIT-CCTV</div>
          <div className="sub">Aceros Arequipa · Pisco</div>
        </div>
        <nav className="nav">
          {can('dashboard.read') && <NavLink to="/dashboard"><span className="ico">▦</span> Dashboard</NavLink>}
          {can('asset.read') && <NavLink to="/assets"><span className="ico">▤</span> Activos</NavLink>}
          {can('asset.read') && <NavLink to="/cabinets"><span className="ico">🗄️</span> Gabinetes</NavLink>}
          {can('asset.read') && <NavLink to="/locations"><span className="ico">📍</span> Ubicaciones</NavLink>}
          {can('incident.read') && <NavLink to="/incidents"><span className="ico">⚠</span> Incidencias</NavLink>}
          {can('wo.read') && <NavLink to="/maintenance"><span className="ico">🔧</span> Mantenimiento</NavLink>}
          {can('wo.read') && <NavLink to="/preventive"><span className="ico">🗓️</span> Preventivo</NavLink>}
          {can('wo.read') && <NavLink to="/corrective"><span className="ico">🛠️</span> Correctivo</NavLink>}
          {can('inventory.read') && <NavLink to="/inventory"><span className="ico">📦</span> Inventario</NavLink>}
          {can('audit.read') && <NavLink to="/audit"><span className="ico">▦</span> Auditoría</NavLink>}
          {can('user.manage') && <NavLink to="/users"><span className="ico">◉</span> Usuarios</NavLink>}
        </nav>
        <div className="foot">v0.1 · F1 · Infraestructura y CCTV</div>
      </aside>

      <div>
        <header className="topbar">
          <div className="title">{title}</div>
          <div className="user">
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: 'var(--text)', fontWeight: 600 }}>{user?.fullName}</div>
              <div>{user?.role}</div>
            </div>
            <div className="avatar">{initials}</div>
            <button className="logout" onClick={logout}>Salir</button>
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
