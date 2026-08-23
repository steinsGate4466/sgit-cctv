import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

/**
 * BUSCADOR RÁPIDO — Ctrl+K
 *
 * EL PROBLEMA QUE RESUELVE
 * El menú tiene 34 entradas. Están bien agrupadas y se pliegan, pero para
 * llegar a «Ventanas de parada» hay que saber que vive en Operación, abrir
 * esa sección y leer tres opciones. Quien usa el sistema ocho horas al día
 * se lo aprende; quien entra dos veces por semana, no.
 *
 * Con Ctrl+K se escribe «parada» y se entra. Dos teclas y una palabra.
 *
 * POR QUÉ BUSCA TAMBIÉN POR PALABRAS QUE NO ESTÁN EN EL NOMBRE
 * Porque la gente busca por lo que quiere hacer, no por cómo se llama la
 * pantalla. Quien busca «breaker» quiere Electricidad, y quien busca «foto»
 * quiere Activos. Cada entrada lleva sus sinónimos de planta.
 *
 * SÓLO SALE LO QUE PUEDES ABRIR. Se filtra por permiso: enseñar una pantalla
 * que va a dar «sin acceso» es peor que no enseñarla.
 */

interface Destino {
  ruta: string;
  nombre: string;
  seccion: string;
  /** Cómo lo llama la gente en planta, aunque no sea el nombre de la pantalla. */
  alias: string;
  permiso?: string;
}

