/**
 * Port que define el contrato para bifurcación y descompresión de streams.
 * Consumido por el ProxyController de Capa 5.
 */
export interface IStreamTee {
  teeAndDecompress(
    sourceStream: NodeJS.ReadableStream,
    isGzip: boolean,
  ): {
    clientStream: NodeJS.ReadableStream;
    auditStream: NodeJS.ReadableStream;
  };
}
