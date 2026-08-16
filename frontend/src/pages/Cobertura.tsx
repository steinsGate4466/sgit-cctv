import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import Icono from '../components/Iconos';
import { EsqueletoTablero } from '../components/Esqueleto';
import { useVolverALaPantalla } from '../useVolverALaPantalla';
import {
  Accion, Cifras, ComoSeCalcula, Detalle, LoQueHayQueHacer, Titular, Tono,
} from '../components/Patron';

/**
 * MI COBERTURA — la pantalla de Producción. Rehecha en el bloque 38.
 *
 * =============================================================================
 *  LA PREGUNTA, Y NADA MÁS QUE LA PREGUNTA
 * =============================================================================
 *      «¿QUÉ ESTOY DEJANDO DE VER AHORA MISMO, Y CUÁNTO IMPORTA?»
 *
 *  La versión anterior respondía eso, pero enterrado: abría con tres tarjetas
 *  de explicación y después una lista de todas las zonas, incluidas las que
 *  están perfectas. El jefe de línea tenía que leer para saber si le tocaba
 *  hacer algo.
 *
 *  Ahora se aplica la regla del bloque 38:
 *      arriba la respuesta · en medio lo que hay que hacer · abajo el detalle.
 *
 *  Y la prueba: si el jefe mira esta pantalla CINCO SEGUNDOS desde la puerta,
 *  ¿sabe si tiene que moverse? Con el titular en rojo y dos filas debajo, sí.
 *
 * =============================================================================
 *  LO QUE **NO** SE TOCÓ
 * =============================================================================
 *  El titular sigue viniendo del backend, palabra por palabra. Y la cobertura
 *  sigue pudiendo ser `null`: sin cámaras cargadas no se dice 0 % ni 100 %,
 *  porque los dos serían mentira. Eso es lógica de negocio y no se mueve
 *  porque cambie la presentación.
 */

const ESTADO: Record<string, string> = {
  FUERA_SERVICIO: 'Fuera de servicio',
  MANTENIMIENTO: 'En mantenimiento',
  CON_INCIDENCIA: 'Con incidencia',
  BAJA: 'Dada de baja',
};

/** Cuánto lleva sin verse, en la forma en que la gente lo dice. */
function desdeCuando(dias: number | null): { texto: string; tono: Tono } {
  if (dias === null) return { texto: 'sin fecha', tono: 'sindatos' };
  if (dias === 0) return { texto: 'hoy', tono: 'atender' };
  if (dias === 1) return { texto: 'ayer', tono: 'atender' };
  /* A partir de tres días el tono cambia a grave. No es un número redondo por
     capricho: es el punto en que «se cayó una cámara» pasa a ser «llevamos
     tres días sin ver el colado», que es lo que hace que alguien se mueva. */
  return { texto: `${dias} días`, tono: dias >= 3 ? 'grave' : 'atender' };
}

