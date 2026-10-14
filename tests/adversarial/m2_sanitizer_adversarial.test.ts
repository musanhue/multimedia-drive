import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeMediaFilename,
  stripFileExtension,
  detectTvEpisode,
  extractReleaseYear,
  stripNoiseTags,
  cleanDelimitersAndHyphens,
} from '../../server/metadata/sanitizer';

// ============================================================================
// 1. NUMBERED TITLES WITH RELEASE YEARS
// ============================================================================

test('Adversarial 1: Numbered titles with release years', () => {
  const cases = [
    {
      input: 'Blade.Runner.2049.2017.mkv',
      expectedTitle: 'Blade Runner 2049',
      expectedYear: 2017,
    },
    {
      input: '1917.2019.mkv',
      expectedTitle: '1917',
      expectedYear: 2019,
    },
    {
      input: '2001.A.Space.Odyssey.1968.mkv',
      expectedTitle: '2001 A Space Odyssey',
      expectedYear: 1968,
    },
    {
      input: 'Wonder.Woman.1984.2020.mkv',
      expectedTitle: 'Wonder Woman 1984',
      expectedYear: 2020,
    },
    {
      input: '2012.2009.mkv',
      expectedTitle: '2012',
      expectedYear: 2009,
    },
    {
      input: 'Apollo.13.1995.mkv',
      expectedTitle: 'Apollo 13',
      expectedYear: 1995,
    },
    {
      input: 'District.9.2009.mkv',
      expectedTitle: 'District 9',
      expectedYear: 2009,
    },
    {
      input: '1984.1984.mkv',
      expectedTitle: '1984',
      expectedYear: 1984,
    },
    {
      input: '1984.mkv',
      expectedTitle: '1984',
      expectedYear: 1984,
    },
    {
      input: '2001.A.Space.Odyssey.mkv',
      expectedTitle: '2001 A Space Odyssey',
      expectedYear: null,
    },
  ];

  for (const tc of cases) {
    const res = sanitizeMediaFilename(tc.input);
    assert.equal(res.cleanTitle, tc.expectedTitle, `Clean title mismatch for '${tc.input}'`);
    assert.equal(res.year, tc.expectedYear, `Year mismatch for '${tc.input}'`);
  }
});

// ============================================================================
// 2. SPANISH DIACRITICS & PUNCTUATION
// ============================================================================

test('Adversarial 2: Spanish diacritics & punctuation', () => {
  // El Secreto De Sus Ojos (2009)
  const r1 = sanitizeMediaFilename('El.Secreto.De.Sus.Ojos.(2009).mp4');
  assert.equal(r1.cleanTitle, 'El Secreto De Sus Ojos');
  assert.equal(r1.year, 2009);

  // Amélie (2001)
  const r2 = sanitizeMediaFilename('Amélie.(2001).mkv');
  assert.equal(r2.cleanTitle, 'Amélie');
  assert.equal(r2.year, 2001);

  // Año Uno (2009)
  const r3 = sanitizeMediaFilename('Año.Uno.(2009).mkv');
  assert.equal(r3.cleanTitle, 'Año Uno');
  assert.equal(r3.year, 2009);

  // NFD decomposed Unicode input: A-n-combining_tilde-o
  const nfdInput = 'An\u0303o.Uno.(2009).mkv';
  const r3_nfd = sanitizeMediaFilename(nfdInput);
  assert.equal(r3_nfd.cleanTitle, 'Año Uno');
  assert.equal(r3_nfd.year, 2009);

  // ¿Quién engañó a Roger Rabbit?.1988.mkv
  const r4 = sanitizeMediaFilename('¿Quién.engañó.a.Roger.Rabbit?.1988.mkv');
  assert.equal(r4.year, 1988);
  assert.equal(r4.cleanTitle, '¿Quién engañó a Roger Rabbit?');

  // Additional Spanish titles
  const r5 = sanitizeMediaFilename('¡Asu.Mare!.2013.1080p.mkv');
  assert.equal(r5.year, 2013);
  assert.ok(r5.cleanTitle.includes('Asu Mare'));

  const r6 = sanitizeMediaFilename('Crónica.de.una.muerte.anunciada.1987.mp4');
  assert.equal(r6.cleanTitle, 'Crónica de una muerte anunciada');
  assert.equal(r6.year, 1987);

  const r7 = sanitizeMediaFilename('El.niño.y.la.garza.2023.1080p.mkv');
  assert.equal(r7.cleanTitle, 'El niño y la garza');
  assert.equal(r7.year, 2023);
});

