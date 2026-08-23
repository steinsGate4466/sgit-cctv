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
 * TODO LO DE UN TREN, POR ZONA — bloque 49.
 *
 * =============================================================================
 *  LA PANTALLA QUE PIDIÓ LA PLANTA, TAL CUAL LA PIDIÓ
 * =============================================================================
 *  «Elijo Tren 1 y me suelta todo lo del Tren 1, por zona. Y así Tren 2.»
 *
 *  Hasta ahora, para saber cómo estaba un tren había que abrir cuatro
 *  pantallas y sumarlas de cabeza. Cada una contestaba bien su parte y
 *  ninguna contestaba «¿cómo está mi tren?».
 *
 * =============================================================================
 *  EL SELECTOR RECUERDA
 * =============================================================================
 *  Quien es jefe del Tren 2 entra al Tren 2 cien veces y a los demás nunca.
 *  Obligarle a elegir cada vez es cobrarle un clic diario por nada. Se guarda
 *  en el navegador, no en el servidor: es una preferencia de esta pantalla en
 *  este equipo, no un dato de planta.
 *
 *  Y si el rol está sectorizado, el endpoint sólo devuelve su tren: no se
 *  enseñan pastillas que van a dar «no existe».
 *
 * =============================================================================
 *  TRES ESTADOS POR ZONA, NUNCA DOS
 * =============================================================================
 *  Bien, mal, y SIN MEDIR. El tercero es el que importa: una zona sin cámaras
 *  cargadas no está bien, está sin medir. Pintarla verde es la mentira que
 *  hace que nadie vuelva a creerse la pantalla.
 */
export default function PorTren() {
  const [trenes, setTrenes] = useState<any[]>([]);
  const [sigla, setSigla] = useState<string>(() => {
    try { return localStorage.getItem('sgit:tren-elegido') || ''; } catch { return ''; }
  });
  const [d, setD] = useState<any>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [cargadoEn, setCargadoEn] = useState<number | null>(null);
  const edad = useEdadDelDato(cargadoEn);

  // 1) Qué trenes puede ver esta persona. El ámbito ya lo recorta el servidor.
  useEffect(() => {
    api.get('/dashboard/infra/trenes')
      .then((r) => {
        const lista: any[] = r.data?.trenes || [];
        setTrenes(lista);
        setSigla((actual) => {
          const sigueValido = lista.some((t) => (t.sigla || t.code) === actual);
          return sigueValido ? actual : (lista[0]?.sigla || lista[0]?.code || '');
        });
      })
      .catch(() => setError('No se pudo cargar la lista de sectores.'))
      .finally(() => setCargando(false));
  }, []);

  // 2) El detalle del tren elegido.
  const cargar = useCallback(async () => {
    if (!sigla) return;
    try {
      const r = await api.get(`/dashboard/infra/tren/${encodeURIComponent(sigla)}/zonas`);
      setD(r.data);
      setError('');
    } catch (e: any) {
      setError(e?.response?.status === 404
        ? 'Ese sector no existe o no está en tu ámbito.'
        : 'No se pudo consultar. Vuelve a intentarlo.');
      setD(null);
    } finally { setCargadoEn(Date.now()); }
  }, [sigla]);

  useEffect(() => { cargar(); }, [cargar]);
  useVolverALaPantalla(cargar);
  useRefrescoDePulpito(cargar);

  const elegir = (s: string) => {
    setSigla(s);
    try { localStorage.setItem('sgit:tren-elegido', s); } catch { /* sin persistencia, funciona igual */ }
  };

  if (cargando) return <div className="page"><EsqueletoTablero kpis={4} paneles={2} /></div>;

  if (!trenes.length) {
    return (
      <div className="page">
        <h1 className="page-title">Por tren</h1>
        <div className="card vacio">
          <h3>Todavía no hay sectores en el árbol de planta</h3>
          <p>Se crean en Ubicaciones, o los siembra el arranque inicial.</p>
          <Link className="btn" to="/locations">Ir a Ubicaciones</Link>
        </div>
      </div>
    );
  }

  const t = d?.totales;
  const caidas = t ? t.camaras - t.camarasViendo : 0;
  const tono: Tono = !t ? 'sindatos'
    : caidas > 0 ? 'grave'
      : t.zonasSinMedir > 0 ? 'atender' : 'bien';

  return (
    <div className="page">
      <h1 className="page-title">Por tren</h1>

      {/* El selector. Pastillas grandes, no un desplegable: en un púlpito se
          pulsa con guante y un <select> nativo abre una lista minúscula. */}
      <div className="selector-tren" role="group" aria-label="Elegir sector">
        {trenes.map((x) => {
          const s = x.sigla || x.code;
          return (
            <button
              key={s}
              type="button"
              className={`pastilla-tren ${s === sigla ? 'activa' : ''}`}
              aria-pressed={s === sigla}
              onClick={() => elegir(s)}
            >
              {x.nombre || s}
            </button>
          );
        })}
      </div>

      {error && <div role="alert" className="aviso-error">{error}</div>}

      {d && (
        <>
          {edad !== null && edad >= 2 && (
            <p className="edad-dato">Datos de hace {plural(edad, 'minuto')}.</p>
          )}

          <Titular tono={tono} texto={d.titular} />

          <Cifras
            datos={[
              { n: t.camaras ? t.camarasViendo : null, de: t.camaras || undefined, et: 'cámaras viendo' },
              { n: t.activos, et: t.activos === 1 ? 'activo' : 'activos' },
              { n: t.exigenElevador, et: 'exigen manlift' },
              { n: t.conIncidencia, et: 'con incidencia' },
            ]}
          />

          <div className="sector-enlaces">
            <Link className="btn-mini" to="/mis-camaras">
              <Icono n="alerta" size={13} /> Qué está fallando
            </Link>
            <Link className="btn-mini" to="/dependencias">
              <Icono n="mapeo" size={13} /> De qué depende
            </Link>
            <Link className="btn-mini" to="/mis-activos">
              <Icono n="acceso" size={13} /> Cómo se llega
            </Link>
          </div>

          <h2 className="sub-titulo">Por zona</h2>
          {d.zonas.map((z: any) => <Zona key={z.code || 'sin-zona'} z={z} />)}
        </>
      )}

      <ComoSeCalcula>
        <p>
          Eliges el sector arriba y todo lo de abajo cambia. Las zonas se
          ordenan solas: primero las que tienen cámaras sin imagen, y esas
          vienen abiertas. Con el mismo problema, las <b>zonas vitales</b> van
          delante — esa etiqueta la declara Producción, no Mantenimiento.
        </p>
        <p>
          Una zona <b>sin cámaras cargadas</b> no sale verde: sale en gris como
          «sin medir». No es lo mismo que todo esté bien que no estar mirando.
        </p>
        <p>
          «Exigen manlift» cuenta <b>subidas</b>, nunca importes. Y sólo cuenta
          lo declarado: un activo sin declarar cómo se llega no se supone que
          sea a pie.
        </p>
      </ComoSeCalcula>
    </div>
  );
}

