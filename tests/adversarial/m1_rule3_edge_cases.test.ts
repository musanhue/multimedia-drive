import test from 'node:test';
import assert from 'node:assert/strict';
import { matchSubtitlesForVideo } from '../../server/subtitles/matcher';

// ============================================================================
// ADVERSARIAL STRESS TEST SUITE: SUBTITLE MATCHER RULE 3 & AGGRESSIVE EDGE CASES
// ============================================================================

test('Subtitle Matcher Rule 3 [Adversarial Requirement]: Spider.Man.mkv vs Spider.Man.2.srt must be rejected', () => {
  // Video: Spider.Man.mkv
  // Candidate: Spider.Man.2.srt (solo sequel candidate)
  // Must reject under both solo (Rule 3) and multi-candidate (Rule 2) evaluation
  const soloMatches = matchSubtitlesForVideo('Spider.Man.mkv', [
    { id: 'sub_spiderman2', name: 'Spider.Man.2.srt' },
  ]);
  assert.equal(
    soloMatches.length,
    0,
    'Spider.Man.mkv must reject solo sequel subtitle Spider.Man.2.srt under Rule 3'
  );

  const multiMatches = matchSubtitlesForVideo('Spider.Man.mkv', [
    { id: 'sub_spiderman2', name: 'Spider.Man.2.srt' },
    { id: 'sub_spiderman3', name: 'Spider.Man.3.srt' },
  ]);
  assert.equal(
    multiMatches.length,
    0,
    'Spider.Man.mkv must reject sequel candidates Spider.Man.2.srt and Spider.Man.3.srt under Rule 2'
  );
});

test('Subtitle Matcher Rule 3 [Adversarial Requirement]: Lord.of.the.Rings.mkv vs Lord.of.the.Flies.srt must be rejected', () => {
  // Video: Lord.of.the.Rings.mkv
  // Candidate: Lord.of.the.Flies.srt
  // Shares stopwords ("Lord", "of", "the"), completely different film
  const soloMatches = matchSubtitlesForVideo('Lord.of.the.Rings.mkv', [
    { id: 'sub_lotf', name: 'Lord.of.the.Flies.srt' },
  ]);
  assert.equal(
    soloMatches.length,
    0,
    'Lord.of.the.Rings.mkv must reject unrelated subtitle Lord.of.the.Flies.srt despite stopword overlap'
  );
});

test('Subtitle Matcher Rule 3 [Adversarial Requirement]: Avatar.mp4 vs castellano.vtt must match and tag Spanish default', () => {
  // Video: Avatar.mp4
  // Candidate: castellano.vtt (single generic dialect subtitle in folder)
  const matches = matchSubtitlesForVideo('Avatar.mp4', [
    { id: 'sub_avatar_cast', name: 'castellano.vtt' },
  ]);

  assert.equal(matches.length, 1, 'Avatar.mp4 must match generic castellano.vtt');
  const track = matches[0];
  assert.equal(track.id, 'sub_avatar_cast');
  assert.equal(track.lang, 'es', 'Language must be tagged as Spanish (es)');
  assert.equal(track.format, 'vtt', 'Format must be preserved as vtt');
  assert.equal(track.isDefault, true, 'Track must be marked as default');
  assert.equal(track.isForced, false, 'Track must not be marked as forced');
  assert.equal(
    track.label,
    'Español (Predeterminado)',
    'Label must be updated to Español (Predeterminado) for default Spanish full track'
  );
  assert.equal(track.vttUrl, '/api/subtitles/sub_avatar_cast');
});

