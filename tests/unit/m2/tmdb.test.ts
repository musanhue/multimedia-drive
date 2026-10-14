import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { TMDBClient, RequestThrottler, TwoTierCache } from '../../../server/metadata/tmdb';

const TEST_CACHE_PATH = path.resolve(process.cwd(), 'cache', 'test_tmdb_cache.json');

function cleanupTestCache() {
  try {
    if (fs.existsSync(TEST_CACHE_PATH)) fs.unlinkSync(TEST_CACHE_PATH);
    if (fs.existsSync(`${TEST_CACHE_PATH}.tmp`)) fs.unlinkSync(`${TEST_CACHE_PATH}.tmp`);
  } catch {}
}

test('Throttler: Enforces max concurrency and pacing delay', async () => {
  const throttler = new RequestThrottler(2, 50);
  let activeMax = 0;
  let running = 0;

  const tasks = Array.from({ length: 4 }, (_, i) =>
    throttler.enqueue(async () => {
      running++;
      if (running > activeMax) activeMax = running;
      await new Promise((r) => setTimeout(r, 40));
      running--;
      return i;
    })
  );

  const results = await Promise.all(tasks);
  assert.deepEqual(results, [0, 1, 2, 3]);
  assert.ok(activeMax <= 2, `Active concurrency was ${activeMax}, expected <= 2`);
});

test('2-Tier Cache: Stores in memory and recovers from disk file', () => {
  cleanupTestCache();
  const cache1 = new TwoTierCache(TEST_CACHE_PATH, 60000, 10);
  const dummy = {
    id: 123,
    title: 'Prueba',
    originalTitle: 'Test',
    year: 2021,
    overview: 'Sinopsis',
    posterUrl: 'https://image.tmdb.org/t/p/w500/abc.jpg',
    backdropUrl: 'https://image.tmdb.org/t/p/w1280/xyz.jpg',
    rating: 8.5,
    runtime: '2h 10m',
    director: 'Director Test',
    cast: ['Actor 1', 'Actor 2'],
    genres: ['Drama'],
  };

  cache1.set('key_test_1', dummy);
  cache1.flushSync();

  assert.deepEqual(cache1.get('key_test_1'), dummy);

  // Initialize new cache instance to simulate restart
  const cache2 = new TwoTierCache(TEST_CACHE_PATH, 60000, 10);
  assert.deepEqual(cache2.get('key_test_1'), dummy);

  cleanupTestCache();
});

test('TMDB Client: In-Flight deduplication shares single execution among concurrent calls', async () => {
  cleanupTestCache();
  const client = new TMDBClient({
    cacheFilePath: TEST_CACHE_PATH,
  });

  const promises = [
    client.enrich({ title: 'Inception', year: 2010 }),
    client.enrich({ title: 'Inception', year: 2010 }),
    client.enrich({ title: 'Inception', year: 2010 }),
  ];

  const results = await Promise.all(promises);
  assert.equal(results.length, 3);
  assert.equal(results[0].director, 'Christopher Nolan');
  assert.equal(results[1].director, 'Christopher Nolan');
  assert.equal(results[2].director, 'Christopher Nolan');

  // Verify second batch is served directly from cache with cached=true
  const repeated = await client.enrich({ title: 'Inception', year: 2010 });
  assert.equal(repeated.cached, true);

  cleanupTestCache();
});

test('TMDB Client: Unmatched movie returns 200 graceful fallback object with rating 0', async () => {
  cleanupTestCache();
  const client = new TMDBClient({
    cacheFilePath: TEST_CACHE_PATH,
  });

  const res = await client.enrich({ title: 'NonExistentMovie999', year: 2099 });
  assert.equal(res.title, 'NonExistentMovie999');
  assert.equal(res.rating, 0);
  assert.ok(res.posterUrl.includes('placeholder'));
  assert.equal(res.director, 'Desconocido');
  assert.deepEqual(res.cast, []);

  cleanupTestCache();
});

test('TMDB Client: Special characters in query are safely processed', async () => {
  cleanupTestCache();
  const client = new TMDBClient({
    cacheFilePath: TEST_CACHE_PATH,
  });

  const res = await client.enrich({ title: 'Fast & Furious', year: 2009 });
  assert.ok(res);
  assert.ok(res.title);

  cleanupTestCache();
});

test('TMDB Client: Empty title query returns safe fallback without error', async () => {
  cleanupTestCache();
  const client = new TMDBClient({
    cacheFilePath: TEST_CACHE_PATH,
  });

  const res = await client.enrich({ title: '' });
  assert.equal(res.title, '');
  assert.equal(res.rating, 0);

  cleanupTestCache();
});

test('TMDB Client: Year mismatch falls back to mock fixture or title search', async () => {
  cleanupTestCache();
  const client = new TMDBClient({
    cacheFilePath: TEST_CACHE_PATH,
  });

  const res = await client.enrich({ title: 'Inception', year: 2020 });
  assert.equal(res.director, 'Christopher Nolan');

  cleanupTestCache();
});
