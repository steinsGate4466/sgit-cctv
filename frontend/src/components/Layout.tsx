import { ReactNode, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import MiPin from './MiPin';
import Icono from './Iconos';
import BuscadorRapido from './BuscadorRapido';
import RestaurarScroll from './RestaurarScroll';
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
  '/riesgo': 'Dónde no vamos a poder arreglar',
  '/mis-camaras': 'Mis cámaras',
  '/vista-general': 'Vista general por sector',
  '/dependencias': 'De qué depende cada cámara',
  '/mapa-de-red': 'Mapa de red por gabinete y tablero',
  '/por-tren': 'Por tren',
  '/mis-activos': 'Mis activos y cómo se llega a ellos',
  '/rotulado': 'Estándar de rotulado',
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
  '/zonas': 'Zonas vitales para la producción',
  '/cobertura': 'Mi cobertura',
  '/mi-cuenta': 'Mi cuenta',
  '/indicadores': 'Indicadores de gestión',
  '/exportar': 'Exportar a Excel',
  '/avisos': 'Avisos',
  // Faltaban tres. Sin entrada aquí la cabecera decía «SGIT-CCTV» y la
  // pantalla tenía que repetir su propio título para que se supiera dónde
  // estabas. Con esto el título vive en UN solo sitio.
  '/bandeja': 'Mi bandeja',
  '/mapeo': 'Avance del mapeo',
  '/cableado': 'Cableado',
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
        /* «Mi cobertura» va de las primeras a propósito: es la pantalla de
           PRODUCCIÓN, y un jefe de línea que entre al sistema tiene que
           encontrarla sin recorrer un menú pensado para Mantenimiento. */
        /* Bloque 42: `cobertura.mirar`, no `dashboard.read`. Con el permiso
           del tablero, a un jefe de tren se le abrían además Dashboard,
           Indicadores y Mi bandeja — herramientas de decisión de Mantenimiento
           que él no usa y que le tapaban lo suyo. */
        can('cobertura.mirar') && <NavLink key="cob" to="/cobertura"><Icono n="camara" /> Mi cobertura</NavLink>,
        /* Bloque 39. La pantalla que pidió Producción: qué cámara falla, quién
           la ataca y qué falta. Va de las primeras porque es la que abre un
           jefe de tren cuando le avisan por radio. */
        /* Bloque 46. El indice por sector: Tren 1, 2, 3, Oficinas y Gruas.
           Va PRIMERO porque es donde se entra a mirar si algo esta mal. */
        /* Bloque 49. VA PRIMERA de todo el grupo de Producción: es la que
           contesta «cómo está mi tren», que es la pregunta con la que se entra
           al sistema. Vista general enseña los cinco sectores a la vez; ésta
           entra en uno y lo abre por zona. */
        can('om.mirar') && <NavLink key="pt" to="/por-tren"><Icono n="tren" /> Por tren</NavLink>,
        can('om.mirar') && <NavLink key="vg" to="/vista-general"><Icono n="tablero" /> Vista general</NavLink>,
        can('om.mirar') && <NavLink key="mcam" to="/mis-camaras"><Icono n="alerta" /> Mis cámaras</NavLink>,
        /* Bloque 41. Va justo detrás porque son las dos mitades de la misma
           pregunta: una dice qué falla AHORA, la otra qué hay en el tren y
           cuánto de eso exige manlift — que es lo que Producción costea.
           Bloque 42: se llamaba «Activos por tren» y pasa a «Mis activos». El
           prefijo *Mi/Mis* ya significa «lo mío, sectorizado» en toda la
           aplicación; «por tren» rompía el patrón e insinuaba que se puede
           elegir tren, que es justo lo que un jefe de tren NO hace. */
        can('activos.mirar') && <NavLink key="apt" to="/mis-activos"><Icono n="acceso" /> Mis activos</NavLink>,
        /* Bloque 47. Cierra el grupo de Producción: las tres anteriores dicen
           QUÉ pasa, y ésta dice POR QUÉ — de qué cuelga cada cámara. No va con
           «Puntos críticos», que es la misma información para el técnico de
           red y con diagrama; aquí no hay diagrama a propósito. */
        can('om.mirar') && <NavLink key="dep" to="/dependencias"><Icono n="mapeo" /> De qué depende</NavLink>,
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
      rutas: ['/assets', '/cabinets', '/locations', '/access', '/cableado', '/mapeo', '/grabadores', '/conexiones', '/topologia', '/monitoreo', '/documentos', '/instalaciones', '/campanas', '/electricidad', '/ipam', '/zonas', '/riesgo', '/rotulado'],
      items: [
        can('asset.read') && <NavLink key="a" to="/assets"><Icono n="activos" /> Activos</NavLink>,
        /* Va PRIMERA de la sección, antes que Activos en importancia aunque
           no en orden: es la pantalla donde Producción dice qué pesa, y de
           ella sale la prioridad de todo lo demás. */
        can('location.read') && <NavLink key="zn" to="/zonas"><Icono n="zonaVital" /> Zonas vitales</NavLink>,
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
        /* Bloque 48. Junto a Conexiones porque son las dos caras de lo mismo:
           allí se DECLARA qué está enchufado dónde, y aquí se LEE la foto ya
           agrupada por la caja física que el técnico abre. */
        can('asset.read') && <NavLink key="mred" to="/mapa-de-red"><Icono n="gabinete" /> Mapa de red</NavLink>,
        // Va con Conexiones: primero se declara la red física, después el
        // direccionamiento que corre por encima.
        can('asset.read') && <NavLink key="ip" to="/ipam"><Icono n="ipam" /> Direccionamiento IP</NavLink>,
        // 12.7 — cierra el permiso huerfano: `document.read` existia desde F0
        // y no habia pantalla que lo usara.
        can('document.read') && <NavLink key="dc" to="/documentos"><Icono n="etiqueta" /> Manuales y planos</NavLink>,
        can('asset.read') && <NavLink key="tp" to="/topologia"><Icono n="critico" /> Puntos críticos</NavLink>,
        /* Bloque 36: el backend de riesgo llevaba semanas calculando y no
           había forma de verlo. Un cálculo sin enlace, para la planta, no
           existe. */
        can('asset.read') && <NavLink key="rg" to="/riesgo"><Icono n="alerta" /> Riesgo</NavLink>,
        can('asset.read') && <NavLink key="rt" to="/rotulado"><Icono n="etiqueta" /> Rotulado</NavLink>,
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
              // En modo estrecho NO se pliega nada: sin rótulos de sección, un
              // grupo plegado se ve como un hueco sin explicación y el usuario
              // no tiene dónde pulsar para abrirlo.
              // En el celular TAMPOCO se pliega. El rótulo de la sección está
              // oculto en la tira, así que no hay dónde pulsar para abrirla:
              // una sección plegada dejaba sus pantallas inalcanzables, y al
              // entrar en una de ellas por el buscador aparecían de golpe.
              const oculta = plegada && !contieneActual && !estrecha && !esMovil;
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
          {/* Es el <h1> de la pantalla. Antes era un <div> y cada página
              repetía su propio título debajo: el mismo texto dos veces,
              ochenta píxeles de alto tirados. */}
          <h1 className="title">{title}</h1>
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