test('Subtitle Matcher Rule 3 [Adversarial Requirement]: Dune.mkv vs es-419.srt must match and tag Spanish default', () => {
  // Video: Dune.mkv
  // Candidate: es-419.srt (Latin American Spanish subtitle)
  const matches = matchSubtitlesForVideo('Dune.mkv', [
    { id: 'sub_dune_latam', name: 'es-419.srt' },
  ]);

  assert.equal(matches.length, 1, 'Dune.mkv must match generic es-419.srt');
  const track = matches[0];
  assert.equal(track.id, 'sub_dune_latam');
  assert.equal(track.lang, 'es-LA', 'Language code must be es-LA');
  assert.ok(track.lang.startsWith('es'), 'Language must belong to Spanish family');
  assert.equal(track.label, 'Español (Latino)', 'Label must identify Latin American Spanish');
  assert.equal(track.isDefault, true, 'Track must be marked as default');
  assert.equal(track.format, 'srt');
  assert.equal(track.isForced, false);
  assert.equal(track.vttUrl, '/api/subtitles/sub_dune_latam');
});

test('Subtitle Matcher Rule 3 [Stress]: Broad sequel titles rejection suite', () => {
  const sequelCases = [
    { video: 'Iron.Man.mkv', sub: 'Iron.Man.2.srt' },
    { video: 'Iron.Man.mkv', sub: 'Iron.Man.3.2013.srt' },
    { video: 'Toy.Story.mkv', sub: 'Toy.Story.2.srt' },
    { video: 'Toy.Story.mkv', sub: 'Toy.Story.3.1999.srt' },
    { video: 'Shrek.mkv', sub: 'Shrek.2.srt' },
    { video: 'Shrek.mkv', sub: 'Shrek.Forever.After.2010.srt' },
    { video: 'Fast.and.Furious.mkv', sub: 'Fast.Five.srt' },
    { video: 'Alien.1979.mkv', sub: 'Aliens.1986.srt' },
    { video: 'Terminator.mkv', sub: 'Terminator.2.Judgment.Day.srt' },
    { video: 'The.Godfather.mkv', sub: 'The.Godfather.Part.II.srt' },
  ];

  for (const { video, sub } of sequelCases) {
    const matches = matchSubtitlesForVideo(video, [{ id: 'sub_seq', name: sub }]);
    assert.equal(
      matches.length,
      0,
      `Video "${video}" must reject sequel subtitle "${sub}"`
    );
  }
});

test('Subtitle Matcher Rule 3 [Stress]: Stopword and shared token collision rejection suite', () => {
  const stopwordCases = [
    { video: 'The.Batman.mkv', sub: 'The.Godfather.srt' },
    { video: 'A.Beautiful.Mind.mkv', sub: 'A.Quiet.Place.srt' },
    { video: 'In.the.Mood.for.Love.mkv', sub: 'In.the.Heart.of.the.Sea.srt' },
    { video: 'Star.Wars.mkv', sub: 'Star.Trek.srt' },
    { video: 'American.Beauty.mkv', sub: 'American.Psycho.srt' },
    { video: 'No.Country.for.Old.Men.mkv', sub: 'No.Time.to.Die.srt' },
  ];

  for (const { video, sub } of stopwordCases) {
    const matches = matchSubtitlesForVideo(video, [{ id: 'sub_col', name: sub }]);
    assert.equal(
      matches.length,
      0,
      `Video "${video}" must reject collision subtitle "${sub}"`
    );
  }
});

