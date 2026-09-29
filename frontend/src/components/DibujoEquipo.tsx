/**
 * EL DIBUJO DE CADA EQUIPO — bloque 162.
 *
 * Pedido de Cristhian: «tiene que ser con su NVR, una camarita, cosas así».
 * El bloque 161 ya ponía un pictograma por tipo, pero de trazo fino: se leía
 * como un símbolo, no como el aparato. Aquí cada equipo es un DIBUJO pequeño
 * del aparato real —carcasa, lente, leds, puertos— para que en el mapa, en la
 * ficha y en las listas se reconozca de un vistazo qué es.
 *
 * Coordenadas de ±10 alrededor del centro. Los colores van por CLASE (`eq-*`
 * en styles.css) y no escritos aquí: así la paleta vive en un solo sitio, y el
 * modo noche no los invierte (el aparato es gris de día y de noche).
 *
 * El ESTADO no está en el dibujo: lo pone quien lo usa (anillo y marca en el
 * mapa). Un aparato no cambia de forma porque esté caído.
 */
/* Se dibuja al 86 %: así ningún aparato (la visera de la bala, los platos del
   radioenlace, la pantalla ancha) se sale del disco del mapa. */
export function DibujoEquipo({ icono }: { icono: string }) {
  return <g transform="scale(0.86)">{dibujo(icono)}</g>;
}