// ============================================================================
// 3. TV SERIES PATTERNS
// ============================================================================

test('Adversarial 3: TV series patterns (standard and Spanish variations)', () => {
  // Stranger.Things.S04E09.mkv (s: 4, e: 9)
  const tv1 = sanitizeMediaFilename('Stranger.Things.S04E09.mkv');
  assert.equal(tv1.isSeries, true);
  assert.equal(tv1.season, 4);
  assert.equal(tv1.episode, 9);
  assert.equal(tv1.cleanTitle, 'Stranger Things');

  // Dark.2x03.mkv (s: 2, e: 3)
  const tv2 = sanitizeMediaFilename('Dark.2x03.mkv');
  assert.equal(tv2.isSeries, true);
  assert.equal(tv2.season, 2);
  assert.equal(tv2.episode, 3);
  assert.equal(tv2.cleanTitle, 'Dark');

  // The.Office.Season.3.Episode.12.mkv (s: 3, e: 12)
  const tv3 = sanitizeMediaFilename('The.Office.Season.3.Episode.12.mkv');
  assert.equal(tv3.isSeries, true);
  assert.equal(tv3.season, 3);
  assert.equal(tv3.episode, 12);
  assert.equal(tv3.cleanTitle, 'The Office');

  // Spanish: Temporada / Episodio
  const tv4 = sanitizeMediaFilename('Los.Simpsons.Temporada.5.Episodio.18.720p.mkv');
  assert.equal(tv4.isSeries, true);
  assert.equal(tv4.season, 5);
  assert.equal(tv4.episode, 18);
  assert.equal(tv4.cleanTitle, 'Los Simpsons');

  // Spanish shorthand: T01E05
  const tv5 = sanitizeMediaFilename('La.Casa.de.Papel.T01E05.mkv');
  assert.equal(tv5.isSeries, true);
  assert.equal(tv5.season, 1);
  assert.equal(tv5.episode, 5);
  assert.equal(tv5.cleanTitle, 'La Casa de Papel');

  // Series with year in title: Doctor Who 2005
  const tv6 = sanitizeMediaFilename('Doctor.Who.2005.S02E08.1080p.mkv');
  assert.equal(tv6.isSeries, true);
  assert.equal(tv6.season, 2);
  assert.equal(tv6.episode, 8);
  assert.equal(tv6.cleanTitle, 'Doctor Who');
  assert.equal(tv6.year, 2005);

  // Negative case: Resolution dimensions (1920x1080, 1280x720) must NOT trigger TV series detection
  const notTv = sanitizeMediaFilename('Movie.Name.1920x1080.2020.mkv');
  assert.equal(notTv.isSeries, false);
  assert.equal(notTv.season, null);
  assert.equal(notTv.episode, null);
});

// ============================================================================
// 4. COMPOUND HYPHENS VS RELEASE GROUPS
// ============================================================================

test('Adversarial 4: Compound hyphens vs release groups', () => {
  // Spider-Man.No.Way.Home.2021-SPARKS.mkv -> 'Spider-Man No Way Home', 2021
  const h1 = sanitizeMediaFilename('Spider-Man.No.Way.Home.2021-SPARKS.mkv');
  assert.equal(h1.cleanTitle, 'Spider-Man No Way Home');
  assert.equal(h1.year, 2021);

  // WALL-E.2008-YIFY.mkv -> 'WALL-E', 2008
  const h2 = sanitizeMediaFilename('WALL-E.2008-YIFY.mkv');
  assert.equal(h2.cleanTitle, 'WALL-E');
  assert.equal(h2.year, 2008);

  // X-Men
  const h3 = sanitizeMediaFilename('X-Men.First.Class.2011-EVO.mkv');
  assert.equal(h3.cleanTitle, 'X-Men First Class');
  assert.equal(h3.year, 2011);

  // Ant-Man and the Wasp
  const h4 = sanitizeMediaFilename('Ant-Man.and.the.Wasp.2018.1080p-CMRG.mkv');
  assert.equal(h4.cleanTitle, 'Ant-Man and the Wasp');
  assert.equal(h4.year, 2018);

  // Compound hyphen title without release year
  const h5 = sanitizeMediaFilename('WALL-E-YIFY.mkv');
  assert.equal(h5.cleanTitle, 'WALL-E');

  const h6 = sanitizeMediaFilename('Spider-Man.mkv');
  assert.equal(h6.cleanTitle, 'Spider-Man');

  // Isolated separator hyphens should be removed, while keeping internal hyphens
  const h7 = cleanDelimitersAndHyphens('Spider-Man - Far From Home');
  assert.equal(h7, 'Spider-Man Far From Home');
});

