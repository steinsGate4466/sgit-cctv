/**
 * «ESTÁS AQUÍ» — bloque 171 (plan 154).
 *
 * Al llegar al mapa desde el QR de un equipo, el plano se centra en él y lo
 * marca así. Se dibuja en píxeles de PANTALLA (`escala`), como los marcadores:
 * mide lo mismo con el plano entero que con zoom. Sólo late la opacidad —no se
 * anima `transform`, que es lo que descolocaba las ventanas (bloque 167)—.
 */
export default function EstasAqui({ x, y, escala }: { x: number; y: number; escala: number }) {
  return (
    <g className="estas-aqui" transform={`translate(${x} ${y}) scale(${escala})`} pointerEvents="none" aria-hidden>
      <circle r={30} className="estas-aqui-onda" />
      <circle r={22} className="estas-aqui-aro" />
      <g transform="translate(0 -44)">
        <rect x={-44} y={-13} width={88} height={24} rx={12} className="estas-aqui-cartel" />
        <text y={4} textAnchor="middle" className="estas-aqui-texto">Estás aquí</text>
        <path d="M-6 11 L0 19 L6 11 Z" className="estas-aqui-cartel" />
      </g>
    </g>
  );
}
