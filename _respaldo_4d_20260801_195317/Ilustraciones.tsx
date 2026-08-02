/**
 * ILUSTRACIONES DE LA PLANTA — dibujadas en vector, dentro del código.
 *
 * ¿Por qué no una fotografía?
 *
 *  1. Una foto de planta pesa entre 300 kB y 2 MB. Esta línea de laminación
 *     pesa unos 6 kB y se ve nítida en cualquier pantalla, desde un celular
 *     de 320 px hasta un monitor 4K. El sistema se abre desde la red de
 *     planta: ahí cada MB se nota.
 *  2. Una foto real de Aceros Arequipa es información de la empresa. No debe
 *     quedar embebida en un repositorio ni servida sin control de acceso.
 *  3. Un dibujo se adapta al color corporativo y a cualquier tamaño; una
 *     foto se pixela, se recorta mal y no se puede teñir.
 *
 * Lo que se representa es lo que el sistema vigila de verdad: el horno, los
 * castillos de laminación, la barra al rojo, la bobina — y las cámaras
 * mirándolo todo. Quien entra reconoce SU planta, no un dibujo genérico de
 * "tecnología".
 */

/** Marca del sistema: bobina de acero vista de frente + iris de cámara. */
export function MarcaSGIT({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      {/* Bobina: anillos concéntricos, el rollo laminado visto de frente */}
      <circle cx="24" cy="24" r="21" stroke="currentColor" strokeWidth="2.5" opacity=".28" />
      <circle cx="24" cy="24" r="14.5" stroke="currentColor" strokeWidth="2" opacity=".5" />
      {/* Iris de cámara: las seis hojas del diafragma */}
      <g stroke="#c0121f" strokeWidth="2.6" strokeLinecap="round">
        <path d="M24 3.5v8" />
        <path d="M24 36.5v8" />
        <path d="M41.7 13.8l-6.9 4" />
        <path d="M13.2 30.2l-6.9 4" />
        <path d="M41.7 34.2l-6.9-4" />
        <path d="M13.2 17.8l-6.9-4" />
      </g>
      <circle cx="24" cy="24" r="7" fill="#c0121f" />
      <circle cx="21.4" cy="21.4" r="2.4" fill="#fff" opacity=".85" />
    </svg>
  );
}

/**
 * Línea de laminación: horno → castillos → barra al rojo → bobina, con las
 * cámaras y sus conos de visión.
 *
 * Va DETRÁS del panel de acceso y muy tenue: tiene que dar identidad sin
 * competir con el formulario. Nadie entra al sistema a mirar el dibujo.
 */