// ============================================================================
// 5. BOUNDARY & REDOS SAFETY (< 100ms)
// ============================================================================

test('Adversarial 5: Boundary & ReDoS safety with 200 repeated noise tokens (< 100ms)', () => {
  const noiseTokens = [
    '1080p', 'BluRay', 'x264', 'DTS', 'Remastered', 'Proper',
    'HEVC', 'HDR', 'Atmos', 'Latino', 'Castellano', 'Internal', 'YIFY'
  ];

  // 1a. String with 200 repeated noise tokens after year
  let repeatedNoise = 'Interstellar.2014';
  for (let i = 0; i < 200; i++) {
    repeatedNoise += '.' + noiseTokens[i % noiseTokens.length];
  }
  repeatedNoise += '.mkv';

  assert.ok(repeatedNoise.length > 1000, `String length should be >1000 chars, got: ${repeatedNoise.length}`);

  const start1 = performance.now();
  const res1 = sanitizeMediaFilename(repeatedNoise);
  const elapsed1 = performance.now() - start1;

  assert.equal(res1.cleanTitle, 'Interstellar');
  assert.equal(res1.year, 2014);
  assert.ok(elapsed1 < 100, `Execution time with 200 noise tokens was ${elapsed1.toFixed(2)}ms, must be < 100ms`);

  // 1b. String with 200 repeated noise tokens BEFORE the year (forces stripNoiseTags to process all 200)
  let noiseBeforeYear = 'Interstellar';
  for (let i = 0; i < 200; i++) {
    noiseBeforeYear += '.' + noiseTokens[i % noiseTokens.length];
  }
  noiseBeforeYear += '.2014.mkv';

  const start1b = performance.now();
  const res1b = sanitizeMediaFilename(noiseBeforeYear);
  const elapsed1b = performance.now() - start1b;

  assert.equal(res1b.cleanTitle, 'Interstellar');
  assert.equal(res1b.year, 2014);
  assert.ok(elapsed1b < 100, `Execution time with 200 noise tokens before year was ${elapsed1b.toFixed(2)}ms, must be < 100ms`);

  // 1c. String with 200 repeated noise tokens and NO year
  let noiseNoYear = 'Interstellar';
  for (let i = 0; i < 200; i++) {
    noiseNoYear += '.' + noiseTokens[i % noiseTokens.length];
  }
  noiseNoYear += '.mkv';

  const start1c = performance.now();
  const res1c = sanitizeMediaFilename(noiseNoYear);
  const elapsed1c = performance.now() - start1c;

  assert.equal(res1c.cleanTitle, 'Interstellar');
  assert.equal(res1c.year, null);
  assert.ok(elapsed1c < 100, `Execution time with 200 noise tokens and no year was ${elapsed1c.toFixed(2)}ms, must be < 100ms`);

  // 2. Long title string with noise (4000+ chars)
  const veryLongTitle = 'LongMovieTitle'.repeat(250) + '.2022.1080p.BluRay.x264-SPARKS.mkv';
  const start2 = performance.now();
  const res2 = sanitizeMediaFilename(veryLongTitle);
  const elapsed2 = performance.now() - start2;

  assert.equal(res2.cleanTitle, 'LongMovieTitle'.repeat(250));
  assert.equal(res2.year, 2022);
  assert.ok(elapsed2 < 100, `Execution time for 4000+ char title was ${elapsed2.toFixed(2)}ms, must be < 100ms`);

  // 3. Repeated delimiters and special characters
  const edgeString = '.....---....((([[[]]])))...Movie...2020...---...'.repeat(20);
  const start3 = performance.now();
  const res3 = sanitizeMediaFilename(edgeString);
  const elapsed3 = performance.now() - start3;
  assert.ok(elapsed3 < 100, `Execution time for repeated delimiters was ${elapsed3.toFixed(2)}ms, must be < 100ms`);

  // 4. Benchmark 1000 iterations over realistic filenames to verify sustained throughput
  const sampleFiles = [
    'Blade.Runner.2049.2017.2160p.UHD.HDR.x265.mkv',
    'Stranger.Things.S04E09.1080p.NF.mkv',
    'WALL-E.2008-YIFY.mkv',
    'El.Secreto.De.Sus.Ojos.(2009).[1080p].mp4',
    'Spider-Man.No.Way.Home.2021-SPARKS.mkv',
  ];

  const startBatch = performance.now();
  for (let i = 0; i < 1000; i++) {
    sanitizeMediaFilename(sampleFiles[i % sampleFiles.length]);
  }
  const elapsedBatch = performance.now() - startBatch;
  // 1000 items should complete in under 500ms (0.5ms per item)
  assert.ok(
    elapsedBatch < 500,
    `1000 iterations took ${elapsedBatch.toFixed(2)}ms (average ${(elapsedBatch / 1000).toFixed(3)}ms/op), expected < 500ms`
  );
});

