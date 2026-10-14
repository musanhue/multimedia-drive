import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeMediaFilename,
  stripFileExtension,
  detectTvEpisode,
  extractReleaseYear,
  stripNoiseTags,
  cleanDelimitersAndHyphens,
} from '../../../server/metadata/sanitizer';

test('Sanitizer Unit: Stage 1 - Extension Stripping', () => {
  assert.equal(stripFileExtension('Inception.mkv'), 'Inception');
  assert.equal(stripFileExtension('Movie.2020.mp4'), 'Movie.2020');
  assert.equal(stripFileExtension('Audio.Track.flac'), 'Audio.Track');
  assert.equal(stripFileExtension('Subtitles.es.srt'), 'Subtitles.es');
  // Does not strip 4-digit years like .2049
  assert.equal(stripFileExtension('Blade.Runner.2049'), 'Blade.Runner.2049');
});

test('Sanitizer Unit: Stage 2 - TV Episode Detection', () => {
  const t1 = detectTvEpisode('Stranger.Things.S04E09.1080p');
  assert.equal(t1.isSeries, true);
  assert.equal(t1.season, 4);
  assert.equal(t1.episode, 9);
  assert.equal(t1.titleBase, 'Stranger.Things');

  const t2 = detectTvEpisode('La.Casa.de.Papel.4x08.1080p');
  assert.equal(t2.isSeries, true);
  assert.equal(t2.season, 4);
  assert.equal(t2.episode, 8);
  assert.equal(t2.titleBase, 'La.Casa.de.Papel');

  const t3 = detectTvEpisode('Game.of.Thrones.Season.1.Episode.05');
  assert.equal(t3.isSeries, true);
  assert.equal(t3.season, 1);
  assert.equal(t3.episode, 5);

  const t4 = detectTvEpisode('Los.Simpsons.Temporada.12.Episodio.03');
  assert.equal(t4.isSeries, true);
  assert.equal(t4.season, 12);
  assert.equal(t4.episode, 3);

  const t5 = detectTvEpisode('Dark.T02E04.1080p');
  assert.equal(t5.isSeries, true);
  assert.equal(t5.season, 2);
  assert.equal(t5.episode, 4);

  // Resolution dimensions (1920x1080) should not trigger TV match
  const t6 = detectTvEpisode('Movie.Name.1920x1080');
  assert.equal(t6.isSeries, false);
});

test('Sanitizer Unit: Stage 3 - Release Year Extraction & Lookahead', () => {
  // Disambiguation: Title contains 2049, release year is 2017
  const y1 = extractReleaseYear('Blade.Runner.2049.2017');
  assert.equal(y1.year, 2017);
  assert.equal(y1.titleBase, 'Blade.Runner.2049');

  // Title begins with 2001, release year is 1968
  const y2 = extractReleaseYear('2001.A.Space.Odyssey.1968');
  assert.equal(y2.year, 1968);
  assert.equal(y2.titleBase, '2001.A.Space.Odyssey');

  // Historical year
  const y3 = extractReleaseYear('The.Kid.1921');
  assert.equal(y3.year, 1921);
  assert.equal(y3.titleBase, 'The.Kid');

  // Title without separate year starting with 2001
  const y4 = extractReleaseYear('2001.A.Space.Odyssey');
  assert.equal(y4.year, null);
  assert.equal(y4.titleBase, '2001.A.Space.Odyssey');
});

test('Sanitizer Unit: Stage 4 - Noise Tag Stripping', () => {
  const noise = '1080p.BluRay.x264.DTS-HD.MA.5.1.Latino.Remastered';
  const stripped = stripNoiseTags(noise).trim();
  assert.equal(stripped, '');
});

test('Sanitizer Unit: Stages 5-7 - Delimiters, Hyphens, Brackets & Accents', () => {
  // Preserve compound words
  assert.equal(cleanDelimitersAndHyphens('Spider-Man.No.Way.Home'), 'Spider-Man No Way Home');
  assert.equal(cleanDelimitersAndHyphens('WALL-E'), 'WALL-E');
  assert.equal(cleanDelimitersAndHyphens('X-Men.First.Class'), 'X-Men First Class');

  // Strip isolated hyphens
  assert.equal(cleanDelimitersAndHyphens('Spider-Man - Far From Home'), 'Spider-Man Far From Home');

  // Collapse repeated dots
  assert.equal(cleanDelimitersAndHyphens('Dr..No...1962'), 'Dr No 1962');

  // Preserve Spanish accents & punctuation
  assert.equal(cleanDelimitersAndHyphens('El.laberinto.del.fauno'), 'El laberinto del fauno');
  assert.equal(cleanDelimitersAndHyphens('Amélie'), 'Amélie');
  assert.equal(cleanDelimitersAndHyphens('¡Asu.Mare!'), '¡Asu Mare!');
  assert.equal(cleanDelimitersAndHyphens('¿Quién.engañó.a.Roger.Rabbit'), '¿Quién engañó a Roger Rabbit');
});