export default function Cobertura() {
  const [d, setD] = useState<any>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    setError('');
    try {
      const r = await api.get('/zonas/cobertura');
      setD(r.data);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'No se pudo cargar la cobertura.');
    } finally { setCargando(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);
  useVolverALaPantalla(cargar);

  /* LO QUE HAY QUE HACER: las cámaras concretas que no ven, ordenadas por
     antigüedad y con las de zona vital primero.

     No se listan zonas, se listan CÁMARAS. «Colada continua: 2 sin vista» es
     un dato; «AA-CAM-T2-COL-004, tres días» es algo que alguien puede ir a
     mirar esta tarde. */
  const acciones = useMemo<Accion[]>(() => {
    if (!d?.zonas) return [];
    const l: Array<Accion & { orden: number }> = [];
    for (const z of d.zonas) {
      for (const c of z.sinVista ?? []) {
        const t = desdeCuando(c.dias);
        l.push({
          id: c.codigo,
          marca: t.texto,
          tono: z.zonaVital ? 'grave' : t.tono,
          texto: z.nombre,
          donde: `${c.codigo} · ${ESTADO[c.estado] || c.estado}`,
          orden: (z.zonaVital ? 0 : 1000) - (c.dias ?? 0),
        });
      }
    }
    return l.sort((a, b) => a.orden - b.orden);
  }, [d]);

  if (cargando) return <div className="page"><EsqueletoTablero /></div>;
  if (error) return <div className="page"><div className="card peligro">{error}</div></div>;
  if (!d) return null;

  const vitalesCiegas = d.zonasVitalesSinVista > 0;
  const algoCiego = d.camaras > d.viendo;
  const tono: Tono = vitalesCiegas ? 'grave' : algoCiego ? 'atender' : 'bien';

  return (
    <div className="page">
      <h1 className="page-title">Mi cobertura</h1>

      {/* ---------- 1. LA RESPUESTA ---------- */}
      <Titular
        tono={d.coberturaPct === null ? 'sindatos' : tono}
        texto={d.titular}
        apoyo={
          d.coberturaPct === null
            ? 'Todavía no hay cámaras cargadas en tu ámbito. No se dice 0 % ni 100 %: los dos serían mentira.'
            : undefined
        }
      />

      {/* ---------- 2. LO QUE HAY QUE HACER ---------- */}
      <LoQueHayQueHacer
        titulo={acciones.length ? 'Lo que no se está viendo' : undefined}
        acciones={acciones}
        vacio={d.camaras > 0 ? 'Todas las cámaras de tu ámbito están dando imagen.' : undefined}
      />

      {/* ---------- 3. LOS NÚMEROS, EN UNA LÍNEA ---------- */}
      {d.camaras > 0 && (
        <Cifras
          datos={[
            { n: d.viendo, de: d.camaras, et: 'viendo' },
            { n: d.zonas.length, et: 'zonas' },
            { n: d.sinDeclarar, et: 'sin valorar' },
          ]}
        />
      )}

      {/* La única llamada a la acción que le toca al propio jefe de línea. */}
      {d.sinDeclarar > 0 && (
        <p className="nada-que-hacer">
          <b>{d.sinDeclarar}</b> {d.sinDeclarar === 1 ? 'zona tiene cámaras' : 'zonas tienen cámaras'} y
          nadie ha dicho cuánto {d.sinDeclarar === 1 ? 'importa' : 'importan'}. Mientras
          tanto todas pesan igual. Se declara en <b>Zonas vitales</b>.
        </p>
      )}

      {/* ---------- 4. EL DETALLE, PLEGADO ---------- */}
      {d.zonas.length > 0 && (
        <Detalle titulo={`Ver las ${d.zonas.length} ${d.zonas.length === 1 ? 'zona' : 'zonas'} con cámaras`}>
          {d.zonas.map((z: any) => (
            <div key={z.id} className="zona-fila">
              <div className="zona-cabeza">
                <b>{z.nombre}</b>
                {z.criticidadProduccion && (
                  <span className={'badge ' + (z.criticidadProduccion === 'CRITICA' ? 'crit'
                    : z.criticidadProduccion === 'ALTA' ? 'warn' : '')}>
                    {z.criticidadProduccion.toLowerCase()}
                  </span>
                )}
                <span className="zona-cuenta">
                  <b>{z.viendo}</b><span className="muted">/{z.camaras}</span>
                </span>
              </div>
              {[z.tren, z.etapa].filter(Boolean).length > 0 && (
                <div className="zona-sub">{[z.tren, z.etapa].filter(Boolean).join(' · ')}</div>
              )}
              {z.queSeVigila && <div className="zona-sub">Cubre: {z.queSeVigila}</div>}
              {z.declaracionVencida && (
                <div className="zona-aviso">
                  <Icono n="alerta" size={12} /> La valoración caducó. Se sigue
                  aplicando, pero hay que confirmarla.
                </div>
              )}
            </div>
          ))}
        </Detalle>
      )}

      {!d.zonas.length && (
        <div className="card vacio">
          <h3>No hay cámaras en tu ámbito</h3>
          <p>
            En cuanto se carguen los equipos y cuelguen de una zona del árbol de
            planta, aquí aparece qué cubre cada una y qué se está dejando de ver.
          </p>
        </div>
      )}

      {/* ---------- 5. LA EXPLICACIÓN, A DEMANDA ---------- */}
      <ComoSeCalcula>
        <p>
          Se cuentan sólo <b>cámaras</b>. Un switch caído es un problema de TI;
          lo que Producción pierde son ojos, y un switch no es un ojo — aunque
          tumbe diez. Ese impacto sale en <b>Puntos críticos</b>.
        </p>
        <p>
          El porcentaje es <b>sólo de contexto</b>. Un 95 % puede esconder que
          lo único apagado era lo único que importaba, así que lo que manda es
          <b> dónde</b> está el hueco, no cuántos son.
        </p>
        <p>
          La antigüedad sale de la incidencia abierta más antigua de esa cámara.
          Si no hay ninguna, se dice «sin fecha» en vez de inventar una.
        </p>
        <p>
          Ves tu ámbito. El jefe del Tren 2 ve el Tren 2, y no es un filtro de
          pantalla: se cruza contra lo que tienes permitido, así que escribir
          otro tren en la dirección no enseña nada.
        </p>
      </ComoSeCalcula>
    </div>
  );
}
