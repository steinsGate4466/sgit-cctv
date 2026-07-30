jest.mock('@prisma/client', () => ({ PrismaClient: class {}, Prisma: {} }));

import {
  leerCatalogo, aNumero, detectarSeparador, partirLinea, normalizar, mapearColumnas,
} from '../src/modules/inventory/catalogo-csv.util';

/**
 * Camino crítico: la lectura del catálogo exportado de SAP.
 *
 * Es la parte más frágil de todo el módulo porque el archivo NUNCA viene limpio:
 * separadores según la configuración regional, marca de bytes de Excel, números
 * con punto y coma mezclados, encabezados en español o inglés, filas a medias.
 *
 * Si el lector falla en silencio, el Jefe sube el archivo, ve "0 filas" y
 * concluye que el sistema no funciona.
 */
describe('catálogo CSV — lectura del archivo de SAP', () => {

  // ------------------------------------------------------------ separador
  describe('separador', () => {
    it('detecta punto y coma, que es lo que exporta Excel en español', () => {
      // Si se asumiera coma, el archivo entero se leería como UNA columna y el
      // usuario vería "0 filas válidas" sin entender por qué.
      expect(detectarSeparador('Material;Texto breve;Stock')).toBe(';');
    });
    it('detecta coma', () => {
      expect(detectarSeparador('sapCode,name,stock')).toBe(',');
    });
    it('detecta tabulación', () => {
      expect(detectarSeparador('sapCode\tname\tstock')).toBe('\t');
    });
  });

  describe('partir línea', () => {
    it('respeta las comillas', () => {
      expect(partirLinea('A;"Cable Cat6; 305 m";10', ';'))
        .toEqual(['A', 'Cable Cat6; 305 m', '10']);
    });
    it('entiende la comilla escapada', () => {
      expect(partirLinea('A;"Cable ""blindado""";5', ';'))
        .toEqual(['A', 'Cable "blindado"', '5']);
    });
  });

  // -------------------------------------------------------------- números
  describe('conversión de números', () => {
    it('formato europeo: 1.234,50', () => {
      expect(aNumero('1.234,50')).toBe(1234.5);
    });
    it('formato inglés: 1,234.50', () => {
      expect(aNumero('1,234.50')).toBe(1234.5);
    });
    it('coma decimal simple: 45,5', () => {
      expect(aNumero('45,5')).toBe(45.5);
    });
    it('coma de miles: 1,234', () => {
      // Tres dígitos después de la coma = separador de miles, no decimal.
      expect(aNumero('1,234')).toBe(1234);
    });
    it('punto de miles: 1.250', () => {
      // Caso AMBIGUO de verdad: "1.250" puede ser mil doscientos cincuenta
      // (europeo) o uno con veinticinco (inglés). Se aplica el mismo criterio
      // que a la coma —tres dígitos detrás = miles— porque es simétrico y
      // porque en este dominio decide bien: los repuestos se cuentan por
      // unidad y "1,25 conectores" no significa nada.
      expect(aNumero('1.250')).toBe(1250);
    });
    it('punto decimal cuando NO separa tres dígitos', () => {
      expect(aNumero('1.25')).toBe(1.25);
      expect(aNumero('12.5')).toBe(12.5);
    });
    it('varios puntos de miles: 1.234.567', () => {
      expect(aNumero('1.234.567')).toBe(1234567);
    });
    it('europeo completo: 1.234,50', () => {
      expect(aNumero('1.234,50')).toBe(1234.5);
    });
    it('tolera la unidad pegada al número', () => {
      expect(aNumero('45 M')).toBe(45);
      expect(aNumero('12 UN')).toBe(12);
    });
    it('devuelve null y NO cero cuando no hay número', () => {
      // Un cero inventado haría creer que el repuesto está agotado y podría
      // disparar una compra que no hace falta.
      expect(aNumero('')).toBeNull();
      expect(aNumero('   ')).toBeNull();
      expect(aNumero('sin dato')).toBeNull();
      expect(aNumero('-')).toBeNull();
    });
    it('lee el cero real como cero', () => {
      expect(aNumero('0')).toBe(0);
    });
  });

  // --------------------------------------------------------- encabezados
  describe('encabezados', () => {
    it('ignora acentos, mayúsculas y signos', () => {
      expect(normalizar('  Código SAP ')).toBe('codigosap');
      expect(normalizar('Unidad de Medida')).toBe('unidaddemedida');
    });
    it('reconoce los encabezados en español de SAP', () => {
      const m = mapearColumnas(['Material', 'Texto breve', 'Unidad medida', 'Libre utilización', 'Almacén']);
      expect(m.sapCode).toBe(0);
      expect(m.name).toBe(1);
      expect(m.unit).toBe(2);
      expect(m.currentStock).toBe(3);
      expect(m.warehouse).toBe(4);
    });
    it('reconoce también los encabezados en inglés', () => {
      const m = mapearColumnas(['sapCode', 'name', 'unit', 'currentStock']);
      expect(m.sapCode).toBe(0);
      expect(m.name).toBe(1);
    });
  });

  // --------------------------------------------------------- lectura real
  describe('lectura completa', () => {
    it('lee un archivo típico de SAP con punto y coma', () => {
      const csv = [
        'Material;Texto breve;Grupo;Unidad medida;Libre utilización;Punto pedido;Almacén',
        'SAP-1001;Cable UTP Cat6 rollo 305 m;Cableado;RO;12;3;Almacén TI',
        'SAP-1002;Conector RJ45 Cat6;Conectividad;UN;1.250;200;Almacén TI',
      ].join('\n');
      const r = leerCatalogo(csv);
      expect(r.rechazadas).toHaveLength(0);
      expect(r.filas).toHaveLength(2);
      expect(r.filas[0]).toMatchObject({
        sapCode: 'SAP-1001', name: 'Cable UTP Cat6 rollo 305 m',
        unit: 'RO', currentStock: 12, minStock: 3, warehouse: 'Almacén TI',
      });
      // 1.250 en formato europeo son mil doscientos cincuenta, no 1,25.
      expect(r.filas[1].currentStock).toBe(1250);
    });

    it('quita la marca de bytes que Excel escribe al inicio', () => {
      // Sin quitarla, el primer encabezado no coincide con ningún alias y la
      // importación falla sin explicación visible.
      const csv = '﻿Material;Texto breve\nSAP-1;Cable\n';
      const r = leerCatalogo(csv);
      expect(r.filas).toHaveLength(1);
      expect(r.filas[0].sapCode).toBe('SAP-1');
    });

    it('rechaza la fila mala y CONTINÚA con el resto', () => {
      // Un archivo de 300 líneas no puede perderse porque la 3 venga incompleta.
      const csv = [
        'Material;Texto breve',
        'SAP-1;Cable Cat6',
        ';Sin código',
        'SAP-3;',
        'SAP-4;Fuente PoE',
      ].join('\n');
      const r = leerCatalogo(csv);
      expect(r.filas.map((f) => f.sapCode)).toEqual(['SAP-1', 'SAP-4']);
      expect(r.rechazadas).toHaveLength(2);
      expect(r.rechazadas[0].motivo).toMatch(/sin código/i);
      expect(r.rechazadas[1].motivo).toMatch(/sin descripción/i);
      // El número de línea real, para que el usuario lo encuentre en su archivo.
      expect(r.rechazadas[0].linea).toBe(3);
    });

    it('rechaza códigos SAP repetidos', () => {
      const csv = 'Material;Texto breve\nSAP-1;Cable\nSAP-1;Cable otra vez\n';
      const r = leerCatalogo(csv);
      expect(r.filas).toHaveLength(1);
      expect(r.rechazadas[0].motivo).toMatch(/repetido/i);
    });

    it('explica qué encabezados leyó cuando no encuentra las columnas', () => {
      // Sin este mensaje, el usuario no tiene forma de saber qué corregir.
      const r = leerCatalogo('Columna1;Columna2\na;b\n');
      expect(r.filas).toHaveLength(0);
      expect(r.rechazadas[0].motivo).toMatch(/Columna1/);
      expect(r.rechazadas[0].motivo).toMatch(/código SAP/i);
    });

    it('avisa si el archivo está vacío', () => {
      const r = leerCatalogo('');
      expect(r.rechazadas[0].motivo).toMatch(/vacío/i);
    });

    it('informa qué columna usó para cada campo', () => {
      // Sirve para que el usuario confirme que el sistema entendió su archivo
      // antes de aplicar los cambios.
      const r = leerCatalogo('Material;Texto breve;Libre utilización\nSAP-1;Cable;5\n');
      expect(r.columnasDetectadas.sapCode).toBe('Material');
      expect(r.columnasDetectadas.currentStock).toBe('Libre utilización');
    });

    it('ignora las líneas en blanco del final', () => {
      const r = leerCatalogo('Material;Texto breve\nSAP-1;Cable\n\n\n');
      expect(r.filas).toHaveLength(1);
    });

    it('deja el stock sin definir si la columna no viene', () => {
      // No se asume cero: "no vino el dato" y "hay cero" son cosas distintas.
      const r = leerCatalogo('Material;Texto breve\nSAP-1;Cable\n');
      expect(r.filas[0].currentStock).toBeUndefined();
    });

    it('redondea el stock porque el cable se entrega por rollo', () => {
      const r = leerCatalogo('Material;Texto breve;Stock\nSAP-1;Cable;12,7\n');
      expect(r.filas[0].currentStock).toBe(13);
    });

    it('nunca deja un stock negativo', () => {
      const r = leerCatalogo('Material;Texto breve;Stock\nSAP-1;Cable;-5\n');
      expect(r.filas[0].currentStock).toBe(0);
    });
  });
});
