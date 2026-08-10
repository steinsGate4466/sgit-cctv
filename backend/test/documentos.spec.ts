import { revisarDocumento, tipoRealDeDocumento, nombreEnAlmacen, MAX_BYTES_DOC } from '../src/modules/documents/archivos-documento';

const pdf = () => Buffer.concat([Buffer.from([0x25, 0x50, 0x44, 0x46]), Buffer.alloc(100)]);
const zip = () => Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(100)]);
const exe = () => Buffer.concat([Buffer.from([0x4d, 0x5a]), Buffer.alloc(100)]);

describe('qué archivos se aceptan como documento', () => {
  it('un PDF de verdad entra', () => {
    const r = revisarDocumento(pdf(), 'manual.pdf');
    expect(r.ok).toBe(true);
    expect(r.tipo?.ext).toBe('pdf');
    expect(r.tipo?.verificado).toBe(true);
  });

  it('un ejecutable renombrado a .pdf NO entra', () => {
    // Es el ataque de manual: cambiar la extensión. Los bytes no mienten.
    const r = revisarDocumento(exe(), 'manual.pdf');
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain('no coincide con su extensión');
  });

  it('un docx entra porque por dentro es un zip', () => {
    expect(revisarDocumento(zip(), 'ficha.docx').tipo?.ext).toBe('docx');
  });

  it('un zip con extensión inventada no se adivina', () => {
    expect(revisarDocumento(zip(), 'algo.raro').ok).toBe(false);
  });

  it('un texto plano entra, pero marcado como NO verificado', () => {
    const r = revisarDocumento(Buffer.from('interface GigabitEthernet0/1\n'), 'switch.cfg');
    expect(r.ok).toBe(true);
    expect(r.tipo?.verificado).toBe(false);
    // Y se sirve como texto: aunque traiga HTML, el navegador no lo ejecuta.
    expect(r.tipo?.mime).toContain('text/plain');
  });

  it('un binario disfrazado de .txt no cuela', () => {
    const conNulos = Buffer.from([0x41, 0x00, 0x42, 0x00]);
    expect(revisarDocumento(conNulos, 'raro.txt').ok).toBe(false);
  });

  it('rechaza lo que pesa de más', () => {
    const enorme = Buffer.concat([Buffer.from([0x25, 0x50, 0x44, 0x46]), Buffer.alloc(MAX_BYTES_DOC + 10)]);
    expect(revisarDocumento(enorme, 'grande.pdf').ok).toBe(false);
  });

  it('rechaza el archivo vacío', () => {
    expect(revisarDocumento(Buffer.alloc(0), 'x.pdf').ok).toBe(false);
  });

  it('el nombre en el almacén NUNCA usa el del usuario', () => {
    // Un nombre como "../../etc/passwd" no debe poder salir de su carpeta.
    const n = nombreEnAlmacen('abc-123', { ext: 'pdf', mime: 'application/pdf', verificado: true });
    expect(n).toBe('documentos/abc-123.pdf');
    expect(n).not.toContain('..');
  });

  it('un PNG y un JPG se reconocen por sus bytes', () => {
    expect(tipoRealDeDocumento(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0]), 'x.png')?.ext).toBe('png');
    expect(tipoRealDeDocumento(Buffer.from([0xff, 0xd8, 0xff, 0, 0]), 'x.jpg')?.ext).toBe('jpg');
  });
});