export function LineaLaminacion({ className = '' }: { className?: string }) {
  const castillos = [210, 292, 374, 456];
  const camaras = [
    { x: 236, y: 78, gira: -14 },
    { x: 470, y: 74, gira: 12 },
  ];
  return (
    <svg
      className={className}
      viewBox="0 0 760 300"
      fill="none"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
    >
      <defs>
        {/* La barra sale del horno al rojo vivo y se enfría hacia la bobina */}
        <linearGradient id="sgit-barra" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffd08a" />
          <stop offset=".28" stopColor="#ff8c2b" />
          <stop offset=".7" stopColor="#e0431c" />
          <stop offset="1" stopColor="#9d2412" />
        </linearGradient>
        <radialGradient id="sgit-brasa" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#ffb547" stopOpacity=".55" />
          <stop offset="1" stopColor="#ffb547" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="sgit-cono" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7fb2ff" stopOpacity=".30" />
          <stop offset="1" stopColor="#7fb2ff" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Nave: cerchas del techo */}
      <g stroke="#7e97c4" strokeWidth="1.6" opacity=".30">
        <path d="M40 62h680" />
        <path d="M40 62l40-30h600l40 30" />
        <path d="M110 62V32M200 62V32M290 62V32M380 62V32M470 62V32M560 62V32M650 62V32" strokeWidth="1.1" />
      </g>
      <g stroke="#7e97c4" strokeWidth="2" opacity=".22">
        <path d="M56 62v186M704 62v186" />
      </g>
      <path d="M0 248h760" stroke="#8fa8d2" strokeWidth="2" opacity=".38" />

      {/* Horno de recalentamiento */}
      <rect x="46" y="150" width="120" height="86" rx="6" stroke="#9db6dd" strokeWidth="2.2" opacity=".55" />
      <rect x="60" y="166" width="52" height="54" rx="4" stroke="#9db6dd" strokeWidth="1.6" opacity=".35" />
      <path d="M96 150v-34h20v34" stroke="#9db6dd" strokeWidth="2" opacity=".45" />
      <ellipse cx="161" cy="201" rx="52" ry="42" fill="url(#sgit-brasa)" />
      <rect x="150" y="188" width="22" height="26" rx="3" fill="url(#sgit-barra)" opacity=".9" />

      {/* Barra al rojo recorriendo la línea */}
      <rect x="168" y="196" width="392" height="9" rx="4.5" fill="url(#sgit-barra)" />
      <rect x="168" y="196" width="392" height="3" rx="1.5" fill="#fff" opacity=".28" />

      {/* Castillos: los rodillos se van cerrando en cada paso, que es
          exactamente lo que hace un tren de laminación con la palanquilla */}
      {castillos.map((x, i) => (
        <g key={x}>
          <path d={`M${x - 26} 248v-30h52v30`} stroke="#9db6dd" strokeWidth="2" opacity=".45" />
          <circle cx={x} cy={188 - i * 2} r={17 - i * 1.6} stroke="#c3d4ee" strokeWidth="2.4" opacity=".8" />
          <circle cx={x} cy={213 + i * 2} r={17 - i * 1.6} stroke="#c3d4ee" strokeWidth="2.4" opacity=".8" />
          <circle cx={x} cy={188 - i * 2} r="3" fill="#c3d4ee" opacity=".55" />
          <circle cx={x} cy={213 + i * 2} r="3" fill="#c3d4ee" opacity=".55" />
        </g>
      ))}

      {/* Chispas del último paso */}
      <g fill="#ffb547" opacity=".75">
        <circle cx="486" cy="182" r="2.2" />
        <circle cx="498" cy="172" r="1.6" />
        <circle cx="507" cy="188" r="1.3" />
        <circle cx="478" cy="220" r="1.8" />
        <circle cx="495" cy="228" r="1.2" />
      </g>

      {/* Bobina final */}
      <g transform="translate(596 200)">
        <circle r="44" stroke="#c3d4ee" strokeWidth="2.4" opacity=".7" />
        <circle r="31" stroke="#c3d4ee" strokeWidth="1.8" opacity=".5" />
        <circle r="18" stroke="#c3d4ee" strokeWidth="1.6" opacity=".4" />
        <circle r="7" fill="#c0121f" opacity=".55" />
        <path d="M-44 0h-14" stroke="#c3d4ee" strokeWidth="2" opacity=".5" />
      </g>

      {/* Cámaras: lo que este sistema administra */}
      {camaras.map((c) => (
        <g key={c.x} transform={`translate(${c.x} ${c.y})`}>
          <path d="M0 0v-16" stroke="#9db6dd" strokeWidth="2" opacity=".5" />
          <g transform={`rotate(${c.gira})`}>
            <path d="M4 10L-46 118h96z" fill="url(#sgit-cono)" />
            <rect x="-13" y="-2" width="30" height="14" rx="6" fill="#dbe6f8" opacity=".9" />
            <rect x="15" y="1" width="6" height="8" rx="2" fill="#c0121f" opacity=".9" />
          </g>
          <circle cx="-16" cy="-1" r="2.6" fill="#3ddc84" opacity=".95" />
        </g>
      ))}

      {/* Operario: da escala humana a la nave */}
      <g stroke="#9db6dd" strokeWidth="2" opacity=".5" transform="translate(676 214)" fill="none">
        <circle cx="0" cy="-24" r="5" />
        <path d="M0-19v14M-7 0l7-5 7 5M0-5v22M0 17l-6 14M0 17l6 14" />
      </g>
    </svg>
  );
}

/**
 * "Aquí no hay nada". Una pantalla en blanco se lee como un error del
 * sistema; un dibujo con un mensaje se lee como lo que es: no hay trabajo
 * pendiente, que es una buena noticia.
 */
export function NadaPendiente({ size = 132 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.72} viewBox="0 0 180 130" fill="none" aria-hidden="true">
      <rect x="34" y="46" width="112" height="66" rx="8" stroke="currentColor" strokeWidth="2.4" opacity=".35" />
      <path d="M34 78h30l8 14h36l8-14h30" stroke="currentColor" strokeWidth="2.4" opacity=".35" />
      <path d="M62 46V26a6 6 0 016-6h44a6 6 0 016 6v20" stroke="currentColor" strokeWidth="2.2" opacity=".22" />
      <path d="M78 34l8 8 16-17" stroke="#16a34a" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <g fill="currentColor" opacity=".18">
        <circle cx="150" cy="34" r="3" />
        <circle cx="162" cy="48" r="2" />
        <circle cx="26" cy="40" r="2.4" />
      </g>
    </svg>
  );
}
