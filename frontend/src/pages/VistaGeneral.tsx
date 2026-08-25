import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import Icono from '../components/Iconos';
import { EsqueletoTablero } from '../components/Esqueleto';
import { Cifras, ComoSeCalcula, Detalle, Titular, Tono } from '../components/Patron';
import {
  useVolverALaPantalla, useRefrescoDePulpito, useEdadDelDato,
} from '../useVolverALaPantalla';
import { plural } from '../formato';

/**
 * VISTA GENERAL — bloque 46.
 *
 * =============================================================================
 *  LA PANTALLA QUE PIDIÓ LA PLANTA, TAL CUAL LA PIDIÓ
 * =============================================================================
 *  «Una ventana desplegable por tren: Tren 1, Tren 2, Tren 3, Oficinas y
 *  Grúas.» Un sector, un desplegable, y dentro lo esencial de ese sector.
 *
 *  OFICINAS Y GRÚAS NO SON TRENES DE LAMINACIÓN, y aun así salen aquí sin una
 *  línea de código especial. En este sistema «tren» significa LA UNIDAD DE
 *  SECTORIZACIÓN — lo que un rol puede tener como ámbito, lo que agrupa el
 *  tablero— y la semilla los da de alta como sectores del árbol. Todo lo que
 *  ya funcionaba por tren (ámbito, Mis cámaras, Mis activos) los cubre solo.
 *
 * =============================================================================
 *  QUÉ VA DENTRO DE CADA DESPLEGABLE, Y QUÉ NO
 * =============================================================================
 *  Tres cifras y dos enlaces. Esta pantalla es un ÍNDICE, no otro tablero: el
 *  detalle ya existe en Mis cámaras y Mis activos, y repetirlo aquí sería
 *  mantener dos versiones de lo mismo que acabarían contradiciéndose.
 *
 *  Los sectores con cámaras caídas vienen ABIERTOS y primero; el resto,
 *  cerrados. Quien abre esta pantalla no viene a leerla entera: viene a ver
 *  dónde está el problema.
 *
 * =============================================================================
 *  EL ÁMBITO SE RESPETA SOLO
 * =============================================================================
 *  El endpoint ya recorta por usuario: un Jefe de Tren sectorizado ve aquí
 *  únicamente su sector. Esta pantalla no filtra nada — un filtro de pantalla
 *  nunca es un permiso.
 */
