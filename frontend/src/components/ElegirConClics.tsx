/**
 * ELEGIR CON CLICS — bloque 169. Fichas que se tocan, en vez de escribir.
 * Una (`multiple=false`) o varias. Se usa donde la lista es corta y se elige
 * en campo con el celular: tocar es más rápido y no deja dos maneras de
 * escribir lo mismo.
 */
export default function ElegirConClics({ opciones, valor, onChange, multiple = false, etiqueta }: {
  opciones: { valor: string; texto: string }[];
  valor: string[];
  onChange: (v: string[]) => void;
  multiple?: boolean;
  etiqueta?: string;
}) {
  return (
    <div>
      {etiqueta && <label>{etiqueta}</label>}
      <div className="chips-elegir" role="group" aria-label={etiqueta}>
        {opciones.map((o) => {
          const on = valor.includes(o.valor);
          return (
            <button key={o.valor} type="button" className={on ? 'activo' : undefined} aria-pressed={on}
              onClick={() => onChange(multiple ? (on ? valor.filter((v) => v !== o.valor) : [...valor, o.valor]) : (on ? [] : [o.valor]))}>
              {o.texto}
            </button>
          );
        })}
      </div>
    </div>
  );
}