test('Subtitle Matcher Rule 3 [Stress]: Generic subtitle aliases in single-sub directory', () => {
  const genericCases = [
    { sub: 'spanish.srt', expectedLang: 'es', expectedLabel: 'Español (Predeterminado)' },
    { sub: 'castellano.srt', expectedLang: 'es', expectedLabel: 'Español (Predeterminado)' },
    { sub: 'es.srt', expectedLang: 'es', expectedLabel: 'Español (Predeterminado)' },
    { sub: 'spa.srt', expectedLang: 'es', expectedLabel: 'Español (Predeterminado)' },
    { sub: 'esp.srt', expectedLang: 'es', expectedLabel: 'Español (Predeterminado)' },
    { sub: 'espanol.srt', expectedLang: 'es', expectedLabel: 'Español (Predeterminado)' },
    { sub: 'español.srt', expectedLang: 'es', expectedLabel: 'Español (Predeterminado)' },
    { sub: 'es-la.srt', expectedLang: 'es-LA', expectedLabel: 'Español (Latino)' },
    { sub: 'es-419.srt', expectedLang: 'es-LA', expectedLabel: 'Español (Latino)' },
    { sub: 'latino.srt', expectedLang: 'es-LA', expectedLabel: 'Español (Latino)' },
    { sub: 'lat.srt', expectedLang: 'es-LA', expectedLabel: 'Español (Latino)' },
    { sub: 'sub.srt', expectedLang: 'es', expectedLabel: 'Español (Predeterminado)' },
    { sub: 'subs.srt', expectedLang: 'es', expectedLabel: 'Español (Predeterminado)' },
    { sub: 'subtitles.srt', expectedLang: 'es', expectedLabel: 'Español (Predeterminado)' },
    { sub: 'subtitulo.srt', expectedLang: 'es', expectedLabel: 'Español (Predeterminado)' },
    { sub: 'subtitulos.srt', expectedLang: 'es', expectedLabel: 'Español (Predeterminado)' },
  ];

  for (const item of genericCases) {
    const matches = matchSubtitlesForVideo('Inception.2010.mkv', [
      { id: 'sub_gen', name: item.sub },
    ]);
    assert.equal(matches.length, 1, `Generic single subtitle ${item.sub} must match`);
    assert.equal(matches[0].isDefault, true, `Single generic subtitle ${item.sub} must be default`);
    assert.equal(matches[0].lang, item.expectedLang, `Language code must match ${item.expectedLang}`);
    assert.equal(matches[0].label, item.expectedLabel, `Label must match ${item.expectedLabel}`);
  }
});

test('Subtitle Matcher Rule 3 [Stress]: Single subtitle with clean video title prefix + valid qualifiers', () => {
  const validPrefixedCases = [
    {
      video: 'Gladiator.2000.1080p.mkv',
      sub: 'Gladiator.es.srt',
      expectedLang: 'es',
      expectedForced: false,
    },
    {
      video: 'Gladiator.2000.1080p.mkv',
      sub: 'Gladiator.es.forced.srt',
      expectedLang: 'es',
      expectedForced: true,
    },
    {
      video: 'Gladiator.2000.1080p.mkv',
      sub: 'Gladiator.es-la.srt',
      expectedLang: 'es-LA',
      expectedForced: false,
    },
    {
      video: 'Gladiator.2000.1080p.mkv',
      sub: 'Gladiator.2000.castellano.vtt',
      expectedLang: 'es',
      expectedForced: false,
    },
  ];

  for (const item of validPrefixedCases) {
    const matches = matchSubtitlesForVideo(item.video, [{ id: 'sub_pref', name: item.sub }]);
    assert.equal(matches.length, 1, `Subtitle ${item.sub} for video ${item.video} must match`);
    assert.equal(matches[0].lang, item.expectedLang);
    assert.equal(matches[0].isForced, item.expectedForced);
    assert.equal(matches[0].isDefault, true);
  }
});

test('Subtitle Matcher Rule 3 [Stress]: Deterministic default track selection across diverse candidates', () => {
  const candidates = [
    { id: 'sub_en_srt', name: 'Movie.en.srt' },
    { id: 'sub_en_vtt', name: 'Movie.en.vtt' },
    { id: 'sub_es_forced', name: 'Movie.es.forced.srt' },
    { id: 'sub_es_srt', name: 'Movie.es.srt' },
    { id: 'sub_es_vtt', name: 'Movie.es.vtt' },
  ];

  const matches = matchSubtitlesForVideo('Movie.mkv', candidates);
  assert.equal(matches.length, 5);

  const defaults = matches.filter((m) => m.isDefault);
  assert.equal(defaults.length, 1, 'Exactly one track must be marked as default');
  // Highest priority: Spanish (100) + Full (40) + WebVTT (20) = 160 -> Movie.es.vtt
  assert.equal(defaults[0].id, 'sub_es_vtt', 'Movie.es.vtt must be chosen as default track');
  assert.equal(defaults[0].label, 'Español (Predeterminado)');
});