const DESTINOS: Destino[] = [
  { ruta: '/dashboard', nombre: 'Dashboard', seccion: 'General', alias: 'tablero indicadores kpi resumen inicio', permiso: 'dashboard.read' },
  { ruta: '/indicadores', nombre: 'Indicadores de gestión', seccion: 'General', alias: 'mttr mtbf disponibilidad kpi backlog cumplimiento comite gerencia', permiso: 'dashboard.read' },
  { ruta: '/bandeja', nombre: 'Mi bandeja', seccion: 'General', alias: 'pendientes hoy tareas que hago primero', permiso: 'dashboard.read' },
  { ruta: '/mi-tren', nombre: 'Mi tren', seccion: 'General', alias: 'mi linea mi zona' },
  { ruta: '/trains', nombre: 'Estado por Tren', seccion: 'General', alias: 't1 t2 t3 linea laminacion', permiso: 'dashboard.read' },
  { ruta: '/exportar', nombre: 'Exportar a Excel', seccion: 'General', alias: 'excel descargar respaldo informe xlsx', permiso: 'dashboard.read' },

  { ruta: '/assets', nombre: 'Activos', seccion: 'Infraestructura', alias: 'camaras equipos inventario nvr switch serie foto qr', permiso: 'asset.read' },
  { ruta: '/instalaciones', nombre: 'Instalaciones', seccion: 'Infraestructura', alias: 'nueva camara pedir instalar montar pulpito grua', permiso: 'asset.read' },
  { ruta: '/cabinets', nombre: 'Gabinetes', seccion: 'Infraestructura', alias: 'rack armario tablero de comunicaciones', permiso: 'asset.read' },
  { ruta: '/locations', nombre: 'Ubicaciones', seccion: 'Infraestructura', alias: 'arbol zonas etapas donde planta', permiso: 'asset.read' },
  { ruta: '/cableado', nombre: 'Cableado', seccion: 'Infraestructura', alias: 'utp fibra metros tramo 90 metros categoria', permiso: 'asset.read' },
  { ruta: '/electricidad', nombre: 'Electricidad', seccion: 'Infraestructura', alias: 'tablero breaker termico llave circuito mcc corriente termografia', permiso: 'asset.read' },
  { ruta: '/mapeo', nombre: 'Avance del mapeo', seccion: 'Infraestructura', alias: 'levantamiento cuantas faltan progreso', permiso: 'asset.read' },
  { ruta: '/campanas', nombre: 'Campañas de mapeo', seccion: 'Infraestructura', alias: 'revisar zona calidad aprobar levantamiento reparto', permiso: 'asset.read' },
  { ruta: '/grabadores', nombre: 'Grabadores', seccion: 'Infraestructura', alias: 'nvr dvr canales grabacion disco', permiso: 'asset.read' },
  { ruta: '/conexiones', nombre: 'Conexiones de red', seccion: 'Infraestructura', alias: 'puerto switch enlace fibra anillo poe vlan', permiso: 'asset.read' },
  { ruta: '/ipam', nombre: 'Direccionamiento IP', seccion: 'Infraestructura', alias: 'ip subred vlan dhcp gateway que ip le pongo duplicada cidr', permiso: 'asset.read' },
  { ruta: '/mapa-de-red', nombre: 'Mapa de red', seccion: 'Infraestructura', alias: 'gabinete tablero switch hikvision tplink fortinet segmento red camaras 192.168 10.1 cctv poe puertos que hay dentro del tablero', permiso: 'asset.read' },
  { ruta: '/salud-de-datos', nombre: 'Salud de los datos', seccion: 'Infraestructura', alias: 'calidad datos completitud que falta cargar huecos ip duplicada sin ubicacion inventario incompleto', permiso: 'asset.update' },
  { ruta: '/topologia', nombre: 'Puntos críticos', seccion: 'Infraestructura', alias: 'impacto que se cae si falla mapa red', permiso: 'asset.read' },
  { ruta: '/por-tren', nombre: 'Por tren', seccion: 'General', alias: 'selector tren 1 2 3 elegir sector por zona todo del tren como esta mi tren zonas vitales manlift', permiso: 'om.mirar' },
  { ruta: '/vista-general', nombre: 'Vista general', seccion: 'General', alias: 'sectores por tren oficinas gruas desplegable resumen indice todo', permiso: 'om.mirar' },
  { ruta: '/dependencias', nombre: 'De qué depende cada cámara', seccion: 'General', alias: 'dependencia antena camaras colgadas de la antena que cuelga de que depende porque me quede sin ver switch grabador cadena diagrama arbol', permiso: 'om.mirar' },
  { ruta: '/mis-camaras', nombre: 'Mis cámaras', seccion: 'General', alias: 'camara caida falla que pasa con esa camara avance om jefe de tren produccion', permiso: 'om.mirar' },
  { ruta: '/mis-activos', nombre: 'Mis activos', seccion: 'General', alias: 'manlift altura gabinete tablero campo inventario por tren que hay en mi tren subida elevador andamio escalera acceso costo produccion activos por tren', permiso: 'activos.mirar' },
  { ruta: '/riesgo', nombre: 'Riesgo', seccion: 'Infraestructura', alias: 'obsolescencia repuesto sin recambio fin de soporte viejo no se arregla stock critico', permiso: 'asset.read' },
  { ruta: '/rotulado', nombre: 'Estándar de rotulado', seccion: 'Infraestructura', alias: 'etiqueta codigo color cable tia 606 nomenclatura como se llama', permiso: 'asset.read' },
  { ruta: '/monitoreo', nombre: 'Monitoreo', seccion: 'Infraestructura', alias: 'ping en linea caida disponible', permiso: 'monitor.read' },
  { ruta: '/documentos', nombre: 'Manuales y planos', seccion: 'Infraestructura', alias: 'pdf ficha manual plano documento', permiso: 'document.read' },
  { ruta: '/access', nombre: 'Accesibilidad', seccion: 'Infraestructura', alias: 'manlift altura permiso ssoma andamio', permiso: 'access.read' },

  { ruta: '/incidents', nombre: 'Incidencias', seccion: 'Operación', alias: 'falla reporte no se ve averia', permiso: 'incident.read' },
  { ruta: '/maintenance', nombre: 'Órdenes (OM)', seccion: 'Operación', alias: 'ot orden trabajo sap cerrar firmar', permiso: 'wo.read' },
  { ruta: '/paradas', nombre: 'Ventanas de parada', seccion: 'Operación', alias: 'parada tren produccion cuando se para hora', permiso: 'wo.read' },

  { ruta: '/preventive', nombre: 'Preventivo', seccion: 'Mantenimiento', alias: 'rutina limpieza programado plan', permiso: 'wo.read' },
  { ruta: '/corrective', nombre: 'Correctivo', seccion: 'Mantenimiento', alias: 'reparacion arreglo falla recurrente', permiso: 'wo.read' },
  { ruta: '/predictive', nombre: 'Predictivo', seccion: 'Mantenimiento', alias: 'tendencia anticipar degradacion', permiso: 'wo.read' },
  { ruta: '/improvements', nombre: 'Mejora', seccion: 'Mantenimiento', alias: 'proyecto mejora upgrade', permiso: 'wo.read' },
  { ruta: '/gruas', nombre: 'Cámaras de grúa', seccion: 'Mantenimiento', alias: 'puente antena cadena portacables manlift inspeccion', permiso: 'wo.read' },

  { ruta: '/inventory', nombre: 'Inventario', seccion: 'Almacén', alias: 'repuesto stock almacen sap retiro herramienta', permiso: 'inventory.read' },

  { ruta: '/mi-cuenta', nombre: 'Mi cuenta', seccion: 'Sistema', alias: 'mis sesiones cerrar sesion me robaron el celular contrasena' },
  { ruta: '/audit', nombre: 'Auditoría', seccion: 'Sistema', alias: 'quien hizo que historial registro trazabilidad', permiso: 'audit.read' },
  { ruta: '/avisos', nombre: 'Avisos', seccion: 'Sistema', alias: 'telegram notificacion alerta mensaje' },
  { ruta: '/users', nombre: 'Usuarios', seccion: 'Sistema', alias: 'personas cuentas alta baja contrasena', permiso: 'user.manage' },
  { ruta: '/roles', nombre: 'Roles y permisos', seccion: 'Sistema', alias: 'permiso perfil acceso ambito tren', permiso: 'role.manage' },
  { ruta: '/equipos', nombre: 'Equipos conocidos', seccion: 'Sistema', alias: 'pc ip mac desde que computadora dispositivo quien entra', permiso: 'asset.read' },
  { ruta: '/cobertura', nombre: 'Mi cobertura', seccion: 'General', alias: 'produccion camaras viendo ciegas cobertura que cubro jefe de tren', permiso: 'cobertura.mirar' },
  { ruta: '/zonas', nombre: 'Zonas vitales', seccion: 'Infraestructura', alias: 'produccion critica importante prioridad vital zona', permiso: 'location.read' },
  { ruta: '/limpieza', nombre: 'Limpieza de datos', seccion: 'Sistema', alias: 'borrar purgar eliminar basura prueba', permiso: 'asset.delete' },
];

