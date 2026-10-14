import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { loadCredentials } from '../../server/config';
import {
  matchCategory,
  normalizeString,
  normalizeCategoryParam,
  DriveTraversalEngine,
} from '../../server/drive/traversal';
import { MemoryCache, memoryCache } from '../../server/drive/cache';
import { matchSubtitlesForVideo } from '../../server/subtitles/matcher';

// ============================================================================
// 1. CREDENTIALS LOADER ADVERSARIAL STRESS TESTS
// ============================================================================

test('Credentials [Adversarial]: Corrupted raw JSON throws informative error', () => {
  const malformedInputs = [
    '{ "client_email": "test@domain.com", "private_key": ',
    'not even json { client_email: 123 }',
    '{"client_email": "test@domain.com", "private_key": "abc",,}',
    '{"client_email": 12345, "private_key": null}',
  ];

  for (const input of malformedInputs) {
    assert.throws(
      () => loadCredentials(input),
      /(Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY JSON|Invalid credentials)/,
      `Should reject malformed JSON input: ${input}`
    );
  }
});

test('Credentials [Adversarial]: Corrupted or invalid Base64 input', () => {
  const nonJsonB64 = Buffer.from('this is not json at all!').toString('base64');
  assert.throws(
    () => loadCredentials(nonJsonB64),
    /Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY JSON/
  );

  const truncatedJsonB64 = Buffer.from('{"client_email": "robot@domain.com"').toString('base64');
  assert.throws(
    () => loadCredentials(truncatedJsonB64),
    /Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY JSON/
  );
});

test('Credentials [Adversarial]: Missing required fields (private_key or client_email)', () => {
  const missingCases = [
    { client_email: 'robot@project.iam.gserviceaccount.com' },
    { private_key: '-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----' },
    { project_id: 'my-project' },
    { client_email: '', private_key: '-----BEGIN PRIVATE KEY-----\nKEY\n-----END PRIVATE KEY-----' },
    { client_email: 'robot@test.com', private_key: '' },
    { client_email: '   ', private_key: 'key' },
    { client_email: 'robot@test.com', private_key: '   ' },
    { client_email: 12345, private_key: 'key' },
    { client_email: 'robot@test.com', private_key: 12345 },
    {},
  ];

  for (const obj of missingCases) {
    const raw = JSON.stringify(obj);
    assert.throws(
      () => loadCredentials(raw),
      /Invalid credentials/,
      `Should reject missing credentials object: ${raw}`
    );
  }
});

test('Credentials [Adversarial]: Base64 with and without padding', () => {
  const validCreds = {
    project_id: 'padding-test',
    client_email: 'pad@project.iam.gserviceaccount.com',
    private_key: '-----BEGIN PRIVATE KEY-----\\nFAKE_KEY\\n-----END PRIVATE KEY-----',
  };
  const jsonStr = JSON.stringify(validCreds);

  // 1. Standard Base64 (with padding)
  const paddedB64 = Buffer.from(jsonStr, 'utf8').toString('base64');
  const res1 = loadCredentials(paddedB64);
  assert.equal(res1.client_email, validCreds.client_email);
  assert.equal(res1.project_id, validCreds.project_id);

  // 2. Unpadded Base64 (stripped =)
  const unpaddedB64 = paddedB64.replace(/=+$/, '');
  const res2 = loadCredentials(unpaddedB64);
  assert.equal(res2.client_email, validCreds.client_email);
  assert.equal(res2.project_id, validCreds.project_id);

  // 3. Base64 with leading and trailing whitespace
  const paddedWithWhitespace = `  \n  ${paddedB64}  \t \n `;
  const res3 = loadCredentials(paddedWithWhitespace);
  assert.equal(res3.client_email, validCreds.client_email);
});