function dibujo(icono: string) {
  switch (icono) {
    /* ------------------------------------------------------------ cámaras */
    case 'camara-domo':
      return (
        <g>
          <rect x={-8.5} y={2.2} width={17} height={3.2} rx={1.2} className="eq-cuerpo" />
          <path d="M-6.8 2.4 A6.8 6.8 0 0 1 6.8 2.4 Z" className="eq-oscuro" />
          <circle cx={0} cy={-1.1} r={2.2} className="eq-lente" />
          <circle cx={-0.8} cy={-1.9} r={0.7} className="eq-brillo" />
          <path d="M-4.6 -1.8 A5 5 0 0 1 -1.8 -4.4" className="eq-reflejo" />
        </g>
      );
    case 'camara-ptz':
      return (
        <g>
          <rect x={-2.2} y={-9.5} width={4.4} height={3.2} rx={0.8} className="eq-cuerpo" />
          <rect x={-1.1} y={-6.6} width={2.2} height={2.2} className="eq-cuerpo" />
          <path d="M-6 -4.2 H6 V-1.4 H-6 Z" className="eq-cuerpo" />
          <circle cx={0} cy={2.6} r={5.6} className="eq-oscuro" />
          <circle cx={0} cy={3.1} r={2.3} className="eq-lente" />
          <circle cx={-0.8} cy={2.3} r={0.7} className="eq-brillo" />
          <path d="M-8.6 3 A8.6 8.6 0 0 0 -3.5 9.4" className="eq-giro" />
          <path d="M-4.6 7.8 L-3.3 9.6 L-5.4 10.1" className="eq-giro" />
        </g>
      );
    case 'camara-bala':
    case 'camara-termica': {
      const termica = icono === 'camara-termica';
      return (
        <g>
          <path d="M-1.5 3.2 L-1.5 7.4 M-4.2 8.2 H1.2" className="eq-soporte" />
          <rect x={-8.8} y={-3.6} width={13.8} height={7} rx={2} className="eq-cuerpo" />
          <path d="M-9.6 -4.8 H6.4 L7.8 -2.8 H-9.6 Z" className="eq-visera" />
          <rect x={4.6} y={-3} width={3.6} height={5.8} rx={1.2} className="eq-oscuro" />
          <circle cx={6.4} cy={-0.1} r={1.9} className={termica ? 'eq-lente-termica' : 'eq-lente'} />
          <circle cx={5.9} cy={-0.7} r={0.55} className="eq-brillo" />
          <circle cx={-6.4} cy={1.6} r={0.7} className="eq-led-verde" />
          {termica && <path d="M-4.2 0.8 q1 -1.3 0 -2.6 M-1.8 0.8 q1 -1.3 0 -2.6" className="eq-calor" />}
        </g>
      );
    }
    case 'camara-360':
      return (
        <g>
          <circle cx={0} cy={0} r={8.6} className="eq-cuerpo" />
          <circle cx={0} cy={0} r={5.2} className="eq-oscuro" />
          <circle cx={0} cy={0} r={2.8} className="eq-lente" />
          <circle cx={-1} cy={-1} r={0.8} className="eq-brillo" />
          <circle cx={6.8} cy={0} r={0.7} className="eq-led-verde" />
        </g>
      );
    case 'camara':
      return (
        <g>
          <rect x={-8.6} y={-4.4} width={11.6} height={8.8} rx={2} className="eq-cuerpo" />
          <path d="M3 -2.2 L8.6 -4.6 V4.6 L3 2.2 Z" className="eq-oscuro" />
          <circle cx={-2.8} cy={0} r={2.6} className="eq-lente" />
          <circle cx={-3.5} cy={-0.8} r={0.7} className="eq-brillo" />
          <circle cx={-7} cy={-2.8} r={0.7} className="eq-led-verde" />
        </g>
      );

    /* ------------------------------------------------------- grabación / red */
    case 'nvr':
      return (
        <g>
          <rect x={-9.4} y={-5.6} width={18.8} height={11.2} rx={1.6} className="eq-caja-oscura" />
          <rect x={-8} y={-4.2} width={9.6} height={8.4} rx={0.8} className="eq-panel" />
          <path d="M-8 -1.4 H1.6 M-8 1.4 H1.6" className="eq-ranura" />
          <circle cx={4.4} cy={-2.4} r={0.95} className="eq-led-verde" />
          <circle cx={7} cy={-2.4} r={0.95} className="eq-led-azul" />
          <circle cx={4.4} cy={0.6} r={0.95} className="eq-led-verde" />
          <circle cx={7} cy={0.6} r={0.95} className="eq-led-rojo" />
          <path d="M3.6 3.4 H7.8" className="eq-ranura" />
        </g>
      );
    case 'switch':
      return (
        <g>
          <rect x={-9.6} y={-4.6} width={19.2} height={9.2} rx={1.4} className="eq-caja-oscura" />
          {[-7.2, -4, -0.8, 2.4, 5.6].map((x) => (
            <g key={x}>
              <rect x={x} y={-1.6} width={2.4} height={2.6} rx={0.3} className="eq-puerto" />
              <circle cx={x + 0.6} cy={-3} r={0.5} className={x > 3 ? 'eq-led-ambar' : 'eq-led-verde'} />
            </g>
          ))}
          <path d="M-7.6 3 H7.6" className="eq-ranura" />
        </g>
      );
    case 'router':
      return (
        <g>
          <path d="M-5.2 -1.4 L-6.8 -8.4 M5.2 -1.4 L6.8 -8.4" className="eq-soporte" />
          <rect x={-9} y={-1.6} width={18} height={6.6} rx={2} className="eq-cuerpo" />
          <circle cx={-5.6} cy={1.7} r={0.8} className="eq-led-verde" />
          <circle cx={-3} cy={1.7} r={0.8} className="eq-led-verde" />
          <circle cx={-0.4} cy={1.7} r={0.8} className="eq-led-azul" />
        </g>
      );
    case 'firewall':
      return (
        <g>
          <rect x={-9} y={-6.6} width={18} height={13.2} rx={1.2} className="eq-ladrillo" />
          <path d="M-9 -2.2 H9 M-9 2.2 H9 M-3 -6.6 V-2.2 M4 -6.6 V-2.2 M0.5 -2.2 V2.2 M-6 -2.2 V2.2 M7 -2.2 V2.2 M-3 2.2 V6.6 M4 2.2 V6.6" className="eq-junta" />
        </g>
      );
    case 'servidor':
      return (
        <g>
          {[-7.4, -2.2, 3].map((y) => (
            <g key={y}>
              <rect x={-8.6} y={y} width={17.2} height={4.4} rx={0.9} className="eq-caja-oscura" />
              <path d={`M-6.8 ${y + 2.2} H1`} className="eq-ranura" />
              <circle cx={5.2} cy={y + 2.2} r={0.8} className="eq-led-verde" />
              <circle cx={7.2} cy={y + 2.2} r={0.8} className="eq-led-azul" />
            </g>
          ))}
        </g>
      );
    case 'decodificador':
      return (
        <g>
          <rect x={-9.4} y={-6.4} width={18.8} height={12.8} rx={1.4} className="eq-caja-oscura" />
          <rect x={-8} y={-5} width={7.4} height={4.6} className="eq-pantalla" />
          <rect x={0.6} y={-5} width={7.4} height={4.6} className="eq-pantalla" />
          <rect x={-8} y={0.4} width={7.4} height={4.6} className="eq-pantalla" />
          <rect x={0.6} y={0.4} width={7.4} height={4.6} className="eq-pantalla-alerta" />
        </g>
      );

    /* --------------------------------------------------------------- radio */
    case 'antena-base':
      return (
        <g>
          <path d="M0 9.4 V-1" className="eq-soporte" />
          <rect x={-2.2} y={-8.8} width={4.4} height={10.4} rx={1.4} className="eq-cuerpo" />
          <path d="M-5 -6.6 A6 6 0 0 0 -5 1.4 M5 -6.6 A6 6 0 0 1 5 1.4" className="eq-onda" />
          <path d="M-7.8 -8.6 A9.4 9.4 0 0 0 -7.8 3.4 M7.8 -8.6 A9.4 9.4 0 0 1 7.8 3.4" className="eq-onda" />
          <circle cx={0} cy={-6.6} r={0.8} className="eq-led-verde" />
        </g>
      );
    case 'antena-suscriptor':
      return (
        <g>
          <path d="M-1 3.6 V9.4 M-4 9.4 H2" className="eq-soporte" />
          <path d="M-7.6 -7.4 A10 10 0 0 0 4.8 5.2 Z" className="eq-cuerpo" />
          <path d="M-1.6 -1.2 L5.6 -7.2" className="eq-soporte" />
          <circle cx={6.2} cy={-7.8} r={1.4} className="eq-oscuro" />
          <path d="M8.4 -4.6 A4 4 0 0 1 5.4 -1.4" className="eq-onda" />
        </g>
      );
    case 'antena-ptp':
      return (
        <g>
          <path d="M-9.4 -5 A6 6 0 0 0 -9.4 5 Z" className="eq-cuerpo" />
          <path d="M9.4 -5 A6 6 0 0 1 9.4 5 Z" className="eq-cuerpo" />
          <path d="M-5.2 0 H5.2" className="eq-enlace" />
          <path d="M-2.4 -2.4 L-5.2 0 L-2.4 2.4 M2.4 -2.4 L5.2 0 L2.4 2.4" className="eq-enlace" />
        </g>
      );
    case 'antena':
      return (
        <g>
          <path d="M0 9.4 V0" className="eq-soporte" />
          <rect x={-2.6} y={-7.4} width={5.2} height={8.6} rx={1.4} className="eq-cuerpo" />
          <path d="M-5.6 -5.4 A5 5 0 0 0 -5.6 0.2 M5.6 -5.4 A5 5 0 0 1 5.6 0.2" className="eq-onda" />
        </g>
      );

    /* ------------------------------------------------------------- energía */
    case 'fuente':
      return (
        <g>
          <path d="M-8.8 4.8 H-5.6 M5.6 -4.8 H8.8" className="eq-soporte" />
          <rect x={-5.8} y={-6.6} width={11.6} height={13.2} rx={2} className="eq-caja-oscura" />
          <path d="M1.2 -4.6 L-2.8 1 H0 L-1 5 L3 -0.8 H0.2 Z" className="eq-rayo" />
        </g>
      );
    case 'ups':
      return (
        <g>
          <rect x={-6.4} y={-8.6} width={12.8} height={17.2} rx={1.6} className="eq-caja-oscura" />
          <rect x={-4.4} y={-6.4} width={8.8} height={4.4} rx={0.6} className="eq-pantalla" />
          <rect x={-4} y={0.2} width={8} height={2.2} rx={0.4} className="eq-bateria" />
          <rect x={-4} y={3.4} width={8} height={2.2} rx={0.4} className="eq-bateria" />
          <circle cx={3} cy={7} r={0.8} className="eq-led-verde" />
        </g>
      );

    /* ----------------------------------------------------------- estaciones */
    case 'pc':
      return (
        <g>
          <rect x={-9} y={-7.4} width={18} height={11.6} rx={1.2} className="eq-caja-oscura" />
          <rect x={-7.6} y={-6} width={15.2} height={8.8} className="eq-pantalla" />
          <path d="M-4 -2.6 H2 M-4 0 H4" className="eq-texto-pantalla" />
          <path d="M0 4.2 V7.4 M-4.2 8.2 H4.2" className="eq-soporte" />
        </g>
      );
    case 'pantalla':
      return (
        <g>
          <rect x={-9.8} y={-6.8} width={19.6} height={12.2} rx={1} className="eq-caja-oscura" />
          <rect x={-8.6} y={-5.6} width={8.3} height={4.8} className="eq-pantalla" />
          <rect x={0.3} y={-5.6} width={8.3} height={4.8} className="eq-pantalla" />
          <rect x={-8.6} y={-0.4} width={8.3} height={4.8} className="eq-pantalla" />
          <rect x={0.3} y={-0.4} width={8.3} height={4.8} className="eq-pantalla" />
          <path d="M-3 7.8 H3" className="eq-soporte" />
        </g>
      );
    case 'telefono':
      return (
        <g>
          <path d="M-9 4.4 L-7 -2.6 H7 L9 4.4 Z" className="eq-caja-oscura" />
          <path d="M-8.6 -3.4 Q-9.4 -7.6 -6 -7.6 H6 Q9.4 -7.6 8.6 -3.4 Z" className="eq-cuerpo" />
          <rect x={-4} y={-1.2} width={8} height={2.4} className="eq-pantalla" />
          <path d="M-4.4 3 H-2.4 M-1 3 H1 M2.4 3 H4.4" className="eq-texto-pantalla" />
        </g>
      );
    default:
      return (
        <g>
          <rect x={-7.4} y={-5.6} width={14.8} height={11.2} rx={1.8} className="eq-cuerpo" />
          <circle cx={4.2} cy={2.8} r={0.9} className="eq-led-verde" />
        </g>
      );
  }
}