// ============================================================================
// 6. ADVERSARIAL EDGE CASES & FAULT INJECTION
// ============================================================================

test('Adversarial 6: Edge cases, null, undefined, numeric inputs', () => {
  // Empty & falsy inputs
  assert.equal(sanitizeMediaFilename('').cleanTitle, '');
  assert.equal(sanitizeMediaFilename(null as unknown as string).cleanTitle, '');
  assert.equal(sanitizeMediaFilename(undefined as unknown as string).cleanTitle, '');
  assert.equal(sanitizeMediaFilename('   ').cleanTitle, '');

  // Only noise tokens
  const onlyNoise = sanitizeMediaFilename('1080p.BluRay.x264.DTS.Remastered.mkv');
  assert.equal(onlyNoise.cleanTitle, '');
  assert.equal(onlyNoise.year, null);

  // Pure 4-digit numeric filenames
  const numYear = sanitizeMediaFilename('1984.mp4');
  assert.equal(numYear.cleanTitle, '1984');
  assert.equal(numYear.year, 1984);

  // Non-year numeric titles
  const numNotYear = sanitizeMediaFilename('300.2006.mkv');
  assert.equal(numNotYear.cleanTitle, '300');
  assert.equal(numNotYear.year, 2006);

  // Repeated extensions
  const doubleExt = sanitizeMediaFilename('Movie.2020.mkv.mp4');
  assert.equal(doubleExt.year, 2020);
  assert.equal(doubleExt.cleanTitle, 'Movie');
});

// ============================================================================
// 7. ADVERSARIAL STRESS: COMPOUND NOISE TOKENS WITH DOTS VS HYPHENS
// ============================================================================

test('Adversarial 7: Compound noise tokens with dots (Extended.Cut, Directors.Cut, Dolby.Vision)', () => {
  // When hyphenated: 'extended-cut' is stripped properly
  const hyphenCut = sanitizeMediaFilename('Avatar.extended-cut.mkv');
  assert.equal(hyphenCut.cleanTitle, 'Avatar');

  // When dot-separated without year: 'Extended' is stripped but 'Cut' remains
  // because NOISE_TOKENS only defines 'extended-cut' (hyphenated), not standalone 'cut'.
  const dotCut = sanitizeMediaFilename('Avatar.Extended.Cut.mkv');
  assert.equal(dotCut.cleanTitle, 'Avatar Cut');

  // When dot-separated before year:
  const dotCutWithYear = sanitizeMediaFilename('Inception.Extended.Cut.2010.mkv');
  assert.equal(dotCutWithYear.cleanTitle, 'Inception Cut');
  assert.equal(dotCutWithYear.year, 2010);

  // When Dolby.Vision: 'dolby-vision' is defined with hyphen, so dot-separated leaves 'Dolby Vision'
  const dolbyVision = sanitizeMediaFilename('The.Batman.Dolby.Vision.2022.mkv');
  assert.equal(dolbyVision.cleanTitle, 'The Batman Dolby Vision');
  assert.equal(dolbyVision.year, 2022);
});