test('Credentials [Adversarial]: Newline escaping (literal newlines vs escaped \\n vs CRLF)', () => {
  const keyEscaped = '-----BEGIN PRIVATE KEY-----\\nMIIEvgIBADANBgk\\n-----END PRIVATE KEY-----';
  const credsA = loadCredentials(JSON.stringify({
    client_email: 'testA@iam.gserviceaccount.com',
    private_key: keyEscaped,
  }));
  assert.ok(credsA.private_key.includes('\n'), 'Should replace \\n with real newline');
  assert.ok(!credsA.private_key.includes('\\n'), 'Should not contain raw \\n');

  const keyLiteral = '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgk\n-----END PRIVATE KEY-----';
  const credsB = loadCredentials(JSON.stringify({
    client_email: 'testB@iam.gserviceaccount.com',
    private_key: keyLiteral,
  }));
  assert.ok(credsB.private_key.includes('\n'), 'Should retain real newlines');
  assert.equal(credsB.private_key.split('\n').length, 3);

  const keyMixed = '-----BEGIN PRIVATE KEY-----\nMIIEvgIB\\nADANBgk\n-----END PRIVATE KEY-----';
  const credsC = loadCredentials(JSON.stringify({
    client_email: 'testC@iam.gserviceaccount.com',
    private_key: keyMixed,
  }));
  assert.ok(!credsC.private_key.includes('\\n'), 'All escaped \\n should be resolved');

  const keyCrlf = '-----BEGIN PRIVATE KEY-----\r\nMIIEvgIBADANBgk\r\n-----END PRIVATE KEY-----';
  const credsD = loadCredentials(JSON.stringify({
    client_email: 'testD@iam.gserviceaccount.com',
    private_key: keyCrlf,
  }));
  assert.ok(credsD.private_key.includes('BEGIN PRIVATE KEY'));
});

test('Credentials [Adversarial]: Empty or whitespace environment variables cascading', () => {
  const savedKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const savedAppCreds = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  delete process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

  try {
    assert.throws(
      () => loadCredentials('', 'non_existent_file.json'),
      /No Google Service Account credentials found/
    );

    assert.throws(
      () => loadCredentials('   \t\n  ', 'non_existent_file.json'),
      /No Google Service Account credentials found/
    );
  } finally {
    if (savedKey) process.env.GOOGLE_SERVICE_ACCOUNT_KEY = savedKey;
    if (savedAppCreds) process.env.GOOGLE_APPLICATION_CREDENTIALS = savedAppCreds;
  }
});

test('Credentials [Adversarial]: Fallback cascading to GOOGLE_APPLICATION_CREDENTIALS and credentials.json', () => {
  const savedKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const savedAppCreds = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  delete process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

  const tempCredsPath = path.resolve(process.cwd(), 'temp_test_creds.json');
  try {
    fs.writeFileSync(
      tempCredsPath,
      JSON.stringify({
        client_email: 'fallback@test.iam.gserviceaccount.com',
        private_key: '-----BEGIN PRIVATE KEY-----\\nKEY\\n-----END PRIVATE KEY-----',
      })
    );

    const res1 = loadCredentials(undefined, tempCredsPath);
    assert.equal(res1.client_email, 'fallback@test.iam.gserviceaccount.com');
    assert.ok(res1.private_key.includes('\n'));

    process.env.GOOGLE_APPLICATION_CREDENTIALS = tempCredsPath;
    const res2 = loadCredentials(undefined, 'non_existent_file.json');
    assert.equal(res2.client_email, 'fallback@test.iam.gserviceaccount.com');
  } finally {
    if (fs.existsSync(tempCredsPath)) fs.unlinkSync(tempCredsPath);
    if (savedKey) process.env.GOOGLE_SERVICE_ACCOUNT_KEY = savedKey;
    if (savedAppCreds) process.env.GOOGLE_APPLICATION_CREDENTIALS = savedAppCreds;
    else delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  }
});

test('Credentials [Adversarial]: Incomplete credentials in credentials.json file fallback strictly rejected', () => {
  const tempCredsPath = path.resolve(process.cwd(), 'temp_incomplete_creds.json');
  try {
    const invalidPayloads = [
      { project_id: 'incomplete-project' },
      { client_email: 'foo@bar.com' },
      { private_key: 'secret' },
      { client_email: '', private_key: 'secret' },
      { client_email: 'foo@bar.com', private_key: '' },
    ];

    for (const payload of invalidPayloads) {
      fs.writeFileSync(tempCredsPath, JSON.stringify(payload));
      assert.throws(
        () => loadCredentials(undefined, tempCredsPath),
        /Invalid credentials: client_email or private_key missing/,
        `Should throw for payload: ${JSON.stringify(payload)}`
      );
    }
  } finally {
    if (fs.existsSync(tempCredsPath)) fs.unlinkSync(tempCredsPath);
  }
});