/** Quita tildes: en planta se escribe «grua», no «grúa». */
const normalizar = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export default function BuscadorRapido() {
  const { can } = useAuth();
  const navegar = useNavigate();
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [elegido, setElegido] = useState(0);
  const entrada = useRef<HTMLInputElement>(null);

  // Ctrl+K abre, Escape cierra. La combinación es la que ya conoce
  // cualquiera que use un editor o Slack: no hay que enseñarla.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setAbierto((v) => !v);
        setTexto(''); setElegido(0);
      }
      if (e.key === 'Escape') setAbierto(false);
    };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
    // Sin dependencias: se monta una vez. Ver el comentario del foco en Modal.
     
  }, []);

  useEffect(() => {
    /* foco-intencional
       Aquí SÍ hay que mover el foco al cambiar la dependencia: `abierto` sólo
       cambia al abrir o cerrar el buscador, NUNCA al escribir. Un buscador
       que se abre y no deja escribir sin tocar la pantalla no sirve de nada.
       El verificador avisa por defecto porque el caso normal es el
       contrario, y hace bien: la marca va dentro del efecto, a la vista de
       quien lo lea. */
    if (abierto) entrada.current?.focus();
  }, [abierto]);

  const permitidos = useMemo(
    () => DESTINOS.filter((d) => !d.permiso || can(d.permiso)),
    // `can` viene del contexto y no cambia entre renders del mismo usuario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const resultados = useMemo(() => {
    const q = normalizar(texto.trim());
    if (!q) return permitidos.slice(0, 8);
    return permitidos
      .map((d) => {
        const nombre = normalizar(d.nombre);
        const alias = normalizar(d.alias);
        // El nombre pesa más que el alias: quien escribe «activos» quiere
        // Activos, no las cuatro pantallas que mencionan activos.
        let punto = 0;
        if (nombre.startsWith(q)) punto = 100;
        else if (nombre.includes(q)) punto = 60;
        else if (alias.includes(q)) punto = 30;
        return { d, punto };
      })
      .filter((x) => x.punto > 0)
      .sort((a, b) => b.punto - a.punto)
      .slice(0, 10)
      .map((x) => x.d);
  }, [texto, permitidos]);

  if (!abierto) return null;

  function ir(d: Destino) {
    setAbierto(false);
    navegar(d.ruta);
  }

  return (
    <div className="buscador-fondo" onMouseDown={(e) => { if (e.target === e.currentTarget) setAbierto(false); }}>
      <div className="buscador" role="dialog" aria-label="Buscar pantalla">
        <input aria-label="Buscar una pantalla"
          ref={entrada}
          value={texto}
          placeholder="¿A dónde quieres ir? Escribe «parada», «breaker», «manlift»…"
          onChange={(e) => { setTexto(e.target.value); setElegido(0); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setElegido((i) => Math.min(i + 1, resultados.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setElegido((i) => Math.max(i - 1, 0)); }
            if (e.key === 'Enter' && resultados[elegido]) ir(resultados[elegido]);
          }}
        />
        {resultados.length === 0 ? (
          <div className="buscador-vacio">
            Nada con «{texto}». Prueba con otra palabra: se busca también por cómo
            se llama en planta, no sólo por el nombre de la pantalla.
          </div>
        ) : (
          <ul className="buscador-lista">
            {resultados.map((d, i) => (
              <li key={d.ruta} className={i === elegido ? 'sel' : ''}
                  onMouseEnter={() => setElegido(i)} onMouseDown={() => ir(d)}>
                <span>{d.nombre}</span>
                <small className="muted">{d.seccion}</small>
              </li>
            ))}
          </ul>
        )}
        <div className="buscador-pie">
          <span><b>↑↓</b> moverse</span>
          <span><b>Enter</b> abrir</span>
          <span><b>Esc</b> cerrar</span>
        </div>
      </div>
    </div>
  );
}
