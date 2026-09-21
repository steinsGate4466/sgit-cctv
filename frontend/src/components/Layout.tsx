import { ReactNode, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import MiPin from './MiPin';
import Icono from './Iconos';
import BuscadorRapido from './BuscadorRapido';
import RestaurarScroll from './RestaurarScroll';
import AvisoRed from './AvisoRed';
import FechaDelDato from './FechaDelDato';
import Pestanas from './Pestanas';
import { padreDe } from '../pestanas';
import AvisoPendientes from './AvisoPendientes';
import ErrorBoundary from './ErrorBoundary';

/**
 * EL MENÚ SE APAGABA AL ABRIR UNA PESTAÑA — bloque 129.
 *
 * Lo vio el usuario: estando en «Indicadores» —que es una PESTAÑA de Dashboard—
 * el menú lateral no marcaba «Dashboard». Sólo se encendía al volver a
 * «Análisis». Lo mismo con Preventivo, Correctivo y Mejora respecto de
 * «Órdenes (OM)».
 *
 * El motivo es que `NavLink` compara rutas, y `/indicadores` no empieza por
 * `/dashboard`: para React Router son dos pantallas sin relación. La relación
 * existe sólo en `pestanas.ts` (bloque 118), y el menú no la estaba leyendo.
 *
 * No es cosmético. El menú es el mapa: si se apaga, el usuario deja de saber
 * dónde está, y en una pantalla de pestañas eso pasa cada vez que cambia de
 * pestaña. Aquí se enciende también cuando la pantalla actual es HIJA de este
 * enlace, usando la MISMA tabla que dibuja las pestañas — una sola verdad, no
 * dos listas que mantener a la par.
 */
function EnlaceDeMenu({ to, children }: { to: string; children: ReactNode }) {
  const { pathname } = useLocation();
  const porPestana = padreDe(pathname) === to;
  return (
    <NavLink
      to={to}
      className={({ isActive }) => (isActive || porPestana ? 'active' : undefined)}
    >
      {children}
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
 * Menú agrupado por secciones. Con 14 opciones, una lista plana marea;
 * agrupadas por dominio el usuario encuentra las cosas donde las espera.
 */
export default function Layout() {
  const { user, logout, can } = useAuth();
  const [verPin, setVerPin] = useState(false);
  const loc = useLocation();
  const nav = useNavigate();

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
  /* ===========================================================================
     EL MENÚ VA POR OFICIO, NO POR MÓDULO — bloque 69
     ---------------------------------------------------------------------------
     LO QUE ESTABA MAL, dicho por el usuario: «los módulos están hechos
     mierda». Y tenía razón. El menú se había ido agrupando por el módulo del
     que salía cada pantalla, que es una división que sólo tiene sentido para
     quien escribió el código:

       · «Infraestructura» había crecido hasta VEINTE entradas. Ahí dentro
         convivían el direccionamiento IP —que mira un técnico de red una vez
         al mes— con las Instalaciones, que se rellenan en planta con guantes.
       · «Operación» tenía tres, y «Almacén» una sola. Una sección de un
         elemento no es una sección: es una línea con un título encima.
       · El Dashboard y los Indicadores estaban sueltos arriba, mezclados con
         «Mi bandeja», que es trabajo pendiente y no un número.

     EL CRITERIO NUEVO, y es uno solo: **¿QUIÉN ABRE ESTO Y EN QUÉ MOMENTO?**

       LO MÍO           lo primero al llegar, sea cual sea tu puesto
       PRODUCCIÓN       mirar la línea: qué se ve y qué no
       GESTIÓN          el trabajo: qué hay que hacer, con qué y cuándo
       TRABAJO EN CAMPO lo que se rellena delante del equipo
       QUÉ HAY          el inventario: dónde está cada cosa
       RED Y ENERGÍA    cómo está unido y de qué se alimenta
       INDICADORES      si vamos mejorando o empeorando
       SISTEMA          quién entra y qué hizo

     DOS COSAS QUE NO SE TOCAN, porque ya funcionaban:

     1. Una sección SIN ELEMENTOS VISIBLES no se pinta (`filter` de abajo).
        Cada persona ve dos o tres secciones, no ocho: los permisos hacen el
        recorte solos. Por eso ocho grupos no marean, y siete de dos elementos
        sí lo hacían.

     2. `rutas` abre la sección donde estás aunque la tuvieras plegada. Hay
        que mantenerla al día: si una pantalla no está en su lista, al entrar
        en ella el menú no se abre y parece que la entrada no existe.
     =========================================================================== */
  /* ===========================================================================
     EL MENÚ EN TRES PUERTAS, UNA POR OFICIO — bloque 75
     ---------------------------------------------------------------------------
     Palabras del usuario: «sectorizamos tres ramas principales: GESTIÓN para
     los ingenieros de mantenimiento, PRODUCCIÓN para los de púlpito, jefes de
     línea y de tren, y la parte TÉCNICA que son los obreros que están en campo
     y llenan los datos».

     Es un criterio mejor que el anterior —que ya iba por oficio pero en ocho
     grupos— porque **coincide con cómo está organizada la planta**. Un jefe de
     tren no tiene que entender qué es «Red y energía»: abre PRODUCCIÓN y ahí
     está todo lo suyo.

     ---------------------------------------------------------------------------
     LAS TRES PUERTAS, Y QUÉ CONTESTA CADA UNA

       GESTIÓN     ¿qué hay que hacer, con qué y cuándo?   → el ingeniero
       PRODUCCIÓN  ¿qué se ve y qué no?                    → púlpito y jefes
       CAMPO       ¿qué hay ahí y cómo está conectado?     → los técnicos

     SISTEMA queda aparte porque no es un oficio: es administración, y sólo la
     abre quien administra.

     ---------------------------------------------------------------------------
     DOS COSAS QUE NO SE TOCAN, PORQUE YA FUNCIONABAN

     1. Una sección SIN ELEMENTOS VISIBLES no se pinta. Los permisos hacen el
        recorte solos: un operario de púlpito ve DOS entradas, no cincuenta.
        Por eso cuatro grupos no marean.

     2. `rutas` abre la sección donde estás aunque la tuvieras plegada. Hay que
        mantenerla al día: si una pantalla no está en su lista, al entrar el
        menú no se abre y parece que la entrada no existe. Lo vigila
        `verificar:menu`.
     =========================================================================== */
  const secciones: { titulo: string; items: ReactNode[]; rutas?: string[] }[] = [
    /* ---------------------------------------------------------------- LO MÍO
       Sin título y sin plegar: es lo primero que se mira al llegar, sea cual
       sea tu puesto. La bandeja va PRIMERA porque es lo que hay que vaciar;
       los números se miran después. */
    {
      titulo: '',
      items: [
        can('dashboard.read') && <EnlaceDeMenu key="bd" to="/bandeja"><Icono n="bandeja" /> Mi bandeja</EnlaceDeMenu>,
        /* «Mi tren» sólo si el usuario TIENE ámbito. A quien lo ve todo no le
           aporta nada: ya tiene Estado por Tren con los tres. */
        (user?.ambitoTrenes?.length ?? 0) > 0 && can('dashboard.read') &&
          <EnlaceDeMenu key="mt" to="/mi-tren"><Icono n="mitren" /> Mi tren</EnlaceDeMenu>,
        can('om.mirar') && <EnlaceDeMenu key="mcam" to="/mis-camaras"><Icono n="alerta" /> Mis cámaras</EnlaceDeMenu>,
        can('activos.mirar') && <EnlaceDeMenu key="apt" to="/mis-activos"><Icono n="acceso" /> Mis activos</EnlaceDeMenu>,
        can('cobertura.mirar') && <EnlaceDeMenu key="cob" to="/cobertura"><Icono n="zonaVital" /> Zonas críticas</EnlaceDeMenu>,
      ].filter(Boolean) as ReactNode[],
    },

    /* ============================================================ PRODUCCIÓN
       El púlpito, el jefe de línea y el jefe de tren. MIRAN Y AVISAN: aquí no
       hay ni una acción de mantenimiento. Reportar se hace desde el QR o desde
       «Mis cámaras», con el equipo delante, que es donde se sabe qué pasa.

       «Zonas vitales» vive aquí y no en Gestión porque es Producción quien
       declara qué no puede quedarse a ciegas — de eso sale la prioridad de
       todo lo demás. */
    {
      titulo: 'Producción',
      rutas: ['/por-tren', '/tablero-om', '/vista-general', '/dependencias', '/zonas'],
      /* «Estado por Tren» YA NO tiene entrada propia (bloque 130): sus cifras
         estaban repetidas en «Resumen de planta» y en «Por tren». Palabras del
         usuario: «¿cuál es el objetivo de Estado por Tren? Ni siquiera yo sé
         cómo sustentarlo». La ruta sigue viva —los enlaces que llevan a ella
         no se rompen— pero deja de ocupar un sitio en el mapa. */
      items: [
        can('om.mirar') && <EnlaceDeMenu key="pt" to="/por-tren"><Icono n="tren" /> Por tren</EnlaceDeMenu>,
        /* BLOQUE 113. Va justo después de «Por tren» porque es la misma
           pregunta con un día de diferencia: «qué tengo» y «cómo va lo que
           pedí». Con `om.mirar`, que es la llave de lectura de Producción. */
        can('om.mirar') && <EnlaceDeMenu key="tom" to="/tablero-om"><Icono n="parada" /> Avance de órdenes</EnlaceDeMenu>,
        can('om.mirar') && <EnlaceDeMenu key="vg" to="/vista-general"><Icono n="tablero" /> Resumen de planta</EnlaceDeMenu>,
        can('om.mirar') && <EnlaceDeMenu key="dep" to="/dependencias"><Icono n="mapeo" /> Impacto de una caída</EnlaceDeMenu>,
        /* DECLARAR es una acción, y las acciones viven en su módulo (§58).
           «Zonas críticas», en los cuatro menús de arriba, sólo RESUME. */
        can('location.read') && <EnlaceDeMenu key="zn" to="/zonas"><Icono n="zonaVital" /> Declarar zonas vitales</EnlaceDeMenu>,
      ].filter(Boolean) as ReactNode[],
    },

    /* =============================================== GESTIÓN DEL MANTENIMIENTO
       El ingeniero. Decide y mide.

       ÓRDENES E INVENTARIO VAN JUNTOS, y no es una concesión: una orden sin
       repuesto no se cierra, y un repuesto sin orden no se retira. Tenerlos en
       dos sitios obligaba a saltar de uno a otro para responder una pregunta.

       Y los INDICADORES también viven aquí: son la herramienta con la que el
       ingeniero justifica el presupuesto, no una sección de adorno. */
    {
      titulo: 'Gestión del mantenimiento',
      rutas: ['/incidents', '/maintenance', '/criticidad', '/hojas-de-ruta',
        '/preventive', '/corrective', '/improvements', '/gruas', '/catalogos',
        '/mejoras-procedimiento', '/inventory', '/dashboard', '/indicadores',
        '/salud-de-datos'],
      items: [
        can('incident.read') && <EnlaceDeMenu key="i" to="/incidents"><Icono n="incidencia" /> Incidencias</EnlaceDeMenu>,
        /* ÓRDENES Y PARADAS, TAMBIÉN PARA PRODUCCIÓN (bloque 83).
           Palabras del usuario: «ellos SÍ deben ver cierta parte de gestión
           para poder enviar las OM o incidencias».

           El bloque 80 cerró la gestión entera con `wo.read` para sacarles de
           los indicadores del ingeniero, y de paso se llevó estas dos. El Jefe
           de Tren podía ABRIR una orden y no podía ver NINGUNA: pedir un
           trabajo y no poder comprobar nunca si alguien lo cogió es cómo se
           vuelve a la radio.

           `om.mirar` = «supervisa el mantenimiento de su tren» (bloque 68).
           Es LECTURA: los botones de escribir siguen mirando `wo.update` y
           `wo.approve`, y ninguno de los dos se ha movido. */
        (can('wo.read') || can('om.mirar'))
          && <EnlaceDeMenu key="m" to="/maintenance"><Icono n="orden" /> Órdenes (OM)</EnlaceDeMenu>,
        /* VENTANAS DE PARADA sale del menú (bloque 130). Razonamiento del
           usuario, que es de planta y no de software: «las paradas siempre
           varían de acuerdo a Producción. ¿Quién le avisa al técnico que hay
           ventana? Su mismo planner». Un módulo que hay que mantener a mano
           con un dato que caduca en horas es un módulo desperdiciado — y peor:
           invita a confiar en una hora que ya cambió.

           Lo que sí quiere conservar es el dato de parada DENTRO de la orden
           —«empezó parada, estamos empezando a tal hora»—, donde nace del
           trabajo real. Eso es el bloque 138 y toca modelo, así que no es de
           esta noche. La ruta sigue viva mientras tanto. */
        /* CRITICIDAD A/B/C (bloque 76). Va ANTES de las hojas de ruta y del
           preventivo porque es lo primero de la cadena: la letra decide CADA
           CUÁNTO se toca el equipo, la hoja de ruta dice QUÉ hacer y el
           preventivo lo programa. Puesta al final parecería un informe; puesta
           aquí se lee como el primer paso que es.

           Con `activos.mirar` además de `asset.read`, por la lección del
           bloque 68: cerrarlo sólo con el permiso fuerte dejaría al Jefe de
           Tren sin poder ver cada cuánto se revisa su propio equipo. */
        (can('asset.read') || can('activos.mirar'))
          && <EnlaceDeMenu key="crit" to="/criticidad"><Icono n="alerta" /> Criticidad de activos</EnlaceDeMenu>,
        /* HOJAS DE RUTA (bloque 75). Va justo antes del preventivo porque es
           lo que le da contenido: el preventivo dice CUÁNDO tocar el equipo y
           la hoja de ruta dice QUÉ hacer. */
        can('wo.read') && <EnlaceDeMenu key="hr" to="/hojas-de-ruta"><Icono n="nota" /> Hojas de ruta</EnlaceDeMenu>,
        /* PREDICTIVO FUERA DEL MENÚ (bloque 80).
           Decisión del usuario, y con razón de planta: ¿qué se va a predecir
           en una cámara o en un switch? El predictivo tiene sentido donde hay
           desgaste medible —vibración de un rodamiento, análisis de aceite—.
           Una cámara da imagen o no la da.

           Lo que aquí parecía predictivo era DETECCIÓN TEMPRANA, y eso ya lo
           hace el módulo de monitoreo. La pantalla NO se borra: hay órdenes
           viejas cargadas así y su ruta sigue funcionando para consultarlas
           (está en EXENTAS del verificador del menú, con este motivo). */
        // Las grúas fallan distinto: cable fatigado, antena desalineada, y no
        // se llega sin manlift. Por eso tienen su propio mantenimiento.
        can('wo.read') && <EnlaceDeMenu key="gr2" to="/gruas"><Icono n="grua" /> Cámaras de grúa</EnlaceDeMenu>,
        (can('procedimiento.manage') || can('wo.update'))
          && <EnlaceDeMenu key="mej" to="/mejoras-procedimiento"><Icono n="nota" />
            {can('procedimiento.manage') ? ' Mejoras propuestas' : ' Mis propuestas'}
          </EnlaceDeMenu>,
        /* ALMACÉN: el usuario lo pidió expresamente para Producción —«verificar
           almacén»—. Va con `inventory.read` O con `om.mirar`: quien supervisa
           las órdenes de su tren necesita saber si hay repuesto antes de pedir
           el trabajo. Es LECTURA; retirar material sigue pidiendo su permiso. */
        (can('inventory.read') || can('om.mirar'))
          && <EnlaceDeMenu key="inv" to="/inventory"><Icono n="inventario" /> Repuestos</EnlaceDeMenu>,
        /* CATÁLOGO DE FALLAS (bloque 130). Estaba escondido como pestaña de
           «Ubicaciones» y el usuario no entendía qué hacía ahí: «corto, falla
           eléctrica, conector… ¿por qué eso va en Ubicaciones?». Es el
           vocabulario del CIERRE de una orden, así que vive con las órdenes. */
        can('location.manage') && <EnlaceDeMenu key="cat" to="/catalogos"><Icono n="nota" /> Catálogo de fallas</EnlaceDeMenu>,
        /* CALIDAD DE DATOS baja desde Gestión técnica (bloque 130). El usuario:
           «eso debería estar en gestión del mantenimiento». Y es coherente con
           §56.3 —un informe va donde está quien decide con él—: la propia
           pantalla reparte cada hueco entre «Técnico de campo», «Mantenimiento»
           y «Técnico de red», y quien organiza ese trabajo está aquí. */
        can('asset.update') && <EnlaceDeMenu key="sdd" to="/salud-de-datos"><Icono n="ok" /> Calidad de datos</EnlaceDeMenu>,
        can('dashboard.read') && <EnlaceDeMenu key="d" to="/dashboard"><Icono n="tablero" /> Dashboard</EnlaceDeMenu>,
      ].filter(Boolean) as ReactNode[],
    },

    /* ======================================================== GESTIÓN TÉCNICA
       Los técnicos que levantan y mantienen los datos. Palabras del usuario:
       «los obreros que están en campo y llenan los datos».

       SE LLAMABA «Trabajo en campo» y lo cambió él (bloque 83). El nombre
       viejo describía DÓNDE se está; el nuevo describe QUÉ se hace. Y aquí no
       sólo se rellena con guantes: también se consulta la red, la energía y la
       calidad de las fichas, que es trabajo de mesa. «Campo» dejaba fuera la
       mitad de lo que hay dentro.

       TODO el inventario técnico está aquí, y eso es deliberado: son ellos
       quienes lo levantan. El ingeniero lo consulta, pero no lo llena.

       Se abre con lo que se rellena con el equipo delante, y sigue con la red
       y la energía, que es lo que se consulta en el gabinete. */
    {
      titulo: 'Gestión técnica',
      rutas: ['/assets', '/retirados', '/locations', '/cabinets', '/instalaciones',
        '/mapeo', '/access', '/riesgo', '/documentos'],
      items: [
        /* «Estructura de activos» se llamaba casi igual que «Criticidad de
           activos» y el usuario se perdía entre las dos: «¿por qué hay siempre
           repetición de títulos? Es confuso». Esta pantalla es el inventario
           de lo que hay montado en planta, así que se llama por eso. */
        can('asset.read') && <EnlaceDeMenu key="a" to="/assets"><Icono n="activos" /> Activos de planta</EnlaceDeMenu>,
        /* BLOQUE 107. Justo debajo de la estructura de activos: es la misma
           lista un paso después. Con `activos.mirar` además de `asset.read`,
           porque el técnico y el jefe de tren también preguntan qué se cambió
           — y la respuesta no lleva ni una credencial. */
        (can('asset.read') || can('activos.mirar'))
          && <EnlaceDeMenu key="ret" to="/retirados"><Icono n="activos" /> Equipos retirados</EnlaceDeMenu>,
        can('asset.read') && <EnlaceDeMenu key="u" to="/locations"><Icono n="ubicacion" /> Ubicaciones</EnlaceDeMenu>,
        can('asset.read') && <EnlaceDeMenu key="g" to="/cabinets"><Icono n="gabinete" /> Gabinetes</EnlaceDeMenu>,
        // Una instalación terminada CREA el activo: es la puerta de entrada.
        can('asset.read') && <EnlaceDeMenu key="ins" to="/instalaciones"><Icono n="instalar" /> Instalaciones</EnlaceDeMenu>,
        /* CAMPAÑAS DE MAPEO sale del menú (bloque 130). Palabras del usuario:
           «¿cuál es la necesidad de hacer una campaña de mapeo? El mapeo debe
           ser sólo una OM». Es un segundo sistema de reparto de trabajo en
           paralelo al de las órdenes, y con dos sistemas nadie sabe cuál manda.
           La ruta queda viva; la entrada, no. */
        can('asset.read') && <EnlaceDeMenu key="mp" to="/mapeo"><Icono n="mapeo" /> Estado de la información</EnlaceDeMenu>,
        can('access.read') && <EnlaceDeMenu key="ac" to="/access"><Icono n="acceso" /> Accesibilidad y altura</EnlaceDeMenu>,
        /* EQUIPOS CONOCIDOS — el menú decía `asset.read` y el endpoint exige
           `user.manage`. DIEZ roles veían la entrada y la pantalla salía
           vacía: es el mismo fallo de los bloques 68, 77 y 83, encontrado
           esta vez cruzando cada entrada del menú contra el permiso real de
           los endpoints que carga.

           SE CIERRA EL MENÚ, no se abre el endpoint. Cerrar no le quita nada
           a nadie —la pantalla ya salía vacía para esos diez—; abrirlo sería
           una decisión sobre datos de auditoría (desde qué PC entra cada
           persona), y ésa es del usuario, no mía.

           PENDIENTE DE DECISIÓN: el Supervisor TI / Redes tiene `asset.read`
           y `red.read` pero NO `user.manage`, así que hoy no puede gestionar
           el registro de equipos conocidos — que es justo lo suyo. */
        // Fichas incompletas: sin IP, sin ubicación, sin foto. Cierra la
        // sección porque habla de la CALIDAD de todo lo de arriba.
        /* RIESGO DE ACTIVOS — obsolescencia y repuestos críticos. Estaba bajo
           Gestión del mantenimiento y no es trabajo: es el estado del PARQUE.
           ISO 55000 lo trata como gestión de activos, y es la entrada natural
           al informe de reemplazo del bloque 108. */
        /* Se llamaba «Riesgo de activos» y el usuario no sabía qué contenía:
           «esto sí no entiendo para nada, para qué está». No mide el riesgo de
           un activo: dice dónde NO habrá con qué arreglar —repuesto agotado u
           modelo descatalogado—. El nombre ahora lo dice. */
        can('infra.read') && <EnlaceDeMenu key="rg" to="/riesgo"><Icono n="alerta" /> Repuestos y obsolescencia</EnlaceDeMenu>,
        can('document.read') && <EnlaceDeMenu key="dc" to="/documentos"><Icono n="etiqueta" /> Manuales y planos</EnlaceDeMenu>,
      ].filter(Boolean) as ReactNode[],
    },

    /* ========================================================== DEPENDENCIAS
       Petición del usuario: «quiero una rama que diga dependencias, dentro de
       esto que haya antenas, cámaras, ya sabes, estructura de red o
       infraestructura de cómo está».

       -----------------------------------------------------------------------
       NO SE CONSTRUYE NADA NUEVO: las siete pantallas ya existían, repartidas
       dentro de una «Gestión técnica» que tenía DIECISÉIS entradas. Ahí dentro,
       el direccionamiento IP —que se mira una vez al mes— convivía con las
       Instalaciones, que se rellenan en planta con guantes. Es el mismo
       problema que el bloque 69 arregló con «Infraestructura», reaparecido.

       EL CRITERIO QUE LAS UNE es uno y se puede decir en una frase:
       **qué cuelga de qué, y qué se cae si esto se cae.**

           220 V (tablero + circuito)  →  SWITCH PoE  →  cámaras · antenas · NVR

       Cableado y Electricidad entran porque la corriente ES una dependencia —y
       la primera, según `arranque-de-diagnostico.ts`: si se va una cámara, lo
       primero que se comprueba es la corriente—. Separar «la red» de «la
       energía» obligaría a saltar entre dos secciones para seguir UNA cadena.

       -----------------------------------------------------------------------
       «DE QUÉ DEPENDE» NO SE MUEVE AQUÍ, Y ES DELIBERADO.

       Se queda en Producción porque la pregunta que contesta —«¿qué dejo de
       ver si se cae esto?»— es de Producción, y quien la hace es el Jefe de
       Tren, que tiene `om.mirar` y NO tiene `red.read`. Traerla aquí le
       dejaría una sección de un solo elemento, que es exactamente lo que el
       bloque 69 quitó: una sección de una entrada no es una sección, es una
       línea con un título encima. */
    {
      titulo: 'Dependencias',
      rutas: ['/capacidad', '/conexiones', '/cableado', '/rotulado', '/electricidad', '/grabadores',
        '/mapa-de-red', '/ipam', '/topologia', '/monitoreo'],
      items: [
        /* CONEXIONES ABRE LA SECCIÓN. Aquí es donde vive el CABLE, y es lo que
           declara qué está unido con qué: sin esto, todo lo demás sale como
           cajas sueltas y parece roto (bloque 12.1). */
        /* BLOQUE 122 · CAPACIDAD DE RED. Abre la sección porque es la
           pregunta que se hace ANTES de instalar nada: ¿hay puertos, hay PoE,
           o hay que comprar un switch? Con `asset.read` además de las llaves
           de red, porque quien decide con este informe es Mantenimiento. */
        (can('red.read') || can('infra.read') || can('asset.read'))
          && <EnlaceDeMenu key="cap" to="/capacidad"><Icono n="ok" /> Capacidad de red</EnlaceDeMenu>,
        can('red.read') && <EnlaceDeMenu key="cx" to="/conexiones"><Icono n="puertos" /> Conexiones</EnlaceDeMenu>,
        can('red.read') && <EnlaceDeMenu key="mred" to="/mapa-de-red"><Icono n="gabinete" /> Mapa de red</EnlaceDeMenu>,
        can('red.read') && <EnlaceDeMenu key="tp" to="/topologia"><Icono n="critico" /> Puntos críticos</EnlaceDeMenu>,
        can('red.read') && <EnlaceDeMenu key="gr" to="/grabadores"><Icono n="grabador" /> Grabadores</EnlaceDeMenu>,
        can('red.read') && <EnlaceDeMenu key="ip" to="/ipam"><Icono n="ipam" /> Direccionamiento IP</EnlaceDeMenu>,
        /* ROTULADO — la norma de colores del cableado. Vive junto al cable que
           rige, no en la ficha del activo: es una norma, no un equipo. */
        can('infra.read') && <EnlaceDeMenu key="rt" to="/rotulado"><Icono n="etiqueta" /> Rotulado</EnlaceDeMenu>,
        can('infra.read') && <EnlaceDeMenu key="cb" to="/cableado"><Icono n="cableado" /> Cableado</EnlaceDeMenu>,
        can('infra.read') && <EnlaceDeMenu key="el" to="/electricidad"><Icono n="electricidad" /> Electricidad</EnlaceDeMenu>,
        // Cierra la sección: es lo que dice si la cadena de arriba está viva.
        can('monitor.read') && <EnlaceDeMenu key="mo" to="/monitoreo"><Icono n="reloj" /> Monitoreo</EnlaceDeMenu>,
      ].filter(Boolean) as ReactNode[],
    },

    /* ================================================================ SISTEMA
       Quién entra, qué puede y qué hizo. Última a propósito: no es un oficio,
       y no se entra aquí por costumbre. */
    {
      titulo: 'Sistema',
      rutas: ['/users', '/sesiones', '/roles', '/audit', '/equipos', '/exportar',
        '/avisos', '/limpieza', '/mi-cuenta'],
      items: [
        can('user.manage') && <EnlaceDeMenu key="us" to="/users"><Icono n="usuarios" /> Usuarios</EnlaceDeMenu>,
        /* QUIÉN ESTÁ DENTRO (bloque 82). Va JUSTO detrás de Usuarios: la
           pregunta «¿quién está trabajando ahora?» se hace mirando la lista de
           gente, y desde aquí se le corta el acceso a alguien en dos pulsaciones.

           `user.manage` y no `user.read`: la lista dice desde qué IP y qué
           aparato entra cada persona. Eso es seguridad, no directorio. */
        can('user.manage') && <EnlaceDeMenu key="se" to="/sesiones"><Icono n="candado" /> Sesiones activas</EnlaceDeMenu>,
        can('role.manage') && <EnlaceDeMenu key="ro" to="/roles"><Icono n="candado" /> Roles y permisos</EnlaceDeMenu>,
        /* EQUIPOS CONOCIDOS — desde qué PC entra cada persona. Estaba en
           Gestión técnica, pero no es un activo de planta: es control de
           acceso, y pide `user.manage`. ISO 27001, no ISO 14224. */
        can('user.manage') && <EnlaceDeMenu key="eq" to="/equipos"><Icono n="pc" /> Equipos conocidos</EnlaceDeMenu>,
        /* EXPORTAR — saca activos, ubicaciones, órdenes, red y almacén. No es
           de un área: es transversal, y cada tema pide el permiso de SU
           pantalla. Estaba bajo Gestión del mantenimiento, que es sólo uno de
           los cinco temas que exporta. */
        can('dashboard.read') && <EnlaceDeMenu key="xl" to="/exportar"><Icono n="exportar" /> Exportar</EnlaceDeMenu>,
        can('audit.read') && <EnlaceDeMenu key="au" to="/audit"><Icono n="auditoria" /> Auditoría</EnlaceDeMenu>,
        // Avisos lo ve CUALQUIERA: todo el mundo puede vincular su Telegram.
        <EnlaceDeMenu key="av" to="/avisos"><Icono n="alerta" /> Avisos</EnlaceDeMenu>,
        // Mi cuenta lo ve CUALQUIERA: son sus propias sesiones. Ahí está el
        // botón de «me robaron el teléfono», que revoca de verdad.
        <EnlaceDeMenu key="mc" to="/mi-cuenta"><Icono n="usuarios" /> Mi cuenta</EnlaceDeMenu>,
        // Borrado definitivo. Último de todo.
        can('asset.delete') && <EnlaceDeMenu key="li" to="/limpieza"><Icono n="escoba" /> Limpieza de datos</EnlaceDeMenu>,
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
