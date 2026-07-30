/**
 * FICHA POR TIPO DE ACTIVO — campos del formulario.
 *
 * POR QUÉ ESTÁ EN UN COMPONENTE APARTE
 * Son siete fichas distintas. Dentro del formulario de Activos —que ya tiene
 * 700 líneas— quedarían enterradas y cada tipo nuevo obligaría a rastrear
 * dónde poner sus campos. Aquí se agrega un tipo tocando un solo lugar.
 *
 * POR QUÉ SECCIONES Y NO UN ASISTENTE POR PASOS
 * El técnico en campo necesita poder guardar en cualquier momento con lo que
 * tenga. Un asistente obliga a avanzar en orden y a llegar al final para
 * guardar: justo lo contrario de lo que hace falta para mapear 400 equipos.
 *
 * NINGÚN campo es obligatorio a propósito. Si el formulario exige demasiado,
 * el técnico inventa datos para poder guardar, y un dato falso es peor que un
 * campo vacío. El sistema marca la ficha como incompleta y recuerda qué falta.
 */

// ---- Catálogos, con los textos que se usan en planta ----
const ROL_SWITCH: Record<string, string> = {
  CORE_ANILLO: 'Core del anillo',
  DISTRIBUCION: 'Distribución',
  POE_ACCESO: 'Acceso PoE (campo)',
  AJENO: 'De terceros, colgado del Fortinet (TP-Link)',
};

const MODO_ANTENA: Record<string, string> = {
  PMP_BASE: 'AP principal (base punto-multipunto)',
  SUSCRIPTOR: 'Suscriptora (cuelga del AP)',
  PTP: 'Radioenlace punto a punto',
  ESTACION: 'Estación',
};

const RED_GESTION: Record<string, string> = {
  GESTION: 'Gestión (10.x) — alcanzable desde el servidor',
  CAMARAS: 'Cámaras (192.x) — detrás del grabador',
  OTRA: 'Otra',
};

const DISTRIBUCION: Record<string, string> = {
  UNO: '1 cámara a pantalla completa',
  DOS_X_DOS: '2x2 — 4 cuadros',
  TRES_X_TRES: '3x3 — 9 cuadros',
  CUATRO_X_CUATRO: '4x4 — 16 cuadros',
  OTRO: 'Otra',
};

const FUENTE_PANTALLA: Record<string, string> = {
  DECODIFICADOR: 'Un decodificador',
  PC: 'El PC del púlpito (iVMS-4200)',
};

/** Qué bloque de ficha corresponde a cada tipo. Debe coincidir con el backend. */
export const FICHA_DE: Record<string, string> = {
  CAMERA: 'camera',
  NVR: 'nvr',
  SWITCH: 'switchDev',
  WIRELESS: 'wireless',
  DECODER: 'decoder',
  PANTALLA: 'screen',
  PC: 'pc',
};

interface Props {
  tipo: string;
  /** Valores de la ficha. */
  spec: any;
  onChange: (spec: any) => void;
  /** Lista ligera de activos (de /assets/options) para los desplegables. */
  opciones: any[];
}

