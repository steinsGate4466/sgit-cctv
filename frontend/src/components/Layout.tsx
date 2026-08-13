import { ReactNode, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import MiPin from './MiPin';
import Icono from './Iconos';
import BuscadorRapido from './BuscadorRapido';
import AvisoRed from './AvisoRed';
import AvisoPendientes from './AvisoPendientes';
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
  '/conexiones': 'Conexiones de red',
  '/gruas': 'Cámaras de grúa',
  '/documentos': 'Manuales y planos',
  '/limpieza': 'Limpieza de datos',
  '/equipos': 'Equipos conocidos',
  '/paradas': 'Ventanas de parada',
  '/instalaciones': 'Instalaciones',
  '/campanas': 'Campañas de mapeo',
  '/electricidad': 'Electricidad',
  '/ipam': 'Direccionamiento IP',
  '/mi-cuenta': 'Mi cuenta',
  '/indicadores': 'Indicadores de gestión',
  '/exportar': 'Exportar a Excel',
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

  /* MENÚ PLEGABLE (bloque 12.8).
     La barra llegó a ~30 entradas en una sola columna: en un portátil no
     caben y el técnico acaba haciendo scroll para encontrar lo de siempre.

     Se recuerda qué quedó plegado en `localStorage`. Un menú que se cierra
     entero en cada navegación es PEOR que el actual: obliga a reabrir lo
     mismo veinte veces al día. Se guarda lo PLEGADO, no lo abierto, para que
     el estado por defecto —todo abierto— siga siendo el de siempre y una
     sección nueva aparezca visible sin tener que tocar nada. */
  const [plegadas, setPlegadas] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('sgit:menu-plegado') || '[]'); }
    catch { return []; }
  });

  const alternar = (titulo: string) => {
    setPlegadas((antes) => {
      const ahora = antes.includes(titulo)
        ? antes.filter((t) => t !== titulo)
        : [...antes, titulo];
      try { localStorage.setItem('sgit:menu-plegado', JSON.stringify(ahora)); } catch { /* sin persistencia, pero funciona */ }
      return ahora;
    });
  };
  /* BARRA ESTRECHA (bloque 21).
     -------------------------------------------------------------------
     El plegado por secciones ayudó, pero con 38 entradas el problema ya no
     es el alto: es el ANCHO. La barra se come 240 px de una pantalla de
     1366, que es la que hay en los púlpitos, y las tablas de activos salen
     apretadas con scroll horizontal.

     En modo estrecho la barra pasa a 60 px y deja sólo los iconos. Al pasar
     el ratón por encima se despliega, así que no se pierde nada: sólo deja
     de ocupar sitio mientras no se usa.

     Se recuerda, porque quien la estrecha la quiere estrecha siempre. */
  const [estrecha, setEstrecha] = useState<boolean>(() => {
    try { return localStorage.getItem('sgit:menu-estrecho') === '1'; } catch { return false; }
  });
  const alternarAncho = () => {
    setEstrecha((v) => {
      try { localStorage.setItem('sgit:menu-estrecho', v ? '0' : '1'); } catch { /* sin persistencia */ }
      return !v;
    });
  };

  /* LO ÚLTIMO QUE USASTE.
     -------------------------------------------------------------------
     De 38 pantallas, cada persona usa cinco. El técnico de campo vive en
     Activos, Incidencias y Órdenes; el ingeniero en Bandeja y Paradas.
     En vez de obligar a todos a recorrer el mismo menú, las últimas cuatro
     visitadas suben arriba del todo. Es la lista que se ajusta sola a cada
     uno sin que nadie configure nada. */
  const [recientes, setRecientes] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('sgit:recientes') || '[]'); } catch { return []; }
  });
  useEffect(() => {
    if (!TITLES[loc.pathname]) return;
    setRecientes((antes) => {
      const ahora = [loc.pathname, ...antes.filter((r) => r !== loc.pathname)].slice(0, 4);
      try { localStorage.setItem('sgit:recientes', JSON.stringify(ahora)); } catch { /* sin persistencia */ }
      return ahora;
    });
  }, [loc.pathname]);

  const title = TITLES[loc.pathname] || 'SGIT-CCTV';
  const initials = (user?.fullName || 'U')
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  // Cada sección: [título, items visibles según permisos]
  const secciones: { titulo: string; items: ReactNode[]; rutas?: string[] }[] = [
    {
      titulo: '',
      items: [
        // La bandeja va PRIMERA a propósito: es lo que hay que vaciar al
        // llegar. El tablero se mira cuando ya no queda nada esperando.
        // 'Mi tren' sólo aparece si el usuario TIENE ámbito. A quien lo ve
        // todo no le aporta nada: ya tiene Estado por Tren con los tres.
        (user?.ambitoTrenes?.length ?? 0) > 0 && can('dashboard.read') &&
          <NavLink key="mt" to="/mi-tren"><Icono n="mitren" /> Mi tren</NavLink>,
        can('dashboard.read') && <NavLink key="bd" to="/bandeja"><Icono n="bandeja" /> Mi bandeja</NavLink>,
        can('dashboard.read') && <NavLink key="d" to="/dashboard"><Icono n="tablero" /> Dashboard</NavLink>,
        // Indicadores va junto al tablero: uno dice qué pasa hoy, el otro si
        // vamos mejorando o empeorando.
        can('dashboard.read') && <NavLink key="ind" to="/indicadores"><Icono n="indicadores" /> Indicadores</NavLink>,
        // Exportar vive junto al Dashboard: los dos son "mirar y llevarse".
        can('dashboard.read') && <NavLink key="xl" to="/exportar"><Icono n="exportar" /> Exportar</NavLink>,
        can('dashboard.read') && <NavLink key="t" to="/trains"><Icono n="tren" /> Estado por Tren</NavLink>,
      ].filter(Boolean) as ReactNode[],
    },
    {
      titulo: 'Infraestructura',
      rutas: ['/assets', '/cabinets', '/locations', '/access', '/cableado', '/mapeo', '/grabadores', '/conexiones', '/topologia', '/monitoreo', '/documentos', '/instalaciones', '/campanas', '/electricidad', '/ipam'],
      items: [
        can('asset.read') && <NavLink key="a" to="/assets"><Icono n="activos" /> Activos</NavLink>,
        // Instalaciones va junto a Activos porque es de donde salen: una
        // instalación terminada crea el activo.
        can('asset.read') && <NavLink key="ins" to="/instalaciones"><Icono n="instalar" /> Instalaciones</NavLink>,
        can('asset.read') && <NavLink key="g" to="/cabinets"><Icono n="gabinete" /> Gabinetes</NavLink>,
        can('asset.read') && <NavLink key="u" to="/locations"><Icono n="ubicacion" /> Ubicaciones</NavLink>,
        can('asset.read') && <NavLink key="cb" to="/cableado"><Icono n="cableado" /> Cableado</NavLink>,
        // Electricidad va con la infraestructura: de los tableros cuelga la
        // alimentación de las cámaras, y ahí empieza media caída.
        can('asset.read') && <NavLink key="el" to="/electricidad"><Icono n="electricidad" /> Electricidad</NavLink>,
        can('asset.read') && <NavLink key="mp" to="/mapeo"><Icono n="mapeo" /> Avance del mapeo</NavLink>,
        // Campañas va junto al avance: uno cuenta, el otro CONTROLA la calidad.
        can('asset.read') && <NavLink key="cmp" to="/campanas"><Icono n="ok" /> Campañas de mapeo</NavLink>,
        // Va junto a Puntos críticos porque son la misma conversación: uno
        // dice qué se cae, el otro traduce lo que grita el púlpito.
        can('asset.read') && <NavLink key="gr" to="/grabadores"><Icono n="grabador" /> Grabadores</NavLink>,
        // Conexiones va ANTES de Puntos críticos: primero se declara la red,
        // y sólo entonces el análisis de impacto tiene algo que analizar.
        can('asset.read') && <NavLink key="cx" to="/conexiones"><Icono n="puertos" /> Conexiones</NavLink>,
        // Va con Conexiones: primero se declara la red física, después el
        // direccionamiento que corre por encima.
        can('asset.read') && <NavLink key="ip" to="/ipam"><Icono n="ipam" /> Direccionamiento IP</NavLink>,
        // 12.7 — cierra el permiso huerfano: `document.read` existia desde F0
        // y no habia pantalla que lo usara.
        can('document.read') && <NavLink key="dc" to="/documentos"><Icono n="etiqueta" /> Manuales y planos</NavLink>,
        can('asset.read') && <NavLink key="tp" to="/topologia"><Icono n="critico" /> Puntos críticos</NavLink>,
        can('monitor.read') && <NavLink key="mo" to="/monitoreo"><Icono n="reloj" /> Monitoreo</NavLink>,
        can('access.read') && <NavLink key="ac" to="/access"><Icono n="acceso" /> Accesibilidad</NavLink>,
      ].filter(Boolean) as ReactNode[],
    },
    {
      titulo: 'Operación',
      rutas: ['/incidents', '/maintenance', '/paradas'],
      items: [
        can('incident.read') && <NavLink key="i" to="/incidents"><Icono n="incidencia" /> Incidencias</NavLink>,
        can('wo.read') && <NavLink key="m" to="/maintenance"><Icono n="orden" /> Órdenes (OM)</NavLink>,
        // Las paradas van con las órdenes: es cuándo se puede trabajar.
        can('wo.read') && <NavLink key="pa" to="/paradas"><Icono n="parada" /> Ventanas de parada</NavLink>,
      ].filter(Boolean) as ReactNode[],
    },
    {
      titulo: 'Mantenimiento',
      rutas: ['/preventive', '/corrective', '/predictive', '/improvements', '/gruas'],
      items: [
        can('wo.read') && <NavLink key="p" to="/preventive"><Icono n="preventivo" /> Preventivo</NavLink>,
        can('wo.read') && <NavLink key="c" to="/corrective"><Icono n="correctivo" /> Correctivo</NavLink>,
        can('wo.read') && <NavLink key="pr" to="/predictive"><Icono n="predictivo" /> Predictivo</NavLink>,
        can('wo.read') && <NavLink key="me" to="/improvements"><Icono n="mejora" /> Mejora</NavLink>,
        // Cámaras de grúa: mantenimiento propio porque falla distinto
        // (cable fatigado, antena desalineada, no se llega sin manlift).
        can('wo.read') && <NavLink key="gr2" to="/gruas"><Icono n="grua" /> Cámaras de grúa</NavLink>,
      ].filter(Boolean) as ReactNode[],
    },
    {
      titulo: 'Almacén',
      rutas: ['/inventory'],
      items: [
        can('inventory.read') && <NavLink key="inv" to="/inventory"><Icono n="inventario" /> Inventario</NavLink>,
      ].filter(Boolean) as ReactNode[],
    },
    {
      titulo: 'Sistema',
      rutas: ['/users', '/roles', '/audit', '/avisos', '/equipos', '/limpieza', '/mi-cuenta'],
      items: [
        can('audit.read') && <NavLink key="au" to="/audit"><Icono n="auditoria" /> Auditoría</NavLink>,
        // Avisos lo ve CUALQUIERA: todo el mundo puede vincular su Telegram.
        // La bandeja de salida de dentro sí exige permiso.
        <NavLink key="av" to="/avisos"><Icono n="alerta" /> Avisos</NavLink>,
        // Mi cuenta lo ve CUALQUIERA: son sus propias sesiones. Ahí está el
        // botón de "me robaron el teléfono", que revoca de verdad.
        <NavLink key="mc" to="/mi-cuenta"><Icono n="usuarios" /> Mi cuenta</NavLink>,
        can('user.manage') && <NavLink key="us" to="/users"><Icono n="usuarios" /> Usuarios</NavLink>,
        can('role.manage') && <NavLink key="ro" to="/roles"><Icono n="candado" /> Roles y permisos</NavLink>,
        // Traduce la IP de la auditoría en un sitio de la planta. Va aquí, al
        // lado de Auditoría, porque es la pantalla que la hace legible.
        can('asset.read') && <NavLink key="eq" to="/equipos"><Icono n="pc" /> Equipos conocidos</NavLink>,
        // Borrado definitivo. Último de la lista a propósito: no es un sitio
        // al que se entre por costumbre.
        can('asset.delete') && <NavLink key="li" to="/limpieza"><Icono n="escoba" /> Limpieza de datos</NavLink>,
      ].filter(Boolean) as ReactNode[],
    },
  ];

  return (
    <div className="app">
      {/* Ctrl+K para saltar a cualquier pantalla. Con 34 entradas en el
          menú, escribir «parada» es más rápido que recordar en qué sección
          vive. */}
      <BuscadorRapido />
      <aside className={'sidebar' + (estrecha ? ' estrecha' : '')}>
        {/* Estrechar / ensanchar. Va arriba y pequeño: se usa una vez y se
            olvida, no tiene que competir con el menú por la atención. */}
        <button className="sidebar-ancho" onClick={alternarAncho}
          title={estrecha ? 'Ensanchar el menú' : 'Estrechar el menú y ganar sitio para las tablas'}
          aria-label={estrecha ? 'Ensanchar el menú' : 'Estrechar el menú'}>
          {estrecha ? '»' : '«'}
        </button>
        <div className="brand">
          <MarcaSGIT size={30} />
          <div>
            <div className="logo">SGIT<span>-CCTV</span></div>
            <div className="sub">Aceros Arequipa · Pisco</div>
          </div>
        </div>
        <nav className="nav">
          {/* LO ÚLTIMO QUE USASTE. De 38 pantallas cada persona usa cinco:
              esto las sube arriba sin que nadie configure nada. */}
          {recientes.length > 1 && !estrecha && (
            <div className="recientes-nav">
              <div className="nav-titulo" style={{ cursor: 'default' }}>Lo último</div>
              {recientes.filter((r) => r !== loc.pathname).slice(0, 3).map((r) => (
                <NavLink key={r} to={r} className="reciente">{TITLES[r]}</NavLink>
              ))}
            </div>
          )}
          {secciones
            .filter((s) => s.items.length > 0)
            .map((s, i) => {
              // La sección sin título (bandeja, tablero, mi tren) NO se pliega:
              // es lo que se mira todos los días y esconderlo no ayuda a nadie.
              const plegable = !!s.titulo;
              const plegada = plegable && plegadas.includes(s.titulo);
              // Si la pantalla actual está DENTRO de esta sección, se abre
              // aunque estuviera plegada: si no, el usuario no vería dónde está.
              const contieneActual = s.rutas?.some((r) => loc.pathname.startsWith(r));
              const oculta = plegada && !contieneActual;
              return (
                <div key={i} className={'nav-group' + (oculta ? ' plegada' : '')}>
                  {plegable && (
                    <button
                      className="nav-group-title"
                      onClick={() => alternar(s.titulo)}
                      aria-expanded={!oculta}
                    >
                      <span>{s.titulo}</span>
                      <span className="chevron" aria-hidden>{oculta ? '▸' : '▾'}</span>
                    </button>
                  )}
                  {!oculta && s.items}
                </div>
              );
            })}
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
        {/* 12.6 — sólo aparece si hay borradores esperando señal. */}
        <AvisoPendientes />
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
