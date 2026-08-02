import { useEffect, useState } from 'react';
import { alFallarLaRed } from '../api/client';
import Icono from './Iconos';

/**
 * FRANJA DE "ALGO NO CARGÓ".
 *
 * Va en el armazón, encima del contenido, y aparece sola cuando el servidor
 * falla o se cae la red. Es la otra mitad del arreglo de los 92 errores
 * tragados: el cliente anuncia el fallo, y esto lo enseña.
 *
 * TRES DECISIONES:
 *
 *  · EMPUJA, NO FLOTA. Ya cometí ese error con el aviso de sesión cerrada:
 *    flotando tapaba el campo que el usuario iba a tocar.
 *
 *  · SE VA SOLA cuando vuelve una respuesta buena. Un aviso que hay que
 *    cerrar a mano se acaba cerrando sin leer, y a la tercera vez la gente
 *    aprende a ignorarlo.
 *
 *  · NO DICE "ERROR 500". Dice qué significa para quien está trabajando:
 *    "lo que ves puede estar incompleto". El código del error no le sirve a
 *    un técnico en planta, y el miedo que provoca sí le entorpece.
 */
export default function AvisoRed() {
  const [aviso, setAviso] = useState<{ texto: string; grave: boolean } | null>(null);

  useEffect(() => alFallarLaRed(setAviso), []);

  if (!aviso) return null;

  return (
    <div className="aviso-red" role="status">
      <Icono n="alerta" size={16} />
      <span>{aviso.texto}</span>
      <button className="aviso-red-btn" onClick={() => location.reload()}>
        Reintentar
      </button>
    </div>
  );
}