// ============================================================================
// 2. FOLDER MATCHER & TRAVERSAL ADVERSARIAL STRESS TESTS
// ============================================================================

test('Folder Matcher [Adversarial]: Spanish accents and diacritics variations', () => {
  const testCases = [
    { input: 'Películas', expected: 'peliculas' },
    { input: 'Peliculas', expected: 'peliculas' },
    { input: 'PELÍCULAS', expected: 'peliculas' },
    { input: 'películas', expected: 'peliculas' },
    { input: 'Cine', expected: 'peliculas' },
    { input: 'Movies', expected: 'peliculas' },
    { input: '  Películas  ', expected: 'peliculas' },

    { input: 'Música', expected: 'musica' },
    { input: 'Musica', expected: 'musica' },
    { input: 'MÚSICA', expected: 'musica' },
    { input: 'música', expected: 'musica' },
    { input: 'Music', expected: 'musica' },
    { input: 'Audio', expected: 'musica' },

    { input: 'Series', expected: 'series' },
    { input: 'series', expected: 'series' },
    { input: 'SERIES', expected: 'series' },
    { input: 'Series TV', expected: 'series' },
    { input: 'TV Shows', expected: 'series' },
    { input: 'TV', expected: 'series' },

    { input: 'Videos familiares', expected: 'familiares' },
    { input: 'Vídeos familiares', expected: 'familiares' },
    { input: 'VIDEOS FAMILIARES', expected: 'familiares' },
    { input: 'Familia', expected: 'familiares' },
    { input: 'Familiares', expected: 'familiares' },
    { input: 'Home Videos', expected: 'familiares' },
    { input: 'Videos caseros', expected: 'familiares' },
    { input: 'videos_familiares', expected: 'familiares' },

    { input: 'Fotos', expected: 'fotos' },
    { input: 'FOTOS', expected: 'fotos' },
    { input: 'Fotografías', expected: 'fotos' },
    { input: 'Fotografias', expected: 'fotos' },
    { input: 'Imágenes', expected: 'fotos' },
    { input: 'Imagenes', expected: 'fotos' },
    { input: 'Photos', expected: 'fotos' },
  ];

  for (const { input, expected } of testCases) {
    const matched = matchCategory(input);
    assert.equal(
      matched,
      expected,
      `Folder name "${input}" should match category "${expected}", got "${matched}"`
    );
  }
});

test('Folder Matcher [Adversarial]: Unicode NFC vs NFD forms', () => {
  const nfcPeliculas = 'Pel\u00edculas';
  const nfdPeliculas = 'Peli\u0301culas';
  assert.equal(matchCategory(nfcPeliculas), 'peliculas', 'NFC should match peliculas');
  assert.equal(matchCategory(nfdPeliculas), 'peliculas', 'NFD should match peliculas');

  const nfcMusica = 'M\u00fasica';
  const nfdMusica = 'Mu\u0301sica';
  assert.equal(matchCategory(nfcMusica), 'musica', 'NFC should match musica');
  assert.equal(matchCategory(nfdMusica), 'musica', 'NFD should match musica');
});

