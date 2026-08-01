import { ReactNode, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import MiPin from './MiPin';

const TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard Ejecutivo',
  '/trains': 'Estado por Tren',
  '/assets': 'Activos Tecnológicos',
  '/cabinets': 'Gabinetes',
  '/locations': 'Ubicaciones',
  '/access': 'Accesibilidad y Trabajo en Altura',
  '/incidents': 'Incidencias',
  '/maintenance': 'Órdenes de Mantenimiento',
  '/preventive': 'Mantenimiento Preventivo',
  '/corrective': 'Mantenimiento Correctivo',
  '/predictive': 'Mantenimiento Predictivo',
  '/improvements': 'Mantenimiento de Mejora',
  '/inventory': 'Inventario de Repuestos',
  '/audit': 'Auditoría',
  '/users': 'Usuarios',
};

/**
 * Menú agrupado por secciones. Con 14 opciones, una lista plana marea;
 * agrupadas por dominio el usuario encuentra las cosas donde las espera.
 */
export default function Layout() {
  const { user, logout, can } = useAuth();
  const [verPin, setVerPin] = useState(false);
  const loc = useLocation();
  const title = TITLES[loc.pathname] || 'SGIT-CCTV';
  const initials = (user?.fullName || 'U')
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  // Cada sección: [título, items visibles según permisos]
  const secciones: { titulo: string; items: ReactNode[] }[] = [
    {
      titulo: '',
      items: [
        // La bandeja va PRIMERA a propósito: es lo que hay que vaciar al
        // llegar. El tablero se mira cuando ya no queda nada esperando.
        can('dashboard.read') && <NavLink key="bd" to="/bandeja"><span className="ico">📥</span> Mi bandeja</NavLink>,
        can('dashboard.read') && <NavLink key="d" to="/dashboard"><span className="ico">▦</span> Dashboard</NavLink>,
        can('dashboard.read') && <NavLink key="t" to="/trains"><span className="ico">🚂</span> Estado por Tren</NavLink>,
      ].filter(Boolean) as ReactNode[],
    },
    {
      titulo: 'Infraestructura',
      items: [
        can('asset.read') && <NavLink key="a" to="/assets"><span className="ico">▤</span> Activos</NavLink>,
        can('asset.read') && <NavLink key="g" to="/cabinets"><span className="ico">🗄️</span> Gabinetes</NavLink>,
        can('asset.read') && <NavLink key="u" to="/locations"><span className="ico">📍</span> Ubicaciones</NavLink>,
        can('asset.read') && <NavLink key="cb" to="/cableado"><span className="ico">🔌</span> Cableado</NavLink>,
        can('asset.read') && <NavLink key="mp" to="/mapeo"><span className="ico">📋</span> Avance del mapeo</NavLink>,
        can('access.read') && <NavLink key="ac" to="/access"><span className="ico">🦺</span> Accesibilidad</NavLink>,
      ].filter(Boolean) as ReactNode[],
    },
    {
      titulo: 'Operación',
      items: [
        can('incident.read') && <NavLink key="i" to="/incidents"><span className="ico">⚠</span> Incidencias</NavLink>,
        can('wo.read') && <NavLink key="m" to="/maintenance"><span className="ico">🔧</span> Órdenes (OM)</NavLink>,
      ].filter(Boolean) as ReactNode[],
    },
    {
      titulo: 'Mantenimiento',
      items: [
        can('wo.read') && <NavLink key="p" to="/preventive"><span className="ico">🗓️</span> Preventivo</NavLink>,
        can('wo.read') && <NavLink key="c" to="/corrective"><span className="ico">🛠️</span> Correctivo</NavLink>,
        can('wo.read') && <NavLink key="pr" to="/predictive"><span className="ico">📈</span> Predictivo</NavLink>,
        can('wo.read') && <NavLink key="me" to="/improvements"><span className="ico">⬆️</span> Mejora</NavLink>,
      ].filter(Boolean) as ReactNode[],
    },
    {
      titulo: 'Almacén',
      items: [
        can('inventory.read') && <NavLink key="inv" to="/inventory"><span className="ico">📦</span> Inventario</NavLink>,
      ].filter(Boolean) as ReactNode[],
    },
    {
      titulo: 'Sistema',
      items: [
        can('audit.read') && <NavLink key="au" to="/audit"><span className="ico">▦</span> Auditoría</NavLink>,
        can('user.manage') && <NavLink key="us" to="/users"><span className="ico">◉</span> Usuarios</NavLink>,
      ].filter(Boolean) as ReactNode[],
    },
  ];

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">SGIT-CCTV</div>
          <div className="sub">Aceros Arequipa · Pisco</div>
        </div>
        <nav className="nav">
          {secciones
            .filter((s) => s.items.length > 0)
            .map((s, i) => (
              <div key={i} className="nav-group">
                {s.titulo && <div className="nav-group-title">{s.titulo}</div>}
                {s.items}
              </div>
            ))}
        </nav>
        <div className="foot">v0.6 · Infraestructura y CCTV</div>
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
            <button className="logout" onClick={() => setVerPin(true)}
              title="PIN para reanudar órdenes en campo">Mi PIN</button>
            <button className="logout" onClick={() => logout()}>Salir</button>
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
        {verPin && <MiPin onClose={() => setVerPin(false)} />}
      </div>
    </div>
  );
}