const ICONO_TIPO: Record<string, string> = {
  CAMERA: 'camara', SWITCH: 'puertos', NVR: 'grabador', WIRELESS: 'mapeo',
  PSU: 'electricidad', SERVER: 'pc', PC: 'pc', PANTALLA: 'pc', UPS: 'electricidad',
};

const NOMBRE_TIPO: Record<string, [string, string]> = {
  CAMERA: ['cámara', 'cámaras'], SWITCH: ['switch', 'switches'],
  NVR: ['grabador', 'grabadores'], WIRELESS: ['antena', 'antenas'],
  PSU: ['fuente', 'fuentes'], SERVER: ['servidor', 'servidores'],
  PC: ['PC', 'PC'], PANTALLA: ['pantalla', 'pantallas'], UPS: ['UPS', 'UPS'],
};

function Zona({ z }: { z: any }) {
  const mal = z.salud === 'MAL';
  const sinMedir = z.salud === 'SIN_MEDIR';

  const titulo = (
    <>
      <Icono n="ubicacion" size={15} /> {z.nombre}
      <span className="grupo-marcas">
        {z.vital && <span className="badge crit">vital</span>}
        {mal && (
          <span className="badge crit">
            {plural(z.camaras - z.camarasViendo, 'sin imagen', 'sin imagen')}
          </span>
        )}
        {!mal && !sinMedir && <span className="badge OPERATIVO">vista completa</span>}
        {sinMedir && <span className="badge sindatos">sin medir</span>}
        <span className="zona-total">{plural(z.activos, 'activo')}</span>
      </span>
    </>
  );

  return (
    <Detalle titulo={titulo} abiertoAlEntrar={mal}>
      <p className={`zona-frase ${mal ? 'mal' : sinMedir ? 'gris' : ''}`}>{z.queDice}</p>

      <div className="zona-tipos">
        {z.porTipo.map((p: any) => {
          const par = NOMBRE_TIPO[p.tipo];
          const nombre = par ? (p.n === 1 ? par[0] : par[1]) : (p.n === 1 ? 'equipo' : 'equipos');
          return (
            <span key={p.tipo} className="zona-chip">
              <Icono n={(ICONO_TIPO[p.tipo] || 'activos') as any} size={13} /> {p.n} {nombre}
            </span>
          );
        })}
        {z.exigenElevador > 0 && (
          <span className="zona-chip aviso">
            <Icono n="acceso" size={13} /> {plural(z.exigenElevador, 'exige manlift', 'exigen manlift')}
          </span>
        )}
        {/* El bloqueo eléctrico se avisa en la zona, no dentro de cada equipo:
            la decisión de subir se toma leyendo la lista, no abriendo fichas. */}
        {z.enTablero > 0 && (
          <span className="zona-chip peligro">
            <Icono n="electricidad" size={13} /> {plural(z.enTablero, 'en tablero', 'en tablero')} · exige bloqueo
          </span>
        )}
      </div>
    </Detalle>
  );
}