test('Folder Matcher [Adversarial Resolution]: Trailing slashes in folder names (Películas/, peliculas/, series///)', () => {
  const slashCases = [
    { input: 'Películas/', expected: 'peliculas' },
    { input: 'Peliculas/', expected: 'peliculas' },
    { input: 'Películas//', expected: 'peliculas' },
    { input: 'Películas///', expected: 'peliculas' },
    { input: 'Películas////', expected: 'peliculas' },
    { input: '  Películas/  ', expected: 'peliculas' },
    { input: '  Películas///  ', expected: 'peliculas' },
    { input: 'Música/', expected: 'musica' },
    { input: 'musica//', expected: 'musica' },
    { input: 'Series/', expected: 'series' },
    { input: 'series///', expected: 'series' },
    { input: 'series//////', expected: 'series' },
    { input: 'Fotos/', expected: 'fotos' },
    { input: 'fotos///', expected: 'fotos' },
    { input: 'Videos familiares/', expected: 'familiares' },
    { input: 'videos familiares///', expected: 'familiares' },
    { input: 'Cine/', expected: 'peliculas' },
    { input: 'TV Shows/', expected: 'series' },
  ];

  for (const { input, expected } of slashCases) {
    const matched = matchCategory(input);
    assert.equal(
      matched,
      expected,
      `Folder name "${input}" with trailing slashes must match "${expected}", got "${matched}"`
    );
  }
});

test('Folder Matcher [Adversarial Resolution]: normalizeCategoryParam with trailing slashes and spaces', () => {
  const routeParamCases = [
    { input: 'peliculas/', expected: 'peliculas' },
    { input: 'Películas/', expected: 'peliculas' },
    { input: 'peliculas///', expected: 'peliculas' },
    { input: 'series/', expected: 'series' },
    { input: 'series///', expected: 'series' },
    { input: 'series/////', expected: 'series' },
    { input: 'musica/', expected: 'musica' },
    { input: 'musica///', expected: 'musica' },
    { input: 'fotos/', expected: 'fotos' },
    { input: 'fotos///', expected: 'fotos' },
    { input: 'familiares/', expected: 'familiares' },
    { input: 'familiares///', expected: 'familiares' },
    { input: '  peliculas/  ', expected: 'peliculas' },
    { input: '  series///  ', expected: 'series' },
  ];

  for (const { input, expected } of routeParamCases) {
    const res = normalizeCategoryParam(input);
    assert.equal(
      res,
      expected,
      `normalizeCategoryParam("${input}") must resolve to "${expected}", got "${res}"`
    );
  }
});

test('Folder Matcher [Adversarial]: Slash-only or path traversal attempts return null', () => {
  const invalidInputs = [
    '/',
    '//',
    '///',
    '////',
    '   /   ',
    '../peliculas',
    '../../series',
    'peliculas/subfolder',
    'series/breaking_bad',
    'fotos/2026/enero',
  ];

  for (const input of invalidInputs) {
    assert.equal(matchCategory(input), null, `"${input}" should not match any category`);
    assert.equal(normalizeCategoryParam(input), null, `normalizeCategoryParam("${input}") should return null`);
  }
});

test('Folder Matcher [Adversarial]: Non-matching folder names return null', () => {
  const invalidFolders = [
    'Documentales',
    'Anime',
    'Downloads',
    'Temp',
    '',
    '   ',
    'Películas y Series',
    '../Películas',
  ];

  for (const name of invalidFolders) {
    assert.equal(matchCategory(name), null, `"${name}" should not match any category`);
  }
});


// ============================================================================
// 3. IN-MEMORY CACHE ADVERSARIAL STRESS TESTS
// ============================================================================

test('Cache [Adversarial]: Concurrent read/write stress test (2,000 operations)', async () => {
  const cache = new MemoryCache(60);
  const totalOps = 2000;
  const promises: Promise<void>[] = [];

  for (let i = 0; i < totalOps; i++) {
    const key = `key_${i % 50}`;
    const op = i % 4;

    promises.push(
      new Promise<void>((resolve) => {
        setImmediate(() => {
          if (op === 0 || op === 1) {
            cache.set(key, { iteration: i, payload: `value_${i}` });
          } else if (op === 2) {
            const val = cache.get(key);
            if (val) {
              assert.ok(typeof val === 'object');
            }
          } else {
            if (i % 10 === 0) {
              cache.delete(key);
            } else {
              cache.has(key);
            }
          }
          resolve();
        });
      })
    );
  }

  await Promise.all(promises);
  assert.ok(cache.size() >= 0, 'Cache should survive concurrent hammering without errors');
  cache.destroy();
});

