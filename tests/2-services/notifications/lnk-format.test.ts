// Tests unitarios del formato MS-SHLLINK (lnk-format.ts).
// Cobertura: round-trip de buildShortcutBytes + parseAppUserModelId, y
// validación de cada bloque individual.
import { describe, it, expect } from 'vitest';
import {
  buildShortcutBytes,
  parseAppUserModelId,
  parseIconLocation,
  patchIconLocation,
} from '../../../src/2-services/notifications/lnk-format.js';

const BASE_ARGS = {
  target: 'C:\\Program Files\\nodejs\\node.exe',
  icon: 'C:\\repo\\assets\\notifications\\ai-assistant.ico,0',
  name: 'AI Assistant',
  aumid: 'AIAssistant.Proxy',
};

describe('buildShortcutBytes', () => {
  it('genera un header de 76 bytes con HeaderSize=0x4C y LinkCLSID correcto', () => {
    const bytes = buildShortcutBytes(BASE_ARGS);
    expect(bytes.length).toBeGreaterThanOrEqual(76);
    expect(bytes.readUInt32LE(0)).toBe(0x4c);
    // LinkCLSID: {00021401-0000-0000-C000-000000000046}
    expect(bytes[0x04]).toBe(0x01);
    expect(bytes[0x05]).toBe(0x14);
    expect(bytes[0x06]).toBe(0x02);
    expect(bytes[0x07]).toBe(0x00);
    expect(bytes[0x0c]).toBe(0xc0);
    expect(bytes[0x13]).toBe(0x46);
  });

  it('establece LinkFlags con HasLinkInfo, HasName, HasIconLocation, IsUnicode', () => {
    const bytes = buildShortcutBytes(BASE_ARGS);
    const flags = bytes.readUInt32LE(0x14);
    expect(flags & 0x02).toBeTruthy(); // HasLinkInfo
    expect(flags & 0x04).toBeTruthy(); // HasName
    expect(flags & 0x40).toBeTruthy(); // HasIconLocation
    expect(flags & 0x80).toBeTruthy(); // IsUnicode
    // No usamos LinkTargetIDList
    expect(flags & 0x01).toBeFalsy();
  });

  it('incluye ShowCommand=SW_SHOWNORMAL (1) en offset 0x3C', () => {
    const bytes = buildShortcutBytes(BASE_ARGS);
    expect(bytes.readUInt32LE(0x3c)).toBe(1);
  });

  it('incluye LinkInfo con LocalBasePath igual al target y Unicode suffix', () => {
    const bytes = buildShortcutBytes(BASE_ARGS);
    const linkInfoSize = bytes.readUInt32LE(0x4c);
    expect(linkInfoSize).toBeGreaterThan(0x1c);
    expect(bytes.readUInt32LE(0x50)).toBe(0x1c); // LinkInfoHeaderSize
    // LocalBasePathOffset = 0x1C (justo después del header)
    expect(bytes.readUInt32LE(0x5c)).toBe(0x1c);
    // CommonPathSuffixOffset = 0x1C (mismo path, no es link de red)
    expect(bytes.readUInt32LE(0x64)).toBe(0x1c);
    // VolumeIDOffset = 0
    expect(bytes.readUInt32LE(0x58)).toBe(0);
  });

  it('termina con 4 bytes 0x00 (terminator de ExtraData)', () => {
    const bytes = buildShortcutBytes(BASE_ARGS);
    expect(bytes[bytes.length - 1]).toBe(0);
    expect(bytes[bytes.length - 2]).toBe(0);
    expect(bytes[bytes.length - 3]).toBe(0);
    expect(bytes[bytes.length - 4]).toBe(0);
  });
});

