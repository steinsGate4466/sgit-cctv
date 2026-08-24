/* =============================================================================
   BLOQUE 62-B · CÓMO SE INTERVIENE ESTA ZONA, ANTES DE TOCAR NADA
   -----------------------------------------------------------------------------
   EL PROBLEMA QUE CIERRA

   El backend lleva desde el bloque 28 calculando si una zona se puede tocar
   con el tren en marcha, con permiso eléctrico, con permiso de altura, o si
   exige que el tren esté parado. Está firmado por una persona con nombre y
   fecha, y hay hasta un permiso —`zona.intervencion`— para firmarlo.

   Y NO SE ENSEÑABA EN EL SITIO DONDE HACE FALTA.

   El técnico escanea el QR de pie delante de la cámara, de noche, y la
   pantalla le contaba la marca, el modelo, la IP y el historial. No le decía
   que ahí abajo pasa barra caliente.

   Es el mismo error del mapa de red y del módulo de documentos, escrito en el
   CLAUDE.md desde hace meses: modelo + cálculo ≠ función. Sin pantalla, no
   existe. Sólo que esta vez lo que no existía era una advertencia de
   seguridad.

   -----------------------------------------------------------------------------
   TRES REGLAS DE LAS QUE NO SE BAJA

   1. VA ARRIBA DEL TODO. Antes del código, antes del estado, antes de las
      órdenes abiertas. Un aviso de seguridad que hay que buscar no es un
      aviso: en móvil, todo lo que está por debajo del primer pantallazo no
      se lee cuando hay prisa.

   2. LO QUE SE PINTA ES `intervencionAplica`, NUNCA LA PROPUESTA. El sistema
      propone a partir del ambiente de la zona, pero la propuesta NO AUTORIZA.
      Sin firma, `aplica` vale EXIGE_PARADA — y eso es lo que se lee.

   3. AQUÍ NO HAY «TODO BIEN» EN VERDE. Ni el caso más suave dice que se pueda
      subir tranquilo: dice qué NIVEL de permiso hace falta. El verde de «todo
      correcto» en una pantalla de seguridad se aprende a ignorar en una
      semana, y entonces ya no protege el día que importa.
============================================================================= */
import Icono from './Iconos';

type Nivel =
  | 'EN_MARCHA'
  | 'CON_PERMISO_ELECTRICO'
  | 'CON_PERMISO_ALTURA'
  | 'EXIGE_PARADA'
  | 'SIN_CLASIFICAR';

export interface PlantaConIntervencion {
  intervencionAplica?: Nivel | null;
  intervencionFirmada?: boolean | null;
  intervencionDesactualizada?: boolean | null;
  intervencionMotivo?: string | null;
}

/* Texto de planta, no de norma. El técnico no lee «CON_PERMISO_ELECTRICO»:
   lee «bloquea el tablero antes de abrir». La palabra que dice QUÉ HACER es
   la que evita el accidente; la etiqueta del enum sólo nombra el problema. */
const NIVEL: Record<Nivel, { titulo: string; hacer: string; clase: string }> = {
  EN_MARCHA: {
    titulo: 'Se puede intervenir con el tren en marcha',
    hacer:
      'Zona de cabina o púlpito. Aun así: avisa al jefe de línea antes de tocar, ' +
      'porque tu equipo puede estar dando imagen a alguien ahora mismo.',
    clase: 'iv-suave',
  },
  CON_PERMISO_ELECTRICO: {
    titulo: 'Hace falta permiso y BLOQUEO ELÉCTRICO',
    hacer:
      'No se abre el tablero sin bloqueo y tarjeta puestos por ti. ' +
      'Candado propio: el de otro no te protege.',
    clase: 'iv-media',
  },
  CON_PERMISO_ALTURA: {
    titulo: 'Hace falta PERMISO DE ALTURA',
    hacer:
      'Por encima de 1,80 m hace falta PETAR, arnés con doble línea anclada y ' +
      'personal acreditado. Subir «un momento» a mirar también es subir.',
    clase: 'iv-media',
  },
  EXIGE_PARADA: {
    titulo: 'EL TREN TIENE QUE ESTAR PARADO',
    hacer:
      'Barra caliente, vapor o rodillos. No se entra con la línea produciendo, ' +
      'ni para mirar. Si no hay ventana de parada abierta, esto no se hace hoy.',
    clase: 'iv-dura',
  },
  SIN_CLASIFICAR: {
    titulo: 'NADIE HA DECLARADO CÓMO SE INTERVIENE ESTA ZONA',
    hacer:
      'Mientras no esté firmada se trata como si exigiera parada, que es lo ' +
      'seguro. Que falte el dato NO significa que no haya riesgo: pregunta ' +
      'antes de acercarte.',
    clase: 'iv-dura',
  },
};

export default function AvisoDeIntervencion({
  planta,
  zona,
}: {
  planta?: PlantaConIntervencion | null;
  zona?: string | null;
}) {
  /* Si la ficha no trae el dato, NO se calla: se pinta el caso más
     restrictivo. Un fallo de red o un backend viejo no puede convertirse en
     silencio delante de una línea caliente. Falla hacia el lado seguro. */
  const nivel: Nivel = planta?.intervencionAplica || 'SIN_CLASIFICAR';
  const n = NIVEL[nivel] || NIVEL.SIN_CLASIFICAR;
  const firmada = planta?.intervencionFirmada === true;

  return (
    <div className={'iv-aviso ' + n.clase}>
      <div className="iv-cabecera">
        <Icono n={nivel === 'EXIGE_PARADA' || nivel === 'SIN_CLASIFICAR' ? 'alerta' : 'seguridad'} size={18} />
        <span className="iv-titulo">{n.titulo}</span>
      </div>

      <div className="iv-hacer">{n.hacer}</div>

      {/* Quién lo firmó importa tanto como el nivel. «Lo dice el sistema» no
          es una autorización; «lo firmó fulano el 3 de agosto» sí, y si algún
          día pasa algo esa decisión tiene dueño. */}
      <div className="iv-firma">
        {firmada ? (
          <>
            <Icono n="firma" size={13} />
            <span>{planta?.intervencionMotivo || 'Zona firmada.'}</span>
          </>
        ) : (
          <>
            <Icono n="alerta" size={13} />
            <span>
              <b>Sin firmar.</b>{' '}
              {planta?.intervencionMotivo ||
                'Nadie ha declarado cómo se interviene aquí, así que se pide parada.'}
            </span>
          </>
        )}
      </div>

      {/* Firma vieja: alguien firmó «se puede en marcha» y desde entonces la
          zona cambió de ambiente. La firma sigue valiendo formalmente, pero
          se hizo sobre una planta que ya no es ésta. Se dice, no se tapa. */}
      {planta?.intervencionDesactualizada && (
        <div className="iv-desfase">
          <Icono n="reloj" size={13} />
          <span>
            La firma permite más de lo que hoy correspondería por el ambiente de
            la zona{zona ? ` (${zona})` : ''}. Algo cambió en planta desde que se
            firmó: revísalo antes de mandar a nadie.
          </span>
        </div>
      )}
    </div>
  );
}
