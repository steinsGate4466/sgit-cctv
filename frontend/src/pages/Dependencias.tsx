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
 * DE QUÉ DEPENDE CADA CÁMARA — bloque 47.
 *
 * =============================================================================
 *  ESTA PANTALLA LA LEE UN INGENIERO DE PRODUCCIÓN
 * =============================================================================
 *  No es de sistemas, y no tiene por qué serlo. Sabe lo que cuesta un minuto
 *  de tren parado y no tiene ninguna obligación de saber qué es un uplink.
 *
 *  Así que aquí NO hay diagrama de red. Un diagrama con cajas y flechas es
 *  precioso para quien ya sabe leerlo e inútil para quien no — y quien no
 *  sabe leerlo es exactamente el público de esta pantalla. Lo que hay es una
 *  pestaña por equipo y, al abrirla, la lista de cámaras que se caen con él y
 *  una frase que dice qué se deja de ver.
 *
 *  El diagrama sigue existiendo en «Topología», que es donde lo busca el
 *  técnico de red. Dos públicos, dos pantallas; no una pantalla a medias para
 *  los dos.
 *
 * =============================================================================
 *  POR QUÉ PESTAÑAS Y NO UNA TABLA
 * =============================================================================
 *  Porque la pregunta real no es «dame todo»: es «¿qué cuelga de esta
 *  antena?». Una tabla obliga a leerla entera para contestar eso. Una pestaña
 *  que se abre contesta con un clic y deja el resto fuera de la vista.
 *
 *  Las que están fallando salen ARRIBA y ABIERTAS. Quien entra aquí no viene
 *  a leerlo todo: viene a ver qué está roto.
 *
 * =============================================================================
 *  EL NÚMERO QUE SE ENSEÑA ES EL TOTAL, NO EL RECORTADO
 * =============================================================================
 *  Un jefe de tren sólo ve las cámaras de su sector, pero el CONTADOR dice
 *  cuántas se lleva el equipo en total. Si un switch del core tumba 30 cámaras
 *  y él sólo puede ver 2 códigos, tiene que enterarse igual de que son 30: es
 *  la diferencia entre «se me cayó una cámara» y «esto es un problema de
 *  planta». Los códigos ajenos no se enseñan; el tamaño del problema, sí.
 */
