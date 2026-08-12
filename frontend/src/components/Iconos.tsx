/**
 * ICONOS DEL MENÚ Y DE LAS ACCIONES — vectoriales, no emojis.
 *
 * Antes el menú usaba emojis (📥 🚂 🔧 🗄️). Se ven DISTINTOS en cada
 * aparato: en Windows 10 son de un dibujante, en Android de otro y en iPhone
 * de otro. Algunos ni existen y salen como un cuadrado vacío. Un menú cuyo
 * aspecto depende del teléfono del técnico no es un menú: es una sorpresa.
 *
 * Estos heredan el color del texto (currentColor), así que se tiñen solos al
 * marcar la opción activa, y pesan unos 3 kB en total.
 */

const D: Record<string, string> = {
  // Tablero y navegación
  bandeja: 'M3 12h5l2 3h4l2-3h5M5 5h14l2 7v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6z',
  tablero: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
  tren: 'M6 3h12v11H6zM8 6h3v4H8m5 0h3V6h-3M7 14l-2 5m14-5l2 5M6 19h12',
  // Infraestructura
  activos: 'M4 6h16M4 12h16M4 18h10',
  gabinete: 'M4 3h16v18H4zM4 9h16M4 15h16M8 6h.01M8 12h.01M8 18h.01',
  ubicacion: 'M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z M12 10h.01',
  cableado: 'M7 3v6a5 5 0 005 5 5 5 0 015 5v2M9 3v3M5 6h4M15 22v-3M13 19h4',
  mapeo: 'M9 4h6v3H9zM7 4H5v16h14V4h-2M9 12l2 2 4-4',
  acceso: 'M12 3l8 4v5c0 5-3.4 8.4-8 9-4.6-.6-8-4-8-9V7z M9 12l2 2 4-4',
  // Rayo dentro de un tablero: electricidad.
  electricidad: 'M5 3h14v18H5zM13 7l-4 5h3l-1 5 4-5h-3z',
  // Monitor con peana: el registro de PCs conocidos.
  pc: 'M3 4h18v11H3zM9 19h6M12 15v4M7 19h10',
  // Escoba: limpieza de datos. No es una papelera a propósito —la papelera
  // sugiere que se puede recuperar, y de aquí no se recupera nada.
  // Reloj con barra: la ventana de parada.
  parada: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 2M3 12h2M19 12h2',
  // Llave y tornillo: instalar algo nuevo.
  instalar: 'M4 20l6-6M9 5l4 4M11 3l6 6-2 2-6-6zM6 15l3 3-2 2-3-3z',
  escoba: 'M7 21l4-8M17 21l-4-8M9 13h6l2-9-4 1-1-3-1 3-4-1z',
  // Operación
  incidencia: 'M12 3l9 16H3zM12 10v4M12 17h.01',
  orden: 'M14.5 3.5a5 5 0 00-6.6 6.2L3 14.6 5.4 17l4.9-4.9a5 5 0 006.2-6.6L13.6 8 11 5.4z',
  // Mantenimiento
  preventivo: 'M4 6h16v14H4zM8 3v4M16 3v4M4 10h16M9 15l2 2 4-4',
  correctivo: 'M4 20l7-7M13 5l6 6M15 3l6 6-3 3-6-6zM3 21l4-1 1-3-1-1-3 1z',
  predictivo: 'M3 17l5-6 4 3 5-7M14 7h5v5',
  mejora: 'M12 20V6M6 12l6-6 6 6',
  // Almacén y sistema
  inventario: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10',
  auditoria: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h6M9 17h4',
  usuarios: 'M16 20v-2a4 4 0 00-4-4H7a4 4 0 00-4 4v2M9.5 6.5a3 3 0 106 0 3 3 0 10-6 0M17 14a4 4 0 013 3.9V20',
  // Acciones
  pin: 'M15 3a5 5 0 00-4.6 7L3 17.4V21h3.6l1-1v-2h2v-2h2l1.6-1.6A5 5 0 1015 3zm1.5 3.5h.01',
  salir: 'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9',
  ojo: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7zM12 15a3 3 0 100-6 3 3 0 000 6z',
  ojoNo: 'M3 3l18 18M10.6 10.6a3 3 0 004.2 4.2M9.4 5.3A9.7 9.7 0 0112 5c6.4 0 10 7 10 7a17 17 0 01-3.2 4.1M6.3 6.4A17 17 0 002 12s3.6 7 10 7c1 0 1.9-.1 2.8-.4',
  candado: 'M5 11h14v10H5zM8 11V7a4 4 0 018 0v4M12 15v2',
  etiqueta: 'M3 3h8l10 10-8 8L3 11zM7.5 7.5h.01',
  reloj: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 2',
  alerta: 'M12 3l9 16H3zM12 10v4M12 17h.01',
  ok: 'M20 6L9 17l-5-5',
};

export type NombreIcono = keyof typeof D;

export default function Icono({
  n,
  size = 18,
  grosor = 1.8,
}: {
  n: string;
  size?: number;
  grosor?: number;
}) {
  const d = D[n];
  // Si alguien escribe mal el nombre NO se rompe la pantalla: deja el hueco.
  // Un menú a medio pintar por una errata de icono sería absurdo.
  if (!d) return <span className="ico" style={{ width: size, display: 'inline-block' }} />;
  return (
    <svg
      className="ico"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={grosor}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} />
    </svg>
  );
}
