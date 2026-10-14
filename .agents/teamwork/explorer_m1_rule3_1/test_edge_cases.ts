import assert from 'node:assert/strict';
import { matchSubtitlesForVideoProposed } from './test_proposed';

// Test edge cases
console.log('--- Additional Edge Case Tests ---');

// es-419.srt
const t_419 = matchSubtitlesForVideoProposed('Movie.mkv', [{ id: '1', name: 'es-419.srt' }]);
assert.equal(t_419.length, 1);
assert.equal(t_419[0].lang, 'es-LA');
assert.equal(t_419[0].label, 'Español (Latino)');
console.log('PASS: es-419.srt maps to es-LA');

// espanol.srt
const t_esp = matchSubtitlesForVideoProposed('Movie.mkv', [{ id: '1', name: 'espanol.srt' }]);
assert.equal(t_esp.length, 1);
assert.equal(t_esp[0].lang, 'es');
console.log('PASS: espanol.srt maps to es');

// spanish.forced.srt
const t_forced = matchSubtitlesForVideoProposed('Movie.mkv', [{ id: '1', name: 'spanish.forced.srt' }]);
assert.equal(t_forced.length, 1);
assert.equal(t_forced[0].isForced, true);
assert.equal(t_forced[0].label, 'Español (Forzados)');
console.log('PASS: spanish.forced.srt maps to forced');

// Gladiator.es.srt for Gladiator.2000.1080p.mkv
const t_glad_es = matchSubtitlesForVideoProposed('Gladiator.2000.1080p.mkv', [{ id: '1', name: 'Gladiator.es.srt' }]);
assert.equal(t_glad_es.length, 1);
assert.equal(t_glad_es[0].lang, 'es');
console.log('PASS: Gladiator.es.srt matches Gladiator.2000.1080p.mkv');

// Alien sequels
const t_alien = matchSubtitlesForVideoProposed('Alien.1979.mkv', [{ id: '1', name: 'Alien.3.1992.srt' }]);
assert.equal(t_alien.length, 0);
console.log('PASS: Alien.3.1992.srt rejected for Alien.1979.mkv');

const t_aliens = matchSubtitlesForVideoProposed('Alien.1979.mkv', [{ id: '1', name: 'Aliens.1986.srt' }]);
assert.equal(t_aliens.length, 0);
console.log('PASS: Aliens.1986.srt rejected for Alien.1979.mkv');

// Terminator sequels
const t_term = matchSubtitlesForVideoProposed('Terminator.1984.mkv', [{ id: '1', name: 'Terminator.2.Judgment.Day.1991.srt' }]);
assert.equal(t_term.length, 0);
console.log('PASS: Terminator 2 rejected for Terminator (1984)');

console.log('ALL EDGE CASES PASSED!');
