import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import MiPin from './MiPin';
import BotonTema from './BotonTema';
import Icono from './Iconos';
import BuscadorRapido from './BuscadorRapido';
import RestaurarScroll from './RestaurarScroll';
import AvisoRed from './AvisoRed';
import FechaDelDato from './FechaDelDato';
import Pestanas from './Pestanas';
import { MODULOS, Modulo, moduloDe, pantallasVisibles } from '../modulos';
import AvisoPendientes from './AvisoPendientes';
import ErrorBoundary from './ErrorBoundary';

/**
 * LA ENTRADA DE UN MÓDULO — bloque 147.
 *
 * Se enciende en CUALQUIER pantalla del módulo, incluidas las pestañas de una
 * pantalla (Preventivo dentro de Órdenes). Es la lección del bloque 129: el
 * menú es el mapa, y si se apaga el usuario deja de saber dónde está. La
 * pertenencia sale de `modulos.ts`, la misma tabla que dibuja las pestañas.
 */
function EnlaceDeModulo({ m, to }: { m: Modulo; to: string }) {
  const { pathname } = useLocation();
  const activo = moduloDe(pathname) === m;
  return (
    <NavLink to={to} className={() => (activo ? 'active' : '')}>
      <Icono n={m.icono} /> {m.titulo}
    </NavLink>
  );
}
import { MarcaSGIT } from './Ilustraciones';

const TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard Ejecutivo',
  '/trains': 'Estado por Tren',
  '/assets': 'Activos de planta',
  '/cabinets': 'Gabinetes',
  '/locations': 'Ubicaciones',
  '/access': 'Accesibilidad y Trabajo en Altura',
  '/incidents': 'Incidencias',
  '/maintenance': 'Órdenes de Mantenimiento',
  '/preventive': 'Mantenimiento Preventivo',
  '/corrective': 'Mantenimiento Correctivo',
  '/predictive': 'Mantenimiento Predictivo',
  '/improvements': 'Mantenimiento de Mejora',
  '/inventory': 'Repuestos',
  '/audit': 'Auditoría',
  '/users': 'Usuarios',
  '/sesiones': 'Sesiones activas',
  '/roles': 'Roles y permisos',
  '/mi-tren': 'Mi tren',
  '/topologia': 'Puntos críticos de la red',
  '/riesgo': 'Repuestos y obsolescencia',
  '/mis-camaras': 'Mis cámaras',
  '/vista-general': 'Resumen de planta',
  '/dependencias': 'Impacto de una caída',
  '/mapa-de-red': 'Mapa de red por gabinete y tablero',
  '/por-tren': 'Por tren',
  '/salud-de-datos': 'Calidad de datos',
  '/mis-activos': 'Mis activos',
  '/rotulado': 'Estándar de rotulado',
  '/monitoreo': 'Monitoreo de red',
  '/grabadores': 'Grabadores y canales',
  '/capacidad': 'Capacidad de red',
  '/conexiones': 'Conexiones de red',
  '/gruas': 'Cámaras de grúa',
  '/documentos': 'Manuales y planos',
  '/mejoras-procedimiento': 'Mejoras a los procedimientos',
  '/limpieza': 'Limpieza de datos',
  '/equipos': 'Equipos conocidos',
  '/paradas': 'Ventanas de parada',
  '/instalaciones': 'Instalaciones',
  '/pedir-instalacion': 'Pedir instalación',
  '/mapa': 'Mapa',
  '/planos': 'Planos',
  '/campanas': 'Campañas de mapeo',
  '/electricidad': 'Electricidad',
  '/ipam': 'Direccionamiento IP',
  '/zonas': 'Declarar zonas vitales',
  '/cobertura': 'Zonas críticas',
  '/mi-cuenta': 'Mi cuenta',
  '/indicadores': 'Indicadores de gestión',
  '/exportar': 'Exportar a Excel',
  '/avisos': 'Avisos',
  // Faltaban tres. Sin entrada aquí la cabecera decía «SGIT-CCTV» y la
  // pantalla tenía que repetir su propio título para que se supiera dónde
  // estabas. Con esto el título vive en UN solo sitio.
  '/bandeja': 'Mi bandeja',
  '/mapeo': 'Estado de la información',
  '/cableado': 'Cableado',
  /* Bloque 130: los catálogos de falla salen de «Ubicaciones». Una ubicación
     es un sitio; esto es el vocabulario con el que se cierra una orden. */
  '/catalogos': 'Catálogo de fallas',
};