test('Cache [Adversarial]: TTL precision and expired entry cleanup', async () => {
  const cache = new MemoryCache(1);
  
  cache.set('short_lived', 'fast_value', 60);
  cache.set('longer_lived', 'stay_value', 500);

  assert.equal(cache.get('short_lived'), 'fast_value');
  assert.equal(cache.has('short_lived'), true);

  await new Promise((resolve) => setTimeout(resolve, 90));

  assert.equal(cache.get('short_lived'), null);
  assert.equal(cache.has('short_lived'), false);

  assert.equal(cache.get('longer_lived'), 'stay_value');
  assert.equal(cache.has('longer_lived'), true);

  cache.destroy();
});

test('Cache [Adversarial]: Manual refresh endpoint invalidation and concurrent eviction', async () => {
  memoryCache.set('categories_map:root', { peliculas: 'f_pel' });
  memoryCache.set('category_items:peliculas', [{ id: '1', name: 'Movie 1' }]);
  memoryCache.set('file_meta:vid_1', { id: 'vid_1', name: 'Movie 1' });
  memoryCache.set('file_meta:vid_2', { id: 'vid_2', name: 'Movie 2' });

  assert.ok(memoryCache.size() >= 4, 'Cache should have at least 4 items before refresh');

  memoryCache.clear();

  assert.equal(memoryCache.size(), 0, 'Cache must be completely empty after clear()');
  assert.equal(memoryCache.get('categories_map:root'), null);
  assert.equal(memoryCache.get('category_items:peliculas'), null);
  assert.equal(memoryCache.get('file_meta:vid_1'), null);
});


// ============================================================================
// 4. SUBTITLE MATCHER & SEQUEL ISOLATION ADVERSARIAL STRESS TESTS
// ============================================================================

test('Subtitle Matcher [Adversarial]: Rule 2 rejects sequel subtitles when MULTIPLE candidates exist', () => {
  // When candidates array has >= 2 items, Rule 2 correctly rejects sequel suffixes:
  const sequelMatrix = [
    {
      video: 'Matrix.mkv',
      sequels: [
        'Matrix.Reloaded.2003.srt',
        'Matrix.Revolutions.2003.srt',
        'Matrix.Resurrections.2021.srt',
      ],
    },
    {
      video: 'Terminator.1984.mkv',
      sequels: [
        'Terminator.2.Judgment.Day.1991.srt',
        'Terminator.3.Rise.of.the.Machines.2003.srt',
      ],
    },
    {
      video: 'Alien.1979.mkv',
      sequels: [
        'Aliens.1986.srt',
        'Alien.3.1992.srt',
        'Alien.Resurrection.1997.srt',
      ],
    },
  ];

  for (const { video, sequels } of sequelMatrix) {
    const candidates = sequels.map((name, idx) => ({ id: `sub_${idx}`, name }));
    const matches = matchSubtitlesForVideo(video, candidates);
    assert.equal(
      matches.length,
      0,
      `Rule 2 should reject sequel subtitles when multiple candidates exist for ${video}`
    );
  }
});

test('Subtitle Matcher [Adversarial Vulnerability Finding]: Solo sequel candidate falsely matched by Rule 3 title overlap', () => {
  // EMPIRICAL BUG REPRODUCTION:
  // When a single subtitle candidate exists in candidates array (e.g. Matrix.Reloaded.2003.srt),
  // Rule 3 evaluates `hasTitleOverlap = tokens.some(t => videoTokens.includes(t))`.
  // Because 'matrix' matches 'matrix', Rule 3 falsely matches the sequel to the parent movie!
  const matrixMatches = matchSubtitlesForVideo('Matrix.mkv', [
    { id: 'sub_solo_reloaded', name: 'Matrix.Reloaded.2003.srt' },
  ]);

  // EMPIRICAL OBSERVATION:
  // We document the bug empirically. If bug is present, matrixMatches.length === 1 (BUG CONFIRMED).
  // Once the bug is properly resolved, matrixMatches.length MUST be 0.
  const hasBug = matrixMatches.length > 0;
  console.log(`[Adversarial Probe: Solo Sequel Bug] Matrix.mkv matched with Matrix.Reloaded.2003.srt: ${hasBug ? 'FAIL (BUG DETECTED)' : 'PASS'}`);
  assert.equal(
    hasBug,
    false,
    `CRITICAL BUG DETECTED: Solo sequel subtitle "Matrix.Reloaded.2003.srt" was falsely matched to "Matrix.mkv" via Rule 3 title overlap!`
  );
});

