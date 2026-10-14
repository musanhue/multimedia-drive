import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHttpRange } from '../../../server/proxy/rangeParser';

const MAX_CHUNK = 8 * 1024 * 1024; // 8MB

test('Range: Rango cerrado dentro del límite respeta exactamente start y end', () => {
  const total = 50 * 1024 * 1024; // 50MB
  const res = parseHttpRange('bytes=0-1023', total);
  assert.equal(res.status, 206);
  if (res.status === 206) {
    assert.equal(res.range.start, 0);
    assert.equal(res.range.end, 1023);
    assert.equal(res.range.chunkSize, 1024);
    assert.equal(res.range.contentRange, `bytes 0-1023/${total}`);
  }
});

test('Range: Petición abierta bytes=0- acotada estrictamente a 8MB', () => {
  const total = 100 * 1024 * 1024; // 100MB
  const res = parseHttpRange('bytes=0-', total);
  assert.equal(res.status, 206);
  if (res.status === 206) {
    assert.equal(res.range.start, 0);
    assert.equal(res.range.end, MAX_CHUNK - 1);
    assert.equal(res.range.chunkSize, MAX_CHUNK);
    assert.equal(res.range.contentRange, `bytes 0-${MAX_CHUNK - 1}/${total}`);
  }
});

test('Range: Rango cerrado que excede 8MB se trunca a 8MB', () => {
  const total = 100 * 1024 * 1024;
  const res = parseHttpRange('bytes=0-20000000', total); // Pide ~20MB
  assert.equal(res.status, 206);
  if (res.status === 206) {
    assert.equal(res.range.start, 0);
    assert.equal(res.range.end, MAX_CHUNK - 1);
    assert.equal(res.range.chunkSize, MAX_CHUNK);
  }
});

test('Range: Salto intermedio (seeking) bytes=10485760- acotado a 8MB', () => {
  const total = 50 * 1024 * 1024;
  const seekOffset = 10485760; // 10MB
  const res = parseHttpRange(`bytes=${seekOffset}-`, total);
  assert.equal(res.status, 206);
  if (res.status === 206) {
    assert.equal(res.range.start, seekOffset);
    assert.equal(res.range.end, seekOffset + MAX_CHUNK - 1);
    assert.equal(res.range.chunkSize, MAX_CHUNK);
  }
});

test('Range: Petición cerca del final del archivo entrega hasta EOF', () => {
  const total = 10 * 1024 * 1024; // 10MB
  const start = 9 * 1024 * 1024; // 9MB (queda 1MB)
  const res = parseHttpRange(`bytes=${start}-`, total);
  assert.equal(res.status, 206);
  if (res.status === 206) {
    assert.equal(res.range.start, start);
    assert.equal(res.range.end, total - 1);
    assert.equal(res.range.chunkSize, 1024 * 1024);
    assert.equal(res.range.contentRange, `bytes ${start}-${total - 1}/${total}`);
  }
});

test('Range: Suffix range bytes=-1048576 entrega el último 1MB', () => {
  const total = 50 * 1024 * 1024;
  const suffix = 1048576; // 1MB
  const res = parseHttpRange(`bytes=-${suffix}`, total);
  assert.equal(res.status, 206);
  if (res.status === 206) {
    assert.equal(res.range.start, total - suffix);
    assert.equal(res.range.end, total - 1);
    assert.equal(res.range.chunkSize, suffix);
  }
});

test('Range: Ausencia de cabecera Range entrega implícitamente los primeros 8MB', () => {
  const total = 50 * 1024 * 1024;
  const res = parseHttpRange(undefined, total);
  assert.equal(res.status, 206);
  if (res.status === 206) {
    assert.equal(res.range.start, 0);
    assert.equal(res.range.end, MAX_CHUNK - 1);
    assert.equal(res.range.chunkSize, MAX_CHUNK);
  }
});

test('Range: Petición con múltiples rangos selecciona el primer especificador', () => {
  const total = 50 * 1024 * 1024;
  const res = parseHttpRange('bytes=0-100, 200-300', total);
  assert.equal(res.status, 206);
  if (res.status === 206) {
    assert.equal(res.range.start, 0);
    assert.equal(res.range.end, 100);
    assert.equal(res.range.chunkSize, 101);
  }
});

test('Range: Rechazo con HTTP 416 para rangos inválidos', () => {
  const total = 10 * 1024 * 1024; // 10MB

  // Start >= totalSize
  assert.equal(parseHttpRange(`bytes=${total}-`, total).status, 416);
  assert.equal(parseHttpRange(`bytes=${total + 1000}-`, total).status, 416);

  // Start > End
  assert.equal(parseHttpRange('bytes=500-200', total).status, 416);

  // Suffix <= 0 o NaN
  assert.equal(parseHttpRange('bytes=-0', total).status, 416);
  assert.equal(parseHttpRange('bytes=-abc', total).status, 416);

  // Formato inválido
  assert.equal(parseHttpRange('characters=0-10', total).status, 416);
  assert.equal(parseHttpRange('bytes=abc-def', total).status, 416);
  assert.equal(parseHttpRange('bytes=-', total).status, 416);

  // Archivo de tamaño 0
  assert.equal(parseHttpRange('bytes=0-', 0).status, 416);
});