describe('parseAppUserModelId', () => {
  it('extrae el AUMID generado por buildShortcutBytes (round-trip)', () => {
    const bytes = buildShortcutBytes(BASE_ARGS);
    expect(parseAppUserModelId(bytes)).toBe('AIAssistant.Proxy');
  });

  it('devuelve undefined si el header size no es 0x4C', () => {
    const bytes = buildShortcutBytes(BASE_ARGS);
    bytes.writeUInt32LE(0x60, 0); // HeaderSize inválido
    expect(parseAppUserModelId(bytes)).toBeUndefined();
  });

  it('devuelve undefined si el LinkCLSID no es el esperado', () => {
    const bytes = buildShortcutBytes(BASE_ARGS);
    bytes[0x04] = 0xff; // CLSID corrupto
    expect(parseAppUserModelId(bytes)).toBeUndefined();
  });

  it('devuelve undefined si el buffer es más corto que el header', () => {
    const short = Buffer.alloc(50);
    expect(parseAppUserModelId(short)).toBeUndefined();
  });

  it('devuelve undefined si la signature del bloque no es APP_USER_MODEL_ID', () => {
    // Generamos un .lnk válido, localizamos la signature 0xA0000005,
    // y la reemplazamos con un valor distinto. El parser debe retornar
    // undefined porque ningún bloque del ExtraData coincidirá.
    const bytes = buildShortcutBytes(BASE_ARGS);
    // Buscar el signature en el .lnk. La signature se emite en
    // little-endian como bytes `0x05 0x00 0x00 0xA0`.
    const sig = Buffer.from([0x05, 0x00, 0x00, 0xa0]);
    const offset = bytes.indexOf(sig);
    expect(offset).toBeGreaterThan(0); // existe el bloque
    // Sobrescribir con un valor distinto.
    Buffer.from([0xff, 0xff, 0xff, 0xff]).copy(bytes, offset);
    expect(parseAppUserModelId(bytes)).toBeUndefined();
  });
});

describe('round-trip con AUMIDs custom', () => {
  it('preserva el AUMID cuando contiene dígitos y guiones', () => {
    const args = { ...BASE_ARGS, aumid: 'Company-App-1.2.3' };
    expect(parseAppUserModelId(buildShortcutBytes(args))).toBe('Company-App-1.2.3');
  });

  it('preserva el AUMID de longitud máxima (129 chars)', () => {
    const aumid = 'A'.repeat(129);
    const args = { ...BASE_ARGS, aumid };
    expect(parseAppUserModelId(buildShortcutBytes(args))).toBe(aumid);
  });

  it('preserva el Name (DisplayName)', () => {
    const args = { ...BASE_ARGS, name: 'My Custom App Name' };
    const bytes = buildShortcutBytes(args);
    // El Name aparece en StringData (NAME_STRING) como CountedString
    // UTF-16LE. Buscamos el string en los bytes (cada char UTF-16LE
    // es 2 bytes; sin BOM).
    const utf16 = Buffer.from('My Custom App Name', 'utf16le');
    let found = false;
    for (let i = 0; i < bytes.length - utf16.length; i++) {
      if (bytes.slice(i, i + utf16.length).equals(utf16)) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('preserva el IconLocation (incluye índice ",0")', () => {
    const args = { ...BASE_ARGS, icon: 'C:\\custom\\path\\app.ico,0' };
    const bytes = buildShortcutBytes(args);
    expect(parseIconLocation(bytes)).toBe('C:\\custom\\path\\app.ico,0');
  });
});

describe('parseIconLocation', () => {
  it('extrae IconLocation del .lnk generado (round-trip)', () => {
    const bytes = buildShortcutBytes(BASE_ARGS);
    expect(parseIconLocation(bytes)).toBe(BASE_ARGS.icon);
  });

  it('devuelve undefined si no hay HasIconLocation', () => {
    const bytes = buildShortcutBytes({ ...BASE_ARGS, icon: 'C:\\x.ico,0' });
    bytes.writeUInt32LE(bytes.readUInt32LE(0x14) & ~0x40, 0x14);
    expect(parseIconLocation(bytes)).toBeUndefined();
  });
});

describe('patchIconLocation', () => {
  it('reemplaza IconLocation existente', () => {
    const bytes = buildShortcutBytes(BASE_ARGS);
    const patched = patchIconLocation(bytes, 'C:\\stable\\ai-assistant.ico,1');
    expect(parseIconLocation(patched)).toBe('C:\\stable\\ai-assistant.ico,1');
    expect(parseAppUserModelId(patched)).toBe(BASE_ARGS.aumid);
  });
});