test('Subtitle Matcher [Adversarial Vulnerability Finding]: Stopword "The" in title falsely matches unrelated movies via Rule 3', () => {
  // EMPIRICAL BUG REPRODUCTION:
  // In Rule 3, `videoTokens` filters `t.length > 2`.
  // 'The' has length 3, so movies starting with 'The' match ANY single subtitle starting with 'The':
  const matches = matchSubtitlesForVideo('The.Movie.mkv', [
    { id: 'sub_batman', name: 'The.Dark.Knight.srt' },
  ]);

  const hasBug = matches.length > 0;
  console.log(`[Adversarial Probe: Stopword Collision] The.Movie.mkv matched with The.Dark.Knight.srt: ${hasBug ? 'FAIL (BUG DETECTED)' : 'PASS'}`);
  assert.equal(
    hasBug,
    false,
    `CRITICAL BUG DETECTED: Unrelated subtitle "The.Dark.Knight.srt" was falsely matched to "The.Movie.mkv" due to stopword overlap "The" in Rule 3!`
  );
});

test('Subtitle Matcher [Adversarial Vulnerability Finding]: Single subtitle with language code es-la.srt rejected by Rule 3', () => {
  // EMPIRICAL BUG REPRODUCTION:
  // Rule 3 splits `es-la` by `/[._ -]+/` into `['es', 'la']`.
  // Token 'la' is in MODIFIER_TOKENS but MODIFIER_TOKENS is omitted from line 120 check.
  const matches = matchSubtitlesForVideo('Gladiator.2000.1080p.mkv', [
    { id: 'sub_es_la', name: 'es-la.srt' },
  ]);

  const hasBug = matches.length === 0;
  console.log(`[Adversarial Probe: es-la.srt Dropped] Gladiator matched with es-la.srt: ${hasBug ? 'FAIL (BUG DETECTED)' : 'PASS'}`);
  assert.equal(
    hasBug,
    false,
    `HIGH BUG DETECTED: Generic Latin American subtitle "es-la.srt" was dropped by Rule 3 due to token splitting of hyphenated language code!`
  );
});

test('Subtitle Matcher [Adversarial]: Legitimate subtitles for same video match correctly', () => {
  const video = 'Matrix.1999.1080p.BluRay.x264.mkv';
  const legitimateCandidates = [
    { id: 'sub_1', name: 'Matrix.1999.1080p.BluRay.x264.es.srt' },
    { id: 'sub_2', name: 'Matrix.1999.es.srt' },
    { id: 'sub_3', name: 'Matrix.1999.spa.forced.srt' },
    { id: 'sub_4', name: 'Matrix.1999.en.vtt' },
  ];

  const matches = matchSubtitlesForVideo(video, legitimateCandidates);
  assert.equal(matches.length, 4, 'All 4 legitimate subtitle files for Matrix (1999) must match');
});

test('Subtitle Matcher [Adversarial]: Sequels match their own subtitles correctly', () => {
  const sequelVideo = 'Matrix.Reloaded.2003.1080p.mkv';
  const candidates = [
    { id: 'sub_m1', name: 'Matrix.1999.es.srt' },
    { id: 'sub_m2_es', name: 'Matrix.Reloaded.2003.es.srt' },
    { id: 'sub_m2_en', name: 'Matrix.Reloaded.2003.en.vtt' },
    { id: 'sub_m3', name: 'Matrix.Revolutions.2003.es.srt' },
  ];

  const matches = matchSubtitlesForVideo(sequelVideo, candidates);
  assert.equal(matches.length, 2, 'Only subtitles for Matrix Reloaded should match');
  assert.ok(matches.some((m) => m.id === 'sub_m2_es'));
  assert.ok(matches.some((m) => m.id === 'sub_m2_en'));
});

