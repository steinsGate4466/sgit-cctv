import { ReactNode, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import MiPin from './MiPin';
import Icono from './Iconos';
import AvisoRed from './AvisoRed';
import ErrorBoundary from './ErrorBoundary';
import { MarcaSGIT } from './Ilustraciones';

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
  '/roles': 'Roles y permisos',
  '/mi-tren': 'Mi tren',
  '/topologia': 'Puntos críticos de la red',
  '/monitoreo': 'Monitoreo de red',
  '/grabadores': 'Grabadores y canales',
  '/avisos': 'Avisos',
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
        // 'Mi tren' sólo aparece si el usuario TIENE ámbito. A quien lo ve
        // todo no le aporta nada: ya tiene Estado por Tren con los tres.
        (user?.ambitoTrenes?.length ?? 0) > 0 && can('dashboard.read') &&
          <NavLink key="mt" to="/mi-tren"><Icono n="tren" /> Mi tren</NavLink>,
        can('dashboard.read') && <NavLink key="bd" to="/bandeja"><Icono n="bandeja" /> Mi bandeja</NavLink>,
        can('dashboard.read') && <NavLink key="d" to="/dashboard"><Icono n="tablero" /> Dashboard</NavLink>,
        can('dashboard.read') && <NavLink key="t" to="/trains"><Icono n="tren" /> Estado por Tren</NavLink>,
      ].filter(Boolean) as ReactNode[],
    },
    {
      titulo: 'Infraestructura',
      items: [
        can('asset.read') && <NavLink key="a" to="/assets"><Icono n="activos" /> Activos</NavLink>,
        can('asset.read') && <NavLink key="g" to="/cabinets"><Icono n="gabinete" /> Gabinetes</NavLink>,
        can('asset.read') && <NavLink key="u" to="/locations"><Icono n="ubicacion" /> Ubicaciones</NavLink>,
        can('asset.read') && <NavLink key="cb" to="/cableado"><Icono n="cableado" /> Cableado</NavLink>,
        can('asset.read') && <NavLink key="mp" to="/mapeo"><Icono n="mapeo" /> Avance del mapeo</NavLink>,
        // Va junto a Puntos críticos porque son la misma conversación: uno
        // dice qué se cae, el otro traduce lo que grita el púlpito.
        can('asset.read') && <NavLink key="gr" to="/grabadores"><Icono n="gabinete" /> Grabadores</NavLink>,
        can('asset.read') && <NavLink key="tp" to="/topologia"><Icono n="predictivo" /> Puntos críticos</NavLink>,
        can('monitor.read') && <NavLink key="mo" to="/monitoreo"><Icono n="reloj" /> Monitoreo</NavLink>,
        can('access.read') && <NavLink key="ac" to="/access"><Icono n="acceso" /> Accesibilidad</NavLink>,
      ].filter(Boolean) as ReactNode[],
    },
    {
      titulo: 'Operación',
      items: [
        can('incident.read') && <NavLink key="i" to="/incidents"><Icono n="incidencia" /> Incidencias</NavLink>,
        can('wo.read') && <NavLink key="m" to="/maintenance"><Icono n="orden" /> Órdenes (OM)</NavLink>,
      ].filter(Boolean) as ReactNode[],
    },
    {
      titulo: 'Mantenimiento',
      items: [
        can('wo.read') && <NavLink key="p" to="/preventive"><Icono n="preventivo" /> Preventivo</NavLink>,
        can('wo.read') && <NavLink key="c" to="/corrective"><Icono n="correctivo" /> Correctivo</NavLink>,
        can('wo.read') && <NavLink key="pr" to="/predictive"><Icono n="predictivo" /> Predictivo</NavLink>,
        can('wo.read') && <NavLink key="me" to="/improvements"><Icono n="mejora" /> Mejora</NavLink>,
      ].filter(Boolean) as ReactNode[],
    },
    {
      titulo: 'Almacén',
      items: [
        can('inventory.read') && <NavLink key="inv" to="/inventory"><Icono n="inventario" /> Inventario</NavLink>,
      ].filter(Boolean) as ReactNode[],
    },
    {
      titulo: 'Sistema',
      items: [
        can('audit.read') && <NavLink key="au" to="/audit"><Icono n="auditoria" /> Auditoría</NavLink>,
        // Avisos lo ve CUALQUIERA: todo el mundo puede vincular su Telegram.
        // La bandeja de salida de dentro sí exige permiso.
        <NavLink key="av" to="/avisos"><Icono n="alerta" /> Avisos</NavLink>,
        can('user.manage') && <NavLink key="us" to="/users"><Icono n="usuarios" /> Usuarios</NavLink>,
        can('role.manage') && <NavLink key="ro" to="/roles"><Icono n="candado" /> Roles y permisos</NavLink>,
      ].filter(Boolean) as ReactNode[],
    },
  ];

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <MarcaSGIT size={30} />
          <div>
            <div className="logo">SGIT<span>-CCTV</span></div>
            <div className="sub">Aceros Arequipa · Pisco</div>
          </div>
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
              title="PIN para reanudar órdenes en campo"><Icono n="pin" size={15} /> Mi PIN</button>
            <button className="logout" onClick={() => logout()}><Icono n="salir" size={15} /> Salir</button>
          </div>
        </header>
        {/* Va aquí, entre la cabecera y el contenido: empuja, no tapa. */}
        <AvisoRed />
        <main className="content">
          {/* La clave está en la `key`: al cambiar de ruta se monta una red
              nueva. Sin eso, una pantalla que falló dejaría el error puesto
              al navegar a otra, y parecería que todo el sistema está roto. */}
          <ErrorBoundary donde={title} key={loc.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
        {verPin && <MiPin onClose={() => setVerPin(false)} />}
      </div>
    </div>
  );
}
