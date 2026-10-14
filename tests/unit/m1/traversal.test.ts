import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeString,
  matchCategory,
  normalizeCategoryParam,
  transformThumbnailLink,
  inferMimeType,
  parseSeriesEpisodeInfo,
  DriveTraversalEngine,
} from '../../../server/drive/traversal';

test('Traversal: Normalización Unicode NFD y remoción de diacríticos', () => {
  assert.equal(normalizeString('Películas'), 'peliculas');
  assert.equal(normalizeString('PELÍCULAS'), 'peliculas');
  assert.equal(normalizeString('Música'), 'musica');
  assert.equal(normalizeString('   Fotografías  '), 'fotografias');
  assert.equal(normalizeString('Videos familiares'), 'videos familiares');
});

test('Traversal: Mapeo de categorías canónicas y alias comunes', () => {
  assert.equal(matchCategory('Películas'), 'peliculas');
  assert.equal(matchCategory('Peliculas'), 'peliculas');
  assert.equal(matchCategory('Cine'), 'peliculas');
  assert.equal(matchCategory('Movies'), 'peliculas');

  assert.equal(matchCategory('Series'), 'series');
  assert.equal(matchCategory('TV Shows'), 'series');
  assert.equal(matchCategory('Series TV'), 'series');
  assert.equal(matchCategory('TV'), 'series');

  assert.equal(matchCategory('Videos familiares'), 'familiares');
  assert.equal(matchCategory('Videos Familiares'), 'familiares');
  assert.equal(matchCategory('Familia'), 'familiares');
  assert.equal(matchCategory('Home Videos'), 'familiares');

  assert.equal(matchCategory('Fotos'), 'fotos');
  assert.equal(matchCategory('Fotografías'), 'fotos');
  assert.equal(matchCategory('Photos'), 'fotos');
  assert.equal(matchCategory('Imágenes'), 'fotos');

  assert.equal(matchCategory('Música'), 'musica');
  assert.equal(matchCategory('Musica'), 'musica');
  assert.equal(matchCategory('Music'), 'musica');
  assert.equal(matchCategory('Audio'), 'musica');

  assert.equal(matchCategory('Películas/'), 'peliculas');
  assert.equal(matchCategory('Series/'), 'series');
  assert.equal(matchCategory('Música/'), 'musica');
  assert.equal(matchCategory('Fotos/'), 'fotos');
  assert.equal(matchCategory('Videos familiares/'), 'familiares');
  assert.equal(matchCategory('Películas//'), 'peliculas');

  assert.equal(matchCategory('Documentos Inusuales'), null);
});

test('Traversal: Normalización del parámetro de categoría de ruta', () => {
  assert.equal(normalizeCategoryParam('Películas'), 'peliculas');
  assert.equal(normalizeCategoryParam('peliculas'), 'peliculas');
  assert.equal(normalizeCategoryParam('Películas/'), 'peliculas');
  assert.equal(normalizeCategoryParam('peliculas/'), 'peliculas');
  assert.equal(normalizeCategoryParam('series/'), 'series');
  assert.equal(normalizeCategoryParam('musica/'), 'musica');
  assert.equal(normalizeCategoryParam('fotos/'), 'fotos');
  assert.equal(normalizeCategoryParam('familiares/'), 'familiares');
  assert.equal(normalizeCategoryParam('Películas//'), 'peliculas');
  assert.equal(normalizeCategoryParam('Música'), 'musica');
  assert.equal(normalizeCategoryParam('familiares'), 'familiares');
  assert.equal(normalizeCategoryParam('videos familiares'), 'familiares');
  assert.equal(normalizeCategoryParam('categoria_inexistente'), null);
});

test('Traversal: Reescalado de miniaturas HD a w800', () => {
  const thumbS220 = 'https://lh3.googleusercontent.com/drive-viewer/XYZ=s220';
  assert.equal(transformThumbnailLink(thumbS220), 'https://lh3.googleusercontent.com/drive-viewer/XYZ=w800');

  const thumbS400 = 'https://lh3.googleusercontent.com/drive-viewer/XYZ=s400-c';
  assert.equal(transformThumbnailLink(thumbS400), 'https://lh3.googleusercontent.com/drive-viewer/XYZ=w800');

  const thumbNoParam = 'https://lh3.googleusercontent.com/drive-viewer/XYZ';
  assert.equal(transformThumbnailLink(thumbNoParam), 'https://lh3.googleusercontent.com/drive-viewer/XYZ=w800');

  assert.equal(transformThumbnailLink(null), undefined);
});

test('Traversal: Inferencia de tipos MIME por extensión de archivo', () => {
  assert.equal(inferMimeType('movie.mkv', 'application/octet-stream'), 'video/x-matroska');
  assert.equal(inferMimeType('movie.mp4'), 'video/mp4');
  assert.equal(inferMimeType('song.mp3'), 'audio/mpeg');
  assert.equal(inferMimeType('photo.jpg'), 'image/jpeg');
  assert.equal(inferMimeType('subs.srt'), 'text/plain');
  assert.equal(inferMimeType('subs.vtt'), 'text/vtt');
  // Preserva MIME específico si no es octet-stream
  assert.equal(inferMimeType('file.bin', 'application/pdf'), 'application/pdf');
});

test('Traversal: Extracción de temporada y episodio en series', () => {
  assert.deepEqual(parseSeriesEpisodeInfo('Breaking.Bad.S01E05.mkv'), { season: 1, episode: 5 });
  assert.deepEqual(parseSeriesEpisodeInfo('Lost.2x14.mp4'), { season: 2, episode: 14 });
  assert.deepEqual(parseSeriesEpisodeInfo('The.Crown.Season.3.Episode.08.mkv'), { season: 3, episode: 8 });
  assert.deepEqual(parseSeriesEpisodeInfo('Inception.2010.mkv'), {});
});

test('Traversal: Mapeo de esquema de Drive a DriveMediaItem', () => {
  const engine = new DriveTraversalEngine();
  const rawFile = {
    id: 'f_test_01',
    name: 'Gladiator.2000.1080p.mkv',
    mimeType: 'video/x-matroska',
    size: '4294967296',
    modifiedTime: '2026-01-01T12:00:00.000Z',
    thumbnailLink: 'https://lh3.googleusercontent.com/thumb=s220',
    videoMediaMetadata: {
      width: 1920,
      height: 1080,
      durationMillis: '9300000',
    },
  };

  const item = engine.mapToDriveMediaItem(rawFile, 'peliculas', 'parent_folder_id');
  assert.equal(item.id, 'f_test_01');
  assert.equal(item.name, 'Gladiator.2000.1080p.mkv');
  assert.equal(item.mimeType, 'video/x-matroska');
  assert.equal(item.size, 4294967296);
  assert.equal(item.durationMillis, 9300000);
  assert.equal(item.width, 1920);
  assert.equal(item.height, 1080);
  assert.equal(item.thumbnailUrl, 'https://lh3.googleusercontent.com/thumb=w800');
  assert.equal(item.tmdbEnriched, true);

  // Aislamiento familiar
  const familyItem = engine.mapToDriveMediaItem(rawFile, 'familiares', 'parent_folder_id');
  assert.equal(familyItem.tmdbEnriched, false, 'Family items must have tmdbEnriched = false');
});