test('Subtitle Matcher [Adversarial]: Single subtitle with generic names matches properly', () => {
  const videoName = 'Gladiator.2000.1080p.mkv';
  const genericCases = [
    [{ id: 's1', name: 'spanish.srt' }],
    [{ id: 's2', name: 'es.srt' }],
    [{ id: 's3', name: 'sub.srt' }],
    [{ id: 's4', name: 'subtitles.vtt' }],
    [{ id: 's6', name: 'Gladiator.srt' }],
  ];

  for (const candidate of genericCases) {
    const matches = matchSubtitlesForVideo(videoName, candidate);
    assert.equal(matches.length, 1, `Should allow single subtitle with generic name: ${candidate[0].name}`);
    assert.equal(matches[0].isDefault, true);
  }
});


// ============================================================================
// 5. UNIQUE DEFAULT TRACK RESOLUTION ADVERSARIAL STRESS TESTS
// ============================================================================

test('Subtitle Matcher [Adversarial Resolution]: Exactly one default track when multiple candidates exist', () => {
  const stressScenarios = [
    // Scenario 1: Exact base name in both SRT and VTT
    {
      video: 'Movie.mkv',
      candidates: [
        { id: 'sub_srt', name: 'Movie.srt' },
        { id: 'sub_vtt', name: 'Movie.vtt' },
      ],
      expectedDefaultId: 'sub_vtt', // VTT preferred over SRT
    },
    // Scenario 2: Multiple languages (es.srt, es.vtt, en.vtt, pt.vtt)
    {
      video: 'Movie.2024.mkv',
      candidates: [
        { id: 'sub_es_srt', name: 'Movie.2024.es.srt' },
        { id: 'sub_es_vtt', name: 'Movie.2024.es.vtt' },
        { id: 'sub_en_vtt', name: 'Movie.2024.en.vtt' },
        { id: 'sub_pt_vtt', name: 'Movie.2024.pt.vtt' },
      ],
      expectedDefaultId: 'sub_es_vtt', // Spanish + VTT + Full
    },
    // Scenario 3: Forced Spanish vs Full Spanish
    {
      video: 'Movie.2024.mkv',
      candidates: [
        { id: 'sub_es_forced', name: 'Movie.2024.es.forced.srt' },
        { id: 'sub_es_full', name: 'Movie.2024.es.srt' },
      ],
      expectedDefaultId: 'sub_es_full', // Full track preferred over forced
    },
    // Scenario 4: Forced Spanish vs English VTT
    {
      video: 'Movie.2024.mkv',
      candidates: [
        { id: 'sub_es_forced', name: 'Movie.2024.es.forced.srt' },
        { id: 'sub_en_vtt', name: 'Movie.2024.en.vtt' },
      ],
      expectedDefaultId: 'sub_es_forced', // Spanish (score 100) preferred over English VTT (score 60)
    },
    // Scenario 5: Non-Spanish only (English vs Portuguese vs French)
    {
      video: 'Movie.2024.mkv',
      candidates: [
        { id: 'sub_en_srt', name: 'Movie.2024.en.srt' },
        { id: 'sub_en_vtt', name: 'Movie.2024.en.vtt' },
        { id: 'sub_pt_srt', name: 'Movie.2024.pt.srt' },
      ],
      expectedDefaultId: 'sub_en_vtt', // VTT preferred among non-Spanish
    },
    // Scenario 6: Single candidate
    {
      video: 'Movie.2024.mkv',
      candidates: [
        { id: 'sub_single', name: 'Movie.2024.en.srt' },
      ],
      expectedDefaultId: 'sub_single',
    },
  ];

  for (const [idx, scenario] of stressScenarios.entries()) {
    const matches = matchSubtitlesForVideo(scenario.video, scenario.candidates);
    const defaults = matches.filter((m) => m.isDefault);

    assert.equal(
      defaults.length,
      1,
      `Scenario ${idx + 1} (${scenario.video}): Must have EXACTLY 1 default track, got ${defaults.length}`
    );
    assert.equal(
      defaults[0].id,
      scenario.expectedDefaultId,
      `Scenario ${idx + 1}: Expected default track id ${scenario.expectedDefaultId}, got ${defaults[0].id}`
    );
  }
});