export default function AssetSpecFields({ tipo, spec, onChange, opciones }: Props) {
  const bloque = FICHA_DE[tipo];
  if (!bloque) {
    return (
      <div className="muted" style={{ fontSize: 12, margin: '8px 0' }}>
        Este tipo de activo todavía no tiene ficha propia. Se registra con los
        datos generales.
      </div>
    );
  }

  const v = spec || {};
  const set = (campo: string, valor: any) =>
    onChange({ ...v, [campo]: valor === '' ? undefined : valor });
  const num = (campo: string) => (e: any) =>
    set(campo, e.target.value === '' ? undefined : Number(e.target.value));
  const txt = (campo: string) => (e: any) => set(campo, e.target.value);

  /** Activos de un tipo, para los desplegables de dependencia. */
  const de = (t: string) => opciones.filter((o) => o.type === t);

  const Nota = ({ children }: { children: any }) => (
    <div className="muted" style={{ fontSize: 11, marginTop: -6, marginBottom: 8 }}>{children}</div>
  );

  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '2px solid #e5e7eb' }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
        Datos propios del equipo
      </div>
      <div className="muted" style={{ fontSize: 11, marginBottom: 10 }}>
        Ninguno es obligatorio. Guarda con lo que tengas y complétalo después:
        el sistema te dirá qué falta.
      </div>

      {/* ------------------------------------------------------------ CÁMARA */}
      {tipo === 'CAMERA' && (
        <>
          <label>Grabador al que entra</label>
          <select value={v.nvrId || ''} onChange={txt('nvrId')}>
            <option value="">— sin definir —</option>
            {de('NVR').map((o) => <option key={o.id} value={o.id}>{o.assetCode}</option>)}
          </select>

          <label>Canal del grabador</label>
          <input type="number" min={1} value={v.nvrChannel ?? ''} onChange={num('nvrChannel')}
            placeholder="Ej: 7" />

          <label>Nombre en el grabador</label>
          <input value={v.nvrName || ''} onChange={txt('nvrName')}
            placeholder="Ej: Grúa puente 2 — lado sur" />
          <Nota>
            Es el nombre que ve el operador en la pantalla del púlpito. Cuando
            llama por radio dice <em>"se cayó la de la grúa 2"</em>, no el código
            del activo. Sin este dato hay que traducir cada reporte a mano.
          </Nota>

          <label>Tipo de cámara</label>
          <input value={v.cameraStyle || ''} onChange={txt('cameraStyle')}
            placeholder="Fija, domo, PTZ, bullet, térmica" />

          <label>Resolución</label>
          <input value={v.resolution || ''} onChange={txt('resolution')} placeholder="Ej: 2560x1440" />

          <label>Dirección IP</label>
          <input value={v.ipAddress || ''} onChange={txt('ipAddress')} placeholder="Ej: 192.168.10.34" />

          <label>Dirección MAC</label>
          <input value={v.macAddress || ''} onChange={txt('macAddress')} placeholder="Ej: 44:47:CC:.." />

          <label>Antena de la que cuelga</label>
          <select value={v.wirelessUplinkId || ''} onChange={txt('wirelessUplinkId')}>
            <option value="">— sin definir / va por cable —</option>
            {de('WIRELESS').map((o) => <option key={o.id} value={o.id}>{o.assetCode}</option>)}
          </select>
          <Nota>
            Si falla la antena, caen todas las cámaras que cuelgan de ella.
            Registrarlo es lo que permite ver el impacto de un solo golpe.
          </Nota>

          <label>Usuario del equipo</label>
          <input value={v.cameraUser || ''} onChange={txt('cameraUser')} placeholder="Ej: admin" />
        </>
      )}

      {/* ---------------------------------------------------------- GRABADOR */}
      {tipo === 'NVR' && (
        <>
          <label>Cantidad de canales</label>
          <input type="number" min={1} value={v.channels ?? ''} onChange={num('channels')} placeholder="Ej: 64" />

          <label>IP de LAN 1 — red de cámaras (192.x)</label>
          <input value={v.nicPrimary || ''} onChange={txt('nicPrimary')} placeholder="Ej: 192.168.10.1" />

          <label>IP de LAN 2 — red de gestión (10.x)</label>
          <input value={v.nicSecondary || ''} onChange={txt('nicSecondary')} placeholder="Ej: 10.20.30.12" />
          <Nota>
            Es la <strong>única</strong> alcanzable desde el servidor. De aquí
            sale el monitoreo automático por ping: si el grabador no responde,
            sabes al instante que perdiste todos sus canales de golpe.
          </Nota>

          <label>Cantidad de discos</label>
          <input type="number" min={0} value={v.diskCount ?? ''} onChange={num('diskCount')} />

          <label>Capacidad total (TB)</label>
          <input type="number" min={0} step="0.5" value={v.capacityTb ?? ''} onChange={num('capacityTb')} />

          <label>Switch al que va conectado directo</label>
          <select value={v.switchIdDirect || ''} onChange={txt('switchIdDirect')}>
            <option value="">— sin definir —</option>
            {de('SWITCH').map((o) => <option key={o.id} value={o.id}>{o.assetCode}</option>)}
          </select>
        </>
      )}

      {/* ------------------------------------------------------------ SWITCH */}
      {tipo === 'SWITCH' && (
        <>
          <label>Rol en la red</label>
          <select value={v.switchRole || ''} onChange={txt('switchRole')}>
            <option value="">— sin definir —</option>
            {Object.entries(ROL_SWITCH).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>

          <label>Fabricante</label>
          <input value={v.vendor || ''} onChange={txt('vendor')} placeholder="Fortinet, TP-Link, Hikvision" />

          <label>Cantidad de puertos</label>
          <input type="number" min={1} value={v.portCount ?? ''} onChange={num('portCount')} placeholder="Ej: 24" />

          <label>Puertos con PoE</label>
          <input type="number" min={0} value={v.poePorts ?? ''} onChange={num('poePorts')} placeholder="Ej: 8" />

          <label>Presupuesto PoE total (watts)</label>
          <input type="number" min={0} value={v.poeBudgetW ?? ''} onChange={num('poeBudgetW')} placeholder="Ej: 130" />
          <Nota>
            Con esto se sabe si el switch aún puede alimentar otra cámara.
            Agregar equipos sin revisar el presupuesto es causa habitual de
            caídas intermitentes que nadie asocia al switch.
          </Nota>

          <label>IP de gestión</label>
          <input value={v.mgmtIp || ''} onChange={txt('mgmtIp')} placeholder="Ej: 10.20.30.5" />

          <label>¿En qué red está esa IP?</label>
          <select value={v.mgmtNetwork || ''} onChange={txt('mgmtNetwork')}>
            <option value="">— sin definir —</option>
            {Object.entries(RED_GESTION).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
        </>
      )}

      {/* ------------------------------------------------------------ ANTENA */}
      {tipo === 'WIRELESS' && (
        <>
          <label>Modo</label>
          <select value={v.mode || ''} onChange={txt('mode')}>
            <option value="">— sin definir —</option>
            {Object.entries(MODO_ANTENA).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>

          <label>AP del que cuelga</label>
          <select value={v.parentWirelessId || ''} onChange={txt('parentWirelessId')}>
            <option value="">— ninguno (es el AP principal) —</option>
            {de('WIRELESS').map((o) => <option key={o.id} value={o.id}>{o.assetCode}</option>)}
          </select>

          <label>Fabricante</label>
          <input value={v.vendor || ''} onChange={txt('vendor')} placeholder="Ubiquiti, Mimosa, TP-Link" />

          <label>Frecuencia</label>
          <input value={v.frequency || ''} onChange={txt('frequency')} placeholder="Ej: 5 GHz" />

          <label>SSID</label>
          <input value={v.ssid || ''} onChange={txt('ssid')} />

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <input type="checkbox" checked={!!v.hasCredentials}
              onChange={(e) => set('hasCredentials', e.target.checked)} />
            <span>Tenemos las credenciales de esta antena</span>
          </label>
          <Nota>
            Si no la marcas, la antena entra en la lista de la campaña de
            barrido. Es el dato que permite planificar el reemplazo con números
            en vez de de memoria.
          </Nota>

          <label>Señal (dBm)</label>
          <input type="number" min={-120} max={0} value={v.signalDbm ?? ''} onChange={num('signalDbm')}
            placeholder="Ej: -62" />

          <label>Punto de origen</label>
          <input value={v.originPoint || ''} onChange={txt('originPoint')} placeholder="Ej: Púlpito Tren 2" />

          <label>Punto de destino</label>
          <input value={v.destPoint || ''} onChange={txt('destPoint')} placeholder="Ej: Lecho de enfriamiento" />
        </>
      )}

      {/* ---------------------------------------------------- DECODIFICADOR */}
      {tipo === 'DECODER' && (
        <>
          <label>Cantidad de salidas de video</label>
          <input type="number" min={1} value={v.outputCount ?? ''} onChange={num('outputCount')} placeholder="Ej: 4" />
          <Nota>
            Cada salida alimenta una pantalla del videowall. Las salidas y a qué
            pantalla van se configuran después, desde la ficha del equipo.
          </Nota>

          <label>Grabador del que consume el video</label>
          <select value={v.sourceNvrId || ''} onChange={txt('sourceNvrId')}>
            <option value="">— sin definir —</option>
            {de('NVR').map((o) => <option key={o.id} value={o.id}>{o.assetCode}</option>)}
          </select>

          <label>IP de gestión</label>
          <input value={v.mgmtIp || ''} onChange={txt('mgmtIp')} />
        </>
      )}

      {/* ---------------------------------------------------------- PANTALLA */}
      {tipo === 'PANTALLA' && (
        <>
          <label>Rótulo</label>
          <input value={v.label || ''} onChange={txt('label')} placeholder="Ej: Pantalla 1" />
          <Nota>
            Como la llaman en el púlpito. Es lo que dice el operador cuando
            reporta <em>"se puso negro el cuadro de la pantalla 2"</em>.
          </Nota>

          <label>Tamaño (pulgadas)</label>
          <input type="number" min={1} step="0.5" value={v.sizeInch ?? ''} onChange={num('sizeInch')} placeholder="Ej: 55" />

          <label>Distribución del videowall</label>
          <select value={v.layout || ''} onChange={txt('layout')}>
            <option value="">— sin definir —</option>
            {Object.entries(DISTRIBUCION).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>

          <label>¿Quién la alimenta?</label>
          <select value={v.sourceKind || ''} onChange={txt('sourceKind')}>
            <option value="">— sin definir —</option>
            {Object.entries(FUENTE_PANTALLA).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>

          {v.sourceKind === 'PC' && (
            <>
              <label>PC que la maneja</label>
              <select value={v.sourcePcAssetId || ''} onChange={txt('sourcePcAssetId')}>
                <option value="">— sin definir —</option>
                {de('PC').map((o) => <option key={o.id} value={o.id}>{o.assetCode}</option>)}
              </select>
            </>
          )}
        </>
      )}

      {/* ---------------------------------------------------------------- PC */}
      {tipo === 'PC' && (
        <>
          <label>Nombre del equipo</label>
          <input value={v.hostname || ''} onChange={txt('hostname')} placeholder="Ej: PC-PULPITO-T2" />

          <label>Sistema operativo</label>
          <input value={v.os || ''} onChange={txt('os')} placeholder="Ej: Windows 10" />

          <label>Versión de iVMS-4200</label>
          <input value={v.ivmsVersion || ''} onChange={txt('ivmsVersion')} placeholder="Ej: 3.8.2" />

          <label>Salidas de video</label>
          <input type="number" min={1} max={16} value={v.videoOutputs ?? ''} onChange={num('videoOutputs')} />

          <label>Grabadores configurados</label>
          <textarea value={v.nvrsConfigured || ''} onChange={txt('nvrsConfigured')} rows={3}
            style={{ width: '100%', resize: 'vertical' }}
            placeholder="Uno por línea, con su IP" />
          <Nota>
            Es lo que se pierde cuando hay que reinstalar el equipo y nadie
            recuerda qué grabadores tenía cargados.
          </Nota>
        </>
      )}
    </div>
  );
}
