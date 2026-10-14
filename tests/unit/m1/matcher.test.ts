import test from 'node:test';
import assert from 'node:assert/strict';
import { matchSubtitlesForVideo } from '../../../server/subtitles/matcher';

test('Matcher: Coincidencia exacta de nombre de archivo base', () => {
  const video = 'Avatar.2009.1080p.mkv';
  const candidates = [
    { id: 'sub_1', name: 'Avatar.2009.1080p.srt' },
    { id: 'sub_2', name: 'Titanic.1997.srt' },
  ];

  const matches = matchSubtitlesForVideo(video, candidates);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, 'sub_1');
  assert.equal(matches[0].isDefault, true);
  assert.equal(matches[0].lang, 'es');
  assert.equal(matches[0].format, 'srt');
  assert.equal(matches[0].vttUrl, '/api/subtitles/sub_1');
});

test('Matcher: Reconocimiento de sufijos de idioma múltiple y forzados', () => {
  const video = 'Matrix.1999.mkv';
  const candidates = [
    { id: 'sub_forced', name: 'Matrix.1999.es.forced.srt' },
    { id: 'sub_spa', name: 'Matrix.1999.spa.srt' },
    { id: 'sub_eng', name: 'Matrix.1999.en.srt' },
  ];

  const matches = matchSubtitlesForVideo(video, candidates);
  assert.equal(matches.length, 3);

  const forced = matches.find((m) => m.id === 'sub_forced');
  assert.ok(forced);
  assert.equal(forced.isForced, true);
  assert.equal(forced.label, 'Español (Forzados)');

  const spanish = matches.find((m) => m.id === 'sub_spa');
  assert.ok(spanish);
  assert.equal(spanish.lang, 'es');
  assert.equal(spanish.isDefault, true, 'El subtítulo completo en español debe ser el predeterminado');

  const english = matches.find((m) => m.id === 'sub_eng');
  assert.ok(english);
  assert.equal(english.lang, 'en');
});

test('Matcher: Subtítulo único en carpeta dedicada asocia por defecto', () => {
  const video = 'Gladiator.mkv';
  const candidates = [{ id: 'sub_solo', name: 'spanish.srt' }];

  const matches = matchSubtitlesForVideo(video, candidates);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, 'sub_solo');
  assert.equal(matches[0].isDefault, true);
  assert.equal(matches[0].lang, 'es');
});

test('Matcher: No empareja subtítulos de otras películas', () => {
  const video = 'Interstellar.2014.mkv';
  const candidates = [
    { id: 'sub_other', name: 'Inception.2010.es.srt' },
    { id: 'sub_other2', name: 'Batman.2008.srt' },
  ];

  const matches = matchSubtitlesForVideo(video, candidates);
  assert.equal(matches.length, 0);
});

test('Matcher: Rechaza colisiones de secuelas (Matrix.mkv vs Matrix.Reloaded.2003.srt)', () => {
  const video = 'Matrix.mkv';
  const candidates = [
    { id: 'sub_reloaded', name: 'Matrix.Reloaded.2003.srt' },
    { id: 'sub_revolutions', name: 'Matrix.Revolutions.2003.srt' },
    { id: 'sub_matrix2', name: 'Matrix2.srt' },
  ];

  const matches = matchSubtitlesForVideo(video, candidates);
  assert.equal(matches.length, 0, 'No debe emparejar secuelas como subtítulos de la película original');
});

test('Matcher: Garantiza exactamente un subtítulo predeterminado con preferencia WebVTT', () => {
  const video = 'Movie.mkv';
  const candidates = [
    { id: 'sub_srt', name: 'Movie.srt' },
    { id: 'sub_vtt', name: 'Movie.vtt' },
  ];

  const matches = matchSubtitlesForVideo(video, candidates);
  assert.equal(matches.length, 2);
  const defaults = matches.filter((m) => m.isDefault);
  assert.equal(defaults.length, 1, 'Debe haber exactamente un subtítulo predeterminado');
  assert.equal(defaults[0].id, 'sub_vtt', 'El formato WebVTT debe tener precedencia para el predeterminado');
});

test('Matcher: Rechaza subtítulo solitario en Rule 3 si los títulos son contradictorios', () => {
  const video = 'Superman.2006.mkv';
  const candidates = [{ id: 'sub_batman', name: 'Batman.2005.es.srt' }];

  const matches = matchSubtitlesForVideo(video, candidates);
  assert.equal(matches.length, 0, 'No debe asociar un subtítulo con título de película diferente');
});

test('Matcher: Rechaza subtítulo solitario de secuela (Matrix.mkv vs Matrix.Reloaded.2003.srt)', () => {
  const video = 'Matrix.mkv';
  const candidates = [{ id: 'sub_reloaded_solo', name: 'Matrix.Reloaded.2003.srt' }];

  const matches = matchSubtitlesForVideo(video, candidates);
  assert.equal(matches.length, 0, 'No debe emparejar un subtítulo de secuela solitario con la película base');
});

test('Matcher: Rechaza subtítulo solitario por colisión de stopwords (The.Movie.mkv vs The.Dark.Knight.srt)', () => {
  const video = 'The.Movie.mkv';
  const candidates = [{ id: 'sub_batman', name: 'The.Dark.Knight.srt' }];

  const matches = matchSubtitlesForVideo(video, candidates);
  assert.equal(matches.length, 0, 'No debe asociar subtítulos de películas no relacionadas por coincidencia de "The"');
});

test('Matcher: Acepta subtítulo genérico en español latino (Gladiator.mkv vs es-la.srt)', () => {
  const video = 'Gladiator.mkv';
  const candidates = [{ id: 'sub_es_la', name: 'es-la.srt' }];

  const matches = matchSubtitlesForVideo(video, candidates);
  assert.equal(matches.length, 1, 'Debe aceptar subtítulo genérico es-la.srt para Gladiator');
  assert.equal(matches[0].id, 'sub_es_la');
  assert.equal(matches[0].isDefault, true);
  assert.ok(matches[0].lang.startsWith('es'));
});

