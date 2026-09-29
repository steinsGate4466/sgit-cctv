import { NOMBRE_TEMA, useTema } from '../tema';

/**
 * Sol / luna / automático — bloque 157. Un toque pasa al siguiente:
 * Automático → Claro → Noche. El título dice cuál hay y cuál viene, para que
 * nadie tenga que adivinar qué hace el botón.
 */
export default function BotonTema() {
  const { tema, efectivo, siguiente, elegir } = useTema();
  const texto = `Tema: ${NOMBRE_TEMA[tema]}${tema === 'auto' ? ` (${efectivo === 'oscuro' ? 'noche' : 'claro'})` : ''}. Pulsa para «${NOMBRE_TEMA[siguiente]}».`;
  return (
    <button type="button" className="logout tema-boton" onClick={() => elegir(siguiente)} title={texto} aria-label={texto}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {tema === 'claro' && (<><circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6" /></>)}
        {tema === 'oscuro' && <path d="M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a6.8 6.8 0 0 0 10.7 10.7Z" />}
        {tema === 'auto' && (<><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17Z" fill="currentColor" stroke="none" /></>)}
      </svg>
      <span className="tema-nombre">{NOMBRE_TEMA[tema]}</span>
    </button>
  );
}
