import { useMemo, useState } from 'react';

/**
 * EL MAPA DE LA RED, DIBUJADO.
 *
 * POR QUÉ UN DIBUJO Y NO OTRA TABLA
 * El ranking de puntos críticos responde "¿qué pasa si cae esto?". El mapa
 * responde una pregunta distinta y anterior: "¿CÓMO ESTÁ MONTADO ESTO?".
 * Con una tabla, entender que ocho cámaras cuelgan del mismo switch exige
 * leer ocho filas y recordarlas. En un dibujo se ve de un golpe.
 *
 * SIN LIBRERÍAS DE GRAFOS. Es SVG a mano, y es deliberado: una librería de
 * diagramas son cientos de kB en un paquete que ya arrastra su peso, para
 * dibujar cajas y líneas. Además serían coordenadas que no controlamos.
 *
 * EL COLOCADO ES POR COLUMNAS, según a cuántos saltos está cada equipo del
 * grabador. Eso no es una decisión estética: es la estructura real de la red
 * —grabador, core, switch de tren, cámara— y hace que el dibujo se parezca
 * al armario. Un colocado "bonito" con nodos flotando sería más vistoso y
 * menos útil.
 */

const COLOR: Record<string, string> = {
  OPERATIVO: '#16a34a',
  MANTENIMIENTO: '#d97706',
  CON_INCIDENCIA: '#ea580c',
  FUERA_SERVICIO: '#dc2626',
};

const ANCHO_COL = 190;
const ALTO_FILA = 46;

export default function MapaRed({
  datos, onNodo,
}: {
  datos: { nodos: any[]; enlaces: any[] };
  onNodo?: (n: any) => void;
}) {
  const [sobre, setSobre] = useState<string | null>(null);

  const { pos, ancho, alto } = useMemo(() => {
    // Agrupar por nivel. Los que no llegan al grabador no tienen nivel: van
    // a una columna aparte al final, porque son justo lo que hay que mirar.
    const porNivel = new Map<number, any[]>();
    const sueltos: any[] = [];
    for (const n of datos.nodos) {
      if (n.nivel === null || n.nivel === undefined) sueltos.push(n);
      else {
        if (!porNivel.has(n.nivel)) porNivel.set(n.nivel, []);
        porNivel.get(n.nivel)!.push(n);
      }
    }
    const niveles = [...porNivel.keys()].sort((a, b) => a - b);
    const columnas = niveles.map((k) => porNivel.get(k)!);
    if (sueltos.length) columnas.push(sueltos);

    const pos = new Map<string, { x: number; y: number }>();
    let maxFilas = 0;
    columnas.forEach((col, ci) => {
      // Orden estable por código: si cambia en cada carga, el dibujo "salta"
      // y cuesta reconocer lo que se estaba mirando.
      col.sort((a, b) => (a.code || '').localeCompare(b.code || ''));
      maxFilas = Math.max(maxFilas, col.length);
      col.forEach((n, fi) => {
        pos.set(n.id, { x: 24 + ci * ANCHO_COL, y: 40 + fi * ALTO_FILA });
      });
    });

    return {
      pos,
      ancho: 48 + columnas.length * ANCHO_COL,
      alto: 70 + maxFilas * ALTO_FILA,
    };
  }, [datos]);

  if (!datos.nodos.length) return null;

  return (
    <div className="mapa-red">
      <svg viewBox={`0 0 ${ancho} ${alto}`} style={{ minWidth: ancho, height: alto }}>
        {/* Los enlaces van PRIMERO: así las cajas quedan encima y las líneas
            no cruzan por delante del texto. */}
        {datos.enlaces.map((e, i) => {
          const a = pos.get(e.a); const b = pos.get(e.b);
          if (!a || !b) return null;
          const activo = sobre === e.a || sobre === e.b;
          return (
            <path
              key={i}
              // Curva en lugar de recta: con muchas líneas paralelas, las
              // rectas se solapan y no se distingue cuál va a dónde.
              d={`M${a.x + 150} ${a.y + 13} C${a.x + 180} ${a.y + 13} ${b.x - 30} ${b.y + 13} ${b.x} ${b.y + 13}`}
              fill="none"
              stroke={e.esAnillo ? '#2e5496' : '#c3d0e3'}
              strokeWidth={activo ? 2.4 : e.esAnillo ? 2 : 1.2}
              strokeDasharray={e.esAnillo ? '6 4' : undefined}
              opacity={sobre && !activo ? 0.25 : 1}
            />
          );
        })}

        {datos.nodos.map((n) => {
          const p = pos.get(n.id);
          if (!p) return null;
          const color = n.aislado ? '#dc2626' : COLOR[n.estado] || '#6b7688';
          const atenuado = sobre && sobre !== n.id;
          return (
            <g
              key={n.id}
              transform={`translate(${p.x} ${p.y})`}
              opacity={atenuado ? 0.4 : 1}
              onMouseEnter={() => setSobre(n.id)}
              onMouseLeave={() => setSobre(null)}
              onClick={() => onNodo?.(n)}
              style={{ cursor: onNodo ? 'pointer' : 'default' }}
            >
              <rect
                width="150" height="26" rx="7"
                fill={n.esRaiz ? '#16233b' : '#fff'}
                stroke={color}
                strokeWidth={n.esRaiz ? 0 : 1.6}
              />
              {/* Barra de color a la izquierda: el estado se distingue sin
                  depender sólo del color del borde, que en una pantalla al
                  sol de planta casi no se ve. */}
              {!n.esRaiz && <rect width="4" height="26" rx="2" fill={color} />}
              <text
                x="10" y="17" fontSize="10.5"
                fill={n.esRaiz ? '#fff' : '#101828'}
                fontWeight={n.esRaiz ? 700 : 500}
              >
                {(n.code || '').slice(0, 20)}
              </text>
              {n.aislado && (
                <title>No llega al grabador. Aunque esté encendido, no se está viendo.</title>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