export default function Dependencias() {
  const [d, setD] = useState<any>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [cargadoEn, setCargadoEn] = useState<number | null>(null);
  const edad = useEdadDelDato(cargadoEn);

  const cargar = useCallback(async () => {
    try {
      const r = await api.get('/network/dependencias');
      setD(r.data);
      setError('');
    } catch (e: any) {
      setError(e?.response?.status === 403
        ? 'Tu usuario no tiene permiso para ver esta pantalla.'
        : 'No se pudo consultar. Vuelve a intentarlo.');
    } finally {
      setCargando(false);
      setCargadoEn(Date.now());
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);
  useVolverALaPantalla(cargar);
  useRefrescoDePulpito(cargar);

  if (cargando) return <div className="page"><EsqueletoTablero kpis={0} paneles={3} /></div>;

  if (error) {
    return (
      <div className="page">
        <h1 className="page-title">De qué depende cada cámara</h1>
        <div className="card peligro">{error}</div>
      </div>
    );
  }

  const soportes: any[] = d?.soportes || [];

  if (!soportes.length) {
    return (
      <div className="page">
        <h1 className="page-title">De qué depende cada cámara</h1>
        <div className="card vacio">
          <h3>Todavía no se puede saber de qué depende cada cámara</h3>
          <p>
            {d?.motivoAmbito
              || 'Para dibujar esto hacen falta dos cosas: un grabador cargado en '
              + 'el sistema y las cámaras enlazadas a él. Se hace en la ficha de '
              + 'cada cámara, en «Grabador al que entra».'}
          </p>
          <Link className="btn" to="/conexiones">Ir a Conexiones</Link>
        </div>
      </div>
    );
  }

  const fallando = soportes.filter((s) => s.estado !== 'OPERATIVO' && s.camarasEnTotal > 0);
  const tono: Tono = fallando.length ? 'grave' : 'bien';

  return (
    <div className="page">
      <h1 className="page-title">De qué depende cada cámara</h1>
      {edad !== null && edad >= 2 && (
        <p className="edad-dato">Datos de hace {plural(edad, 'minuto')}.</p>
      )}

      <Titular tono={tono} texto={d.titular} />

      <p className="dep-intro">
        Cada pestaña es un equipo. Ábrela y verás qué cámaras se dejan de ver si
        ese equipo se cae.
      </p>

      {soportes.map((s) => <Soporte key={s.id} s={s} />)}

      <ComoSeCalcula>
        <p>
          Depende si, al caer ese equipo, la imagen deja de llegar al grabador.
        </p>
        <p>
          No se cuentan las cámaras que ya estaban sin señal antes del fallo.
        </p>
        <p>
          Con rol sectorizado se ven los equipos que afectan a tu sector, sean tuyos o no.
        </p>
      </ComoSeCalcula>
    </div>
  );
}

/** Cómo se dice cada papel en la cabecera de la pestaña. */
const ETIQUETA: Record<string, string> = {
  ANTENA: 'Antena', SWITCH: 'Switch', GRABADOR: 'Grabador',
  SERVIDOR: 'Servidor', FUENTE: 'Fuente de poder', PANTALLA: 'Pantalla',
  CAMARA: 'Cámara', OTRO: 'Equipo',
};

const ICONO: Record<string, string> = {
  ANTENA: 'mapeo', SWITCH: 'puertos', GRABADOR: 'grabador',
  SERVIDOR: 'pc', PANTALLA: 'pc', FUENTE: 'electricidad',
};

function Soporte({ s }: { s: any }) {
  const total: number = s.camarasEnTotal ?? s.camaras.length;
  const visibles: any[] = s.camaras || [];
  const ocultas = Math.max(total - visibles.length, 0);
  const roto = s.estado !== 'OPERATIVO';

  const titulo = (
    <>
      <Icono n={(ICONO[s.papel] || 'activos') as any} size={15} />
      {' '}{ETIQUETA[s.papel] || 'Equipo'} {s.codigo}
      <span className="grupo-marcas">
        {roto && <span className="badge crit">está fallando</span>}
        {total > 0
          ? (
            <span className={`badge ${roto ? 'crit' : 'OPERATIVO'}`}>
              {plural(total, 'cámara depende', 'cámaras dependen')}
            </span>
          )
          : s.salvadoPorAnillo
            ? <span className="badge OPERATIVO">protegido por el anillo</span>
            : <span className="badge sindatos">sin cámaras enlazadas</span>}
      </span>
    </>
  );

  return (
    <Detalle titulo={titulo} abiertoAlEntrar={roto && total > 0}>
      {/* La frase primero y sola: es lo único que se lleva quien mira cinco
          segundos. Debajo va el detalle para quien quiera entrar. */}
      <p className="dep-frase">{s.siCae}</p>

      {/* LA SEGUNDA PREGUNTA (bloque 49). No es lo mismo dejar de GRABAR que
          dejar de VER: la primera pierde la evidencia, la segunda sólo la
          vigilancia en vivo. El operador reporta las dos igual —«no veo la
          zona»— y quién lo atiende cambia por completo. */}
      <p className={`dep-efecto efecto-${s.efecto}`}>
        <Icono n={s.efecto === 'GRABA_PERO_NO_SE_VE' ? 'ojo' : s.efecto === 'SIN_DETERMINAR' ? 'nota' : 'alerta'} size={14} />
        {' '}{s.queSePierde}
      </p>

      <p className="dep-como">{s.comoFunciona}</p>

      <Cifras
        datos={[
          { n: total, et: total === 1 ? 'cámara depende' : 'cámaras dependen' },
          { n: visibles.filter((c) => c.viendo).length, de: visibles.length || undefined, et: 'viendo ahora' },
        ]}
      />

      {s.piezas?.length > 0 && (
        <div className="dep-piezas">
          <h4>Lo que lleva dentro</h4>
          {/* La fuente PoE vive DENTRO de la antena, no al lado. Enseñarla
              aparte convierte el inventario en un rompecabezas: nadie sabe
              después qué fuente era de qué antena. */}
          {s.piezas.map((p: any) => (
            <Link key={p.id} className="dep-pieza" to={`/a/${p.id}`}>
              <span className={`punto ${p.estado === 'OPERATIVO' ? 'ok' : 'mal'}`} />
              <b>{p.codigo}</b>
              <span className="dep-pieza-que">{p.siFalla}</span>
            </Link>
          ))}
        </div>
      )}

      {visibles.length > 0 && (
        <div className="dep-camaras">
          <h4>Cámaras que se caen con él</h4>
          {visibles.map((c: any) => (
            <Link key={c.id} className="dep-camara" to={`/a/${c.id}`}>
              <span className={`punto ${c.viendo ? 'ok' : 'mal'}`} />
              <b>{c.codigo}</b>
              {c.lugar && <span className="dep-camara-lugar">{c.lugar}</span>}
              {!c.viendo && <span className="badge crit">sin imagen</span>}
            </Link>
          ))}
        </div>
      )}

      {ocultas > 0 && (
        /* Se dice cuántas hay, no cuáles. Aceros Arequipa reparte la
           información por sector a propósito; ocultar que EXISTEN sería
           mentir sobre el tamaño del problema. */
        <p className="dep-ocultas">
          Y {plural(ocultas, 'cámara más', 'cámaras más')} de otros sectores, que
          no se listan aquí porque no están en tu ámbito.
        </p>
      )}
    </Detalle>
  );
}
