import { PassThrough } from 'node:stream';
import * as zlib from 'node:zlib';
import type { IStreamTee } from './ports/stream-tee.port.js';

/**
 * Servicio para bifurcar y opcionalmente descomprimir un stream upstream.
 * Produce dos streams independientes: uno para el cliente y otro para auditoría.
 */
export class StreamTeeService implements IStreamTee {
  /**
   * Bifurca el stream fuente en dos ramas (cliente y auditoría).
   * Si `isGzip` es true, descomprime el stream antes de bifurcarlo.
   */
  public teeAndDecompress(
    sourceStream: NodeJS.ReadableStream,
    isGzip: boolean,
  ): {
    clientStream: NodeJS.ReadableStream;
    auditStream: NodeJS.ReadableStream;
  } {
    const auditStream = new PassThrough();
    const clientStream = new PassThrough();

    if (isGzip) {
      const gunzip = zlib.createGunzip();
      sourceStream.pipe(gunzip);
      gunzip.pipe(auditStream);
      gunzip.pipe(clientStream);
    } else {
      sourceStream.pipe(auditStream);
      sourceStream.pipe(clientStream);
    }

    return { clientStream, auditStream };
  }
}