export default function VistaGeneral() {
  const [d, setD] = useState<any>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [cargadoEn, setCargadoEn] = useState<number | null>(null);
  const edad = useEdadDelDato(cargadoEn);

  const cargar = useCallback(async () => {
    try {
      const r = await api.get('/dashboard/infra/trenes');
      setD(r.data);
      setCargadoEn(Date.now());
      setError('');
    } catch (e: any) {
      setError(e?.response?.status === 403
        ? 'Tu usuario no tiene permiso para ver esta pantalla.'
        : 'No se pudo consultar. Vuelve a intentarlo.');
    } finally { setCargando(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);
  useVolverALaPantalla(cargar);
  // La vista pensada para dejar abierta en el púlpito: se refresca sola en
  // pantalla ancha. En el móvil del técnico no, que los datos los paga él.
  useRefrescoDePulpito(cargar);

  if (cargando) return <div className="page"><EsqueletoTablero /></div>;

  if (error) {
    return (
      <div className="page">
        <h1 className="page-title">Vista general</h1>
        <div className="card peligro">{error}</div>
      </div>
    );
  }

  const sectores: any[] = d?.trenes || [];
  if (!sectores.length) {
    return (
      <div className="page">
        <h1 className="page-title">Vista general</h1>
        <div className="card vacio">
          <h3>Todavía no hay sectores en el árbol de planta</h3>
          <p>{d?.motivoAmbito || 'Ejecuta la semilla o crea los trenes en Ubicaciones.'}</p>
        </div>
      </div>
    );
  }

  /* Un sector está «con problemas» si tiene cámaras sin imagen. Es el mismo
     criterio de Mis cámaras: FUERA_SERVICIO + CON_INCIDENCIA + MANTENIMIENTO
     cuentan como no viendo, ya resuelto por el backend en `camarasCaidas`. */
  const caidasDe = (s: any) => s?.activos?.camarasCaidas ?? 0;
  const conProblemas = sectores.filter((s) => caidasDe(s) > 0);
  const totalCaidas = conProblemas.reduce((n, s) => n + caidasDe(s), 0);

  // Los que duelen primero, abiertos. El resto en el orden del árbol.
  const ordenados = [...sectores].sort((a, b) => caidasDe(b) - caidasDe(a));

  const tono: Tono = totalCaidas > 0 ? 'grave' : 'bien';
  const texto = totalCaidas > 0
    ? `${plural(totalCaidas, 'cámara sin imagen', 'cámaras sin imagen')} en ${
      conProblemas.map((s) => s.nombre || s.code).join(', ')}`
    : `Los ${sectores.length} sectores con vista completa`;

  return (
    <div className="page">
      <h1 className="page-title">Vista general</h1>
      {edad !== null && edad >= 2 && (
        <p className="edad-dato">Datos de hace {plural(edad, 'minuto')}.</p>
      )}

      <Titular tono={tono} texto={texto} />

      {ordenados.map((s) => <Sector key={s.code || s.id} s={s} />)}

      <ComoSeCalcula>
        <p>
          Un desplegable por sector: los tres trenes de Laminación, Oficinas y
          Grúas. Los que tienen cámaras sin imagen salen primero y abiertos.
        </p>
        <p>
          Esta pantalla es un <b>índice</b>: el detalle vive en «Mis cámaras» y
          «Mis activos» son los enlaces de cada sector. Con rol sectorizado, sólo el tuyo.
        </p>
      </ComoSeCalcula>
    </div>
  );
}

/** Un sector desplegable: tres cifras y dos enlaces. Nada más a propósito. */
function Sector({ s }: { s: any }) {
  const a = s.activos || {};
  const camaras = a.camaras ?? 0;
  const caidas = a.camarasCaidas ?? 0;
  const viendo = Math.max(camaras - caidas, 0);
  const total = a.total ?? 0;

  const titulo = (
    <>
      <Icono n="tren" size={15} /> {s.nombre || s.code}
      <span className="grupo-marcas">
        {caidas > 0
          ? <span className="badge crit">{plural(caidas, 'cámara caída', 'cámaras caídas')}</span>
          : camaras > 0
            ? <span className="badge OPERATIVO">con vista completa</span>
            /* Sin cámaras no es «bien»: es sin medir. El gris no tranquiliza,
               que es justo lo que se busca. */
            : <span className="badge sindatos">sin cámaras cargadas</span>}
      </span>
    </>
  );

  return (
    <Detalle titulo={titulo} abiertoAlEntrar={caidas > 0}>
      <Cifras
        datos={[
          { n: camaras > 0 ? viendo : null, de: camaras > 0 ? camaras : undefined, et: 'cámaras viendo' },
          { n: total, et: total === 1 ? 'activo' : 'activos' },
          { n: a.conIncidencia ?? 0, et: 'con incidencia' },
        ]}
      />
      <div className="sector-enlaces">
        {/* Enlaces de verdad, no botones: funcionan el clic central y el
            «abrir en pestaña nueva», que en un púlpito con dos monitores es
            exactamente lo que se hace. */}
        <Link className="btn-mini" to="/mis-camaras">
          <Icono n="alerta" size={13} /> Qué está fallando
        </Link>
        <Link className="btn-mini" to="/mis-activos">
          <Icono n="acceso" size={13} /> Qué hay y cómo se llega
        </Link>
      </div>
    </Detalle>
  );
}