test('Sanitizer Full: Comprehensive Media Cleaning Battery', () => {
  const cases = [
    {
      input: 'Inception.2010.1080p.BluRay.x264-SPARKS.mkv',
      title: 'Inception',
      year: 2010,
      isSeries: false,
      s: null,
      e: null,
    },
    {
      input: 'El.Secreto.De.Sus.Ojos.(2009).[1080p].mp4',
      title: 'El Secreto De Sus Ojos',
      year: 2009,
      isSeries: false,
      s: null,
      e: null,
    },
    {
      input: 'Blade.Runner.2049.2017.2160p.UHD.HDR.x265.mkv',
      title: 'Blade Runner 2049',
      year: 2017,
      isSeries: false,
      s: null,
      e: null,
    },
    {
      input: 'Stranger.Things.S04E09.1080p.NF.mkv',
      title: 'Stranger Things',
      year: null,
      isSeries: true,
      s: 4,
      e: 9,
    },
    {
      input: 'Relatos.salvajes.2014.1080p.DUAL.Latino-Castellano.mkv',
      title: 'Relatos salvajes',
      year: 2014,
      isSeries: false,
      s: null,
      e: null,
    },
    {
      input: 'The.Kid.1921.1080p.mkv',
      title: 'The Kid',
      year: 1921,
      isSeries: false,
      s: null,
      e: null,
    },
    {
      input: 'Dr..No...1962..1080p.mkv',
      title: 'Dr No',
      year: 1962,
      isSeries: false,
      s: null,
      e: null,
    },
    {
      input: 'Spider-Man.No.Way.Home.2021.PROPER.1080p.WEBRip.x264-RARBG.mp4',
      title: 'Spider-Man No Way Home',
      year: 2021,
      isSeries: false,
      s: null,
      e: null,
    },
    {
      input: '1984.mkv',
      title: '1984',
      year: 1984,
      isSeries: false,
      s: null,
      e: null,
    },
    {
      input: '1917.2019.1080p.mkv',
      title: '1917',
      year: 2019,
      isSeries: false,
      s: null,
      e: null,
    },
    {
      input: 'Doctor.Who.2005.S01E01.mkv',
      title: 'Doctor Who',
      year: 2005,
      isSeries: true,
      s: 1,
      e: 1,
    },
    {
      input: 'Breaking.Bad.S01E01.Pilot.720p.HDTV.x264.mkv',
      title: 'Breaking Bad',
      year: null,
      isSeries: true,
      s: 1,
      e: 1,
    },
    {
      input: 'The.Matrix.Resurrections.2021.2160p.MA.WEB-DL.DDP5.1.Atmos.DV.HEVC-FLUX.mkv',
      title: 'The Matrix Resurrections',
      year: 2021,
      isSeries: false,
      s: null,
      e: null,
    },
    {
      input: 'El Padrino (1972) [BluRay 1080p].mkv',
      title: 'El Padrino',
      year: 1972,
      isSeries: false,
      s: null,
      e: null,
    },
  ];

  for (const tc of cases) {
    const res = sanitizeMediaFilename(tc.input);
    assert.equal(res.cleanTitle, tc.title, `Title mismatch for ${tc.input}`);
    assert.equal(res.year, tc.year, `Year mismatch for ${tc.input}`);
    assert.equal(res.isSeries, tc.isSeries, `isSeries mismatch for ${tc.input}`);
    assert.equal(res.season, tc.s, `Season mismatch for ${tc.input}`);
    assert.equal(res.episode, tc.e, `Episode mismatch for ${tc.input}`);
  }
});

test('Sanitizer Full: Boundary & Edge Resiliency', () => {
  // Pure noise
  const r1 = sanitizeMediaFilename('1080p.x264.BluRay.mkv');
  assert.equal(typeof r1.cleanTitle, 'string');
  assert.equal(r1.cleanTitle, '');

  // Null & Empty inputs
  const r2 = sanitizeMediaFilename('');
  assert.equal(r2.cleanTitle, '');
  assert.equal(r2.year, null);

  const r3 = sanitizeMediaFilename(null as unknown as string);
  assert.equal(r3.cleanTitle, '');

  const r4 = sanitizeMediaFilename(undefined as unknown as string);
  assert.equal(r4.cleanTitle, '');

  // Long string ReDoS resilience (<500ms)
  const longName = 'A'.repeat(150) + '.2020.1080p.BluRay.x264.DTS-HD.MA.5.1.Dual-Audio.Latino.Castellano.Extended.Cut.Remastered-GROUP.mkv';
  const start = Date.now();
  const r5 = sanitizeMediaFilename(longName);
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 500, `Took ${elapsed}ms, should be <500ms`);
  assert.equal(r5.year, 2020);
  assert.equal(r5.cleanTitle, 'A'.repeat(150));
});