/**
 * Menú: una entrada por módulo (bloque 147). Con 48 entradas, una lista marea;
 * agrupadas por dominio el usuario encuentra las cosas donde las espera.
 */
export default function Layout() {
  const { user, logout, can } = useAuth();
  const [verPin, setVerPin] = useState(false);
  const loc = useLocation();
  const nav = useNavigate();

  /* El plegado por secciones (bloque 12.8) desaparece con el bloque 147:
     con una entrada por módulo no queda nada que plegar. */
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

  /* ¿ESTAMOS EN UN CELULAR?
     -------------------------------------------------------------------
     En el celular la barra lateral no es una barra: es una TIRA horizontal
     de pastillas arriba de la pantalla. Dos cosas que funcionan bien en el
     escritorio se comportan mal ahí y hay que apagarlas, y para eso hace
     falta saberlo en el código, no sólo en el CSS. */
  const [esMovil, setEsMovil] = useState<boolean>(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 780px)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 780px)');
    const alCambiar = (e: MediaQueryListEvent) => setEsMovil(e.matches);
    mq.addEventListener('change', alCambiar);
    return () => mq.removeEventListener('change', alCambiar);
  }, []);

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

  /* ===========================================================================
     UNA ENTRADA POR MÓDULO — bloque 147
     ---------------------------------------------------------------------------
     Tras la presentación, Producción, Mantenimiento y Técnica dijeron lo mismo:
     «demasiados módulos, marean». Eran 48 entradas en cinco secciones.

     Ahora el menú tiene una entrada por módulo (`src/modulos.ts`) y las
     pantallas del módulo salen como pestañas arriba del contenido. NINGUNA
     pantalla se borra y NINGUNA ruta cambia: sólo cómo se llega.

     La historia de por qué cada pantalla está donde está (bloques 69, 75, 83,
     118, 130) sigue valiendo y vive en git; el criterio de ahora es uno:
     **¿de qué trata?** — estado, trabajo, equipos, red y energía,
     ubicaciones, repuestos, documentos, indicadores, ajustes.

     Un módulo sin ninguna pantalla visible no se pinta: los permisos hacen el
     recorte solos, igual que antes.
     =========================================================================== */
  const modulos = MODULOS
    .map((m) => ({ m, visibles: pantallasVisibles(m, can, user) }))
    .filter((x) => x.visibles.length > 0);

  return (
    /* La clase de «barra estrecha» va AQUÍ, en el contenedor, no sólo en el
       <aside>. La rejilla que reparte la pantalla vive en `.app`: si sólo se
       entera el aside, éste encoge a 60 px pero la columna se queda en 236 y
       el contenido no se mueve. Era el «estrecho el menú y no se reajusta». */
    <div className={'app' + (estrecha ? ' app-estrecha' : '')}>
      {/* Ctrl+K para saltar a cualquier pantalla. Con 34 entradas en el
          menú, escribir «parada» es más rápido que recordar en qué sección
          vive. */}
      <BuscadorRapido />
      {/* Al entrar a un módulo, arriba. Con ATRÁS, donde estabas. */}
      <RestaurarScroll />
      <aside className={'sidebar' + (estrecha ? ' estrecha' : '')}>
        {/* Estrechar / ensanchar. Va arriba y pequeño: se usa una vez y se
            olvida, no tiene que competir con el menú por la atención. */}
        <button className="sidebar-ancho" onClick={alternarAncho}
          title={estrecha ? 'Ensanchar el menú' : 'Estrechar el menú y ganar sitio para las tablas'}
          aria-label={estrecha ? 'Ensanchar el menú' : 'Estrechar el menú'}>
          {estrecha ? '»' : '«'}
        </button>
        {/* EL LOGO LLEVA A INICIO — bloque 67.
            Es la convención de cualquier aplicación web: se pulsa el logo
            para volver al principio. Aquí eran dos `<div>` muertos. */}
        <button type="button" className="brand" onClick={() => nav('/')}
          title="Ir al inicio">
          <MarcaSGIT size={30} />
          <span>
            <span className="logo">SGIT<span>-CCTV</span></span>
            <span className="sub">Aceros Arequipa · Pisco</span>
          </span>
        </button>
        <nav className="nav">
          {/* LO ÚLTIMO QUE USASTE. De 38 pantallas cada persona usa cinco:
              esto las sube arriba sin que nadie configure nada. */}
          {/* «Lo último» NO se pinta en el celular. Es un bloque de cuatro
              líneas apiladas, y ahí dentro la barra es una FILA horizontal:
              al meterlo, la tira pasaba de 40 px de alto a 120 de golpe en
              cuanto habías visitado dos pantallas. Ese era el «crece de
              forma abrupta». En la tira no hace falta: todo está a un dedo
              de distancia deslizando. */}
          {recientes.length > 1 && !estrecha && !esMovil && (
            <div className="recientes-nav">
              <div className="nav-titulo" style={{ cursor: 'default' }}>Lo último</div>
              {/* `TITLES[r]` no es sólo para pintar el nombre: es la LISTA
                  BLANCA. «Lo último» sale de localStorage, y localStorage lo
                  puede editar cualquiera con la consola abierta o un
                  complemento del navegador. Sin este filtro, un valor metido a
                  mano se convertiría en el destino de un <NavLink>. Al exigir
                  que la ruta exista en TITLES, sólo pueden salir pantallas
                  reales de la aplicación. */}
              {recientes.filter((r) => r !== loc.pathname && TITLES[r]).slice(0, 3).map((r) => (
                <NavLink key={r} to={r} className="reciente">{TITLES[r]}</NavLink>
              ))}
            </div>
          )}
          {modulos.map(({ m, visibles }) => (
            <EnlaceDeModulo key={m.titulo} m={m} to={visibles[0].ruta} />
          ))}
        </nav>
        <div className="foot">v0.6 · Infraestructura y CCTV</div>
      </aside>

      <div>
        <header className="topbar">
          {/* Es el <h1> de la pantalla. Antes era un <div> y cada página
              repetía su propio título debajo: el mismo texto dos veces,
              ochenta píxeles de alto tirados. */}
          <h1 className="title">{title}</h1>
          {/* BLOQUE 112 · cuándo se trajo lo que hay en pantalla. Va pegado al
              título porque es parte de lo que la pantalla AFIRMA, no un
              adorno del pie que nadie baja a leer. */}
          <FechaDelDato />
          {/* EL NOMBRE Y EL AVATAR LLEVAN A «MI CUENTA» — bloque 67.
              -----------------------------------------------------------------
              Lo detectó una prueba de uso: la gente pulsa su propio nombre
              esperando llegar a su cuenta. Es lo que hacen todas las
              aplicaciones que usa a diario, así que aquí también.

              Antes eran dos `<div>` muertos: se pulsaba y no pasaba nada, que
              es peor que no poder pulsar — parece que la aplicación se colgó.

              Va como `<button>` y no como `<div onClick>` para que también
              funcione con el teclado y lo anuncien los lectores de pantalla. */}
          <div className="user">
            <button
              type="button"
              className="user-boton"
              onClick={() => nav('/mi-cuenta')}
              title="Ir a Mi cuenta"
            >
              <span style={{ textAlign: 'right' }}>
                <span className="user-nombre">{user?.fullName}</span>
                <span className="user-rol">{user?.role}</span>
              </span>
              <span className="avatar">{initials}</span>
            </button>
            <BotonTema />
            <button className="logout" onClick={() => setVerPin(true)}
              title="PIN para reanudar órdenes en campo"><Icono n="pin" size={15} /> Mi PIN</button>
            <button className="logout" onClick={() => logout()}><Icono n="salir" size={15} /> Salir</button>
          </div>
        </header>
        {/* Va aquí, entre la cabecera y el contenido: empuja, no tapa. */}
        <AvisoRed />
        {/* 12.6 — sólo aparece si hay borradores esperando señal. */}
        <AvisoPendientes />
        {/* BLOQUE 118 · las pestañas del grupo, si esta pantalla pertenece a
            uno. Va fuera del ErrorBoundary a propósito: si la pantalla
            revienta, la barra sigue ahí y se puede salir a la de al lado. */}
        <Pestanas />
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