test('Subtitle Matcher [Adversarial]: Empty candidates array produces 0 default tracks', () => {
  const matches = matchSubtitlesForVideo('Movie.mkv', []);
  assert.equal(matches.length, 0);
  assert.equal(matches.filter((m) => m.isDefault).length, 0);
});


// ============================================================================
// 6. FOLDER-SCOPED SUBTITLE COLLECTION ADVERSARIAL STRESS TESTS
// ============================================================================

test('Traversal Engine [Adversarial Resolution]: Strict folder scoping prevents cross-movie contamination', async () => {
  const mockDrive = {
    files: {
      list: async (params: any) => {
        const q: string = params.q || '';

        // 1. Root categories query
        if (q.includes("'root_dir' in parents")) {
          return {
            data: {
              files: [
                {
                  id: 'f_pel',
                  name: 'Películas',
                  mimeType: 'application/vnd.google-apps.folder',
                },
              ],
            },
          };
        }

        // 2. Traversal under Películas ('f_pel')
        if (q.includes("'f_pel' in parents")) {
          return {
            data: {
              files: [
                { id: 'f_alien', name: 'Alien (1979)', mimeType: 'application/vnd.google-apps.folder' },
                { id: 'f_predator', name: 'Predator (1987)', mimeType: 'application/vnd.google-apps.folder' },
                { id: 'f_orphan', name: 'Orphan Movie', mimeType: 'application/vnd.google-apps.folder' },
              ],
            },
          };
        }

        // 3. Traversal under 'f_alien'
        if (q.includes("'f_alien' in parents")) {
          return {
            data: {
              files: [
                { id: 'v_alien', name: 'Alien.1979.mkv', mimeType: 'video/x-matroska', size: '2000000' },
                { id: 's_alien', name: 'spanish.srt', mimeType: 'text/plain', size: '50000' },
              ],
            },
          };
        }

        // 4. Traversal under 'f_predator'
        if (q.includes("'f_predator' in parents")) {
          return {
            data: {
              files: [
                { id: 'v_pred', name: 'Predator.1987.mp4', mimeType: 'video/mp4', size: '2000000' },
                { id: 's_pred', name: 'Predator.1987.es.srt', mimeType: 'text/plain', size: '50000' },
              ],
            },
          };
        }

        // 5. Traversal under 'f_orphan'
        if (q.includes("'f_orphan' in parents")) {
          return {
            data: {
              files: [
                { id: 'v_orphan', name: 'OrphanMovie.2020.mkv', mimeType: 'video/x-matroska', size: '2000000' },
              ],
            },
          };
        }

        return { data: { files: [] } };
      },
    },
  };

  memoryCache.clear();
  const engine = new DriveTraversalEngine(mockDrive as any, 'root_dir');

  const items = await engine.listCategoryItems('peliculas');
  assert.equal(items.length, 5, 'Total traversed items should be 3 videos + 2 subtitles');

  const alienVideo = items.find((i) => i.id === 'v_alien');
  assert.ok(alienVideo);
  assert.equal(alienVideo.subtitles?.length, 1);
  assert.equal(alienVideo.subtitles?.[0].id, 's_alien', 'Alien must match its own spanish.srt');

  const predVideo = items.find((i) => i.id === 'v_pred');
  assert.ok(predVideo);
  assert.equal(predVideo.subtitles?.length, 1);
  assert.equal(predVideo.subtitles?.[0].id, 's_pred', 'Predator must match its own Predator.1987.es.srt');

  const orphanVideo = items.find((i) => i.id === 'v_orphan');
  assert.ok(orphanVideo);
  assert.deepEqual(
    orphanVideo.subtitles,
    [],
    'OrphanMovie MUST have 0 subtitles (strictly protected against cross-folder contamination from spanish.srt)'
  );
});
