import test from 'node:test';
import assert from 'node:assert/strict';
import { convertSrtToVtt, decodeSubtitleBuffer } from '../../../server/subtitles/converter';

test('Converter: Transcodificación de marcas de tiempo de comas a puntos', () => {
  const srt = Buffer.from(
    '1\n00:01:23,456 --> 00:01:26,789\nTexto de prueba en subtítulo\n',
    'utf8'
  );
  const vtt = convertSrtToVtt(srt);
  assert.ok(vtt.startsWith('WEBVTT\n\n'), 'Debe comenzar estrictamente con WEBVTT\\n\\n');
  assert.ok(vtt.includes('00:01:23.456 --> 00:01:26.789'), 'Debe convertir la coma a punto');
  assert.ok(!vtt.includes('00:01:23,456'), 'No debe contener marcas de tiempo con coma');
});

test('Converter: Soporte de marcas de tiempo sin horas explícitas (05:20,500)', () => {
  const srt = Buffer.from('1\n05:20,500 --> 05:22,800\nTítulo inicial de la película\n', 'utf8');
  const vtt = convertSrtToVtt(srt);
  assert.ok(vtt.includes('00:05:20.500 --> 00:05:22.800'), 'Debe rellenar 00: para las horas');
});

test('Converter: Limpieza de etiquetas SSA/ASS ({\\an8}) y fuentes HTML (<font>)', () => {
  const srt = Buffer.from(
    '1\n00:00:01,000 --> 00:00:02,000\n{\\an8}<font color="#ff0000">Texto en rojo</font>\n',
    'utf8'
  );
  const vtt = convertSrtToVtt(srt);
  assert.ok(vtt.includes('Texto en rojo'), 'El texto principal debe conservarse');
  assert.ok(!vtt.includes('{\\an8}'), 'La etiqueta de posicionamiento SSA debe suprimirse');
  assert.ok(!vtt.includes('<font color="#ff0000">'), 'La etiqueta <font> debe suprimirse');
  assert.ok(!vtt.includes('</font>'), 'La etiqueta de cierre </font> debe suprimirse');
});

test('Converter: Normalización de codificación Latin-1 / Windows-1252 con diacríticos en español', () => {
  // Buffer codificado con Latin-1 conteniendo caracteres en español
  const latin1 = Buffer.from(
    '1\r\n00:00:01,000 --> 00:00:03,000\r\n¡Canción de cuna del niño, señor! ¿Cómo estás? diacríticos: á, é, í, ó, ú, ñ, ¿, ¡\r\n',
    'latin1'
  );
  const vtt = convertSrtToVtt(latin1);
  assert.ok(vtt.includes('¡Canción de cuna del niño, señor! ¿Cómo estás?'));
  assert.ok(vtt.includes('diacríticos: á, é, í, ó, ú, ñ, ¿, ¡'));
  assert.ok(!vtt.includes('\uFFFD'), 'No debe contener caracteres corruptos de reemplazo Unicode');
});

test('Converter: Eliminación de BOM UTF-8 y UTF-16', () => {
  const withUtf8Bom = Buffer.concat([
    Buffer.from([0xef, 0xbb, 0xbf]),
    Buffer.from('1\n00:00:01,000 --> 00:00:02,000\nTexto con BOM\n', 'utf8'),
  ]);
  const vtt8 = convertSrtToVtt(withUtf8Bom);
  assert.ok(vtt8.startsWith('WEBVTT\n\n'));
  assert.ok(!vtt8.includes('\uFEFF'));

  const withUtf16Le = Buffer.concat([
    Buffer.from([0xff, 0xfe]),
    Buffer.from('1\n00:00:01,000 --> 00:00:02,000\nTexto con UTF-16LE\n', 'utf16le'),
  ]);
  const decoded16 = decodeSubtitleBuffer(withUtf16Le);
  assert.ok(decoded16.includes('Texto con UTF-16LE'));
});

test('Converter: Preservación de entrada que ya es WebVTT válido', () => {
  const existingVtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nSubtítulo original en VTT\n';
  const result = convertSrtToVtt(existingVtt);
  assert.ok(result.startsWith('WEBVTT\n\n'));
  assert.ok(result.includes('00:00:01.000 --> 00:00:04.000'));
});
