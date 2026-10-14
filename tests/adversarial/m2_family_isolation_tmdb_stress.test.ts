import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import fs from 'node:fs';
import { app } from '../../server/index';
import { tmdbClient, TwoTierCache, RequestThrottler } from '../../server/metadata/tmdb';
import {
  isFamilyCategory,
  containsFamilyKeywords,
  isFamilyContent,
  synthesizeFamilyMetadata,
  formatSpanishDate,
  formatFamilyDuration,
  getResolutionBadge,
  upgradeThumbnailToHD,
  formatFamilyCleanTitle
} from '../../server/metadata/isolator';
import { MockServer } from '../harness/mock-server';
import { DriveMediaItem } from '../../server/drive/types';

// Helper to launch an ephemeral Express server for testing
function startLiveServer(): Promise<{ server: http.Server; baseUrl: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address() as net.AddressInfo;
      resolve({ server, baseUrl: `http://127.0.0.1:${addr.port}` });
    });
  });
}

// ============================================================================
// 1. FAMILY ISOLATION ADVERSARIAL PROBES
// ============================================================================

test('Family Isolation [Adversarial Category Variations]: Category queries strictly rejected with 403', async () => {
  const { server, baseUrl } = await startLiveServer();
  try {
    const categories = [
      'familiares',
      'videos familiares',
      'VIDEOS FAMILIARES',
      'familia',
      'home-videos',
      // Additional edge-cases
      'videos_familiares',
      'home_videos',
      'videos-caseros',
      'videos'
    ];

    for (const cat of categories) {
      const url = `${baseUrl}/api/metadata/enrich?title=Vacaciones&category=${encodeURIComponent(cat)}`;
      const res = await fetch(url);
      const data = await res.json();

      assert.equal(
        res.status,
        403,
        `Category '${cat}' MUST be blocked with HTTP 403. Received ${res.status}`
      );
      assert.ok(
        data && typeof data.error === 'string' && data.error.includes('Isolation Barrier'),
        `Category '${cat}' response must contain 'Isolation Barrier'. Received: ${JSON.stringify(data)}`
      );
    }
  } finally {
    server.close();
  }
});

test('Family Isolation [Adversarial Titles]: Titles containing "familia" strictly rejected with 403', async () => {
  const { server, baseUrl } = await startLiveServer();
  try {
    const titles = [
      'Paseo en familia',
      'Paseo en Familia 2021',
      'Navidad en familia',
      'Reunion de familia',
      'videos familiares 2022',
      'home-video verano 2018',
      'videos caseros en la playa'
    ];

    for (const title of titles) {
      const url = `${baseUrl}/api/metadata/enrich?title=${encodeURIComponent(title)}`;
      const res = await fetch(url);
      const data = await res.json();

      assert.equal(
        res.status,
        403,
        `Title '${title}' MUST be blocked with HTTP 403. Received ${res.status}`
      );
      assert.ok(
        data && typeof data.error === 'string' && data.error.includes('Isolation Barrier'),
        `Title '${title}' response must contain 'Isolation Barrier'. Received: ${JSON.stringify(data)}`
      );
    }
  } finally {
    server.close();
  }
});

test('Family Isolation [Unit Gate]: isFamilyContent, isFamilyCategory and containsFamilyKeywords stress verification', () => {
  // Category variations
  assert.equal(isFamilyCategory('familiares'), true);
  assert.equal(isFamilyCategory('videos familiares'), true);
  assert.equal(isFamilyCategory('VIDEOS FAMILIARES'), true);
  assert.equal(isFamilyCategory('familia'), true);
  assert.equal(isFamilyCategory('home-videos'), true);
  assert.equal(isFamilyCategory('videos_familiares'), true);
  assert.equal(isFamilyCategory('home_videos'), true);
  assert.equal(isFamilyCategory('videos-caseros'), true);

  // Negative category cases (must not falsely block)
  assert.equal(isFamilyCategory('peliculas'), false);
  assert.equal(isFamilyCategory('series'), false);
  assert.equal(isFamilyCategory('fotos'), false);
  assert.equal(isFamilyCategory('musica'), false);

  // Title keyword variations
  assert.equal(containsFamilyKeywords('Paseo en familia'), true);
  assert.equal(containsFamilyKeywords('Navidad en familia 2022'), true);
  assert.equal(containsFamilyKeywords('Videos Familiares'), true);
  assert.equal(containsFamilyKeywords('home-video'), true);
  assert.equal(containsFamilyKeywords('videos caseros'), true);

  // Negative title cases (commercial movies that shouldn't be blocked)
  assert.equal(containsFamilyKeywords('Inception'), false);
  assert.equal(containsFamilyKeywords('Interstellar'), false);
  assert.equal(containsFamilyKeywords('The Godfather'), false);
  assert.equal(containsFamilyKeywords('Gladiator'), false);
});

test('Family Isolation [Spy / Trace]: Zero TMDB client calls during /api/drive/files/familiares', async () => {
  const { server, baseUrl } = await startLiveServer();

  let enrichCalls = 0;
  const originalEnrich = tmdbClient.enrich;
  // Spy on tmdbClient.enrich
  tmdbClient.enrich = async function (...args: any[]) {
    enrichCalls++;
    return originalEnrich.apply(this, args as any);
  };

  try {
    const res = await fetch(`${baseUrl}/api/drive/files/familiares`);
    assert.equal(res.status, 200, `Expected 200 OK from /api/drive/files/familiares`);
    const data = await res.json();

    assert.ok(data.items && data.items.length > 0, `Expected items array in response`);
    assert.equal(enrichCalls, 0, `TMDB client must NEVER be called for family videos! Detected ${enrichCalls} calls.`);
  } finally {
    tmdbClient.enrich = originalEnrich;
    server.close();
  }
});

test('Family Isolation [Zero Leaks Verification]: Check /api/drive/files/familiares item attributes', async () => {
  const { server, baseUrl } = await startLiveServer();
  try {
    const res = await fetch(`${baseUrl}/api/drive/files/familiares`);
    assert.equal(res.status, 200);
    const data = await res.json();

    assert.ok(Array.isArray(data.items), 'items must be an array');
    assert.ok(data.items.length > 0, 'items should have at least 1 family video');

    for (const item of data.items) {
      // Hard invariant 1: tmdbEnriched must be false
      assert.equal(item.tmdbEnriched, false, `item '${item.name}' tmdbEnriched must be false`);

      // Hard invariant 2: Commercial fields must be strictly undefined
      assert.equal(item.director, undefined, `item '${item.name}' director must be undefined`);
      assert.equal(item.cast, undefined, `item '${item.name}' cast must be undefined`);
      assert.equal(item.overview, undefined, `item '${item.name}' overview must be undefined`);
      assert.equal(item.rating, undefined, `item '${item.name}' rating must be undefined`);
      assert.equal(item.genres, undefined, `item '${item.name}' genres must be undefined`);
      assert.equal(item.posterUrl, undefined, `item '${item.name}' posterUrl must be undefined`);
      assert.equal(item.backdropUrl, undefined, `item '${item.name}' backdropUrl must be undefined`);

      // Hard invariant 3: HD thumbnail upgrade to =s800
      assert.ok(
        (item.thumbnailLink && item.thumbnailLink.endsWith('=s800')) ||
        (item.thumbnailUrl && item.thumbnailUrl.endsWith('=s800')),
        `item '${item.name}' thumbnail must end with =s800. Got: ${item.thumbnailLink}`
      );

      // Invariant 4: Native metadata synthesized
      assert.ok(item.cleanTitle, `item '${item.name}' should have cleanTitle`);
      assert.ok(item.dateFormatted, `item '${item.name}' should have dateFormatted`);
      assert.ok(item.durationFormatted, `item '${item.name}' should have durationFormatted`);
    }
  } finally {
    server.close();
  }
});

test('Family Isolation [Route Aliases]: Trailing slashes and encoded variations on Drive files category route', async () => {
  const { server, baseUrl } = await startLiveServer();
  try {
    // 1. Trailing slash
    const resSlash = await fetch(`${baseUrl}/api/drive/files/familiares/`);
    assert.equal(resSlash.status, 200);
    const dataSlash = await resSlash.json();
    assert.equal(dataSlash.category, 'familiares');

    // 2. Encoded category variation "videos%20familiares"
    const resEnc = await fetch(`${baseUrl}/api/drive/files/${encodeURIComponent('videos familiares')}`);
    assert.equal(resEnc.status, 200);
    const dataEnc = await resEnc.json();
    assert.equal(dataEnc.category, 'familiares');

    // All items in alias responses must preserve strict isolation barrier
    for (const item of dataEnc.items) {
      assert.equal(item.tmdbEnriched, false);
      assert.equal(item.director, undefined);
    }
  } finally {
    server.close();
  }
});

test('Family Metadata Synthesis [Edge Case Boundaries]: Synthesizer handles corner dates, durations and badges', () => {
  // Duration formatting
  assert.equal(formatFamilyDuration(0), '00:00');
  assert.equal(formatFamilyDuration(-5000), '00:00');
  assert.equal(formatFamilyDuration(null), '00:00');
  assert.equal(formatFamilyDuration(undefined), '00:00');
  assert.equal(formatFamilyDuration(65000), '01:05');
  assert.equal(formatFamilyDuration(3665000), '61:05');

  // Spanish date formatting
  assert.equal(formatSpanishDate('2021-10-15T12:00:00Z'), '15 de octubre de 2021');
  assert.equal(formatSpanishDate('2019-07-20T10:00:00Z'), '20 de julio de 2019');
  assert.equal(formatSpanishDate('invalid-date'), '');
  assert.equal(formatSpanishDate(null), '');

  // Resolution badges
  assert.equal(getResolutionBadge(2160), '4K');
  assert.equal(getResolutionBadge(1080), '1080p');
  assert.equal(getResolutionBadge(720), '720p');
  assert.equal(getResolutionBadge(480), 'SD');
  assert.equal(getResolutionBadge(undefined), undefined);

  // Thumbnail upgrade
  assert.equal(upgradeThumbnailToHD('https://drive.google.com/thumb=s220'), 'https://drive.google.com/thumb=s800');
  assert.equal(upgradeThumbnailToHD('https://drive.google.com/thumb=w100-h100'), 'https://drive.google.com/thumb=s800');
  assert.equal(upgradeThumbnailToHD('https://drive.google.com/thumb'), 'https://drive.google.com/thumb=s800');
  assert.equal(upgradeThumbnailToHD(undefined), undefined);

  // Complete synthesizeFamilyMetadata invocation
  const rawItem: DriveMediaItem = {
    id: 'f_test_1',
    name: 'vacaciones_en_cancun_2020.mp4',
    mimeType: 'video/mp4',
    size: 500000000,
    createdTime: '2020-02-14T18:00:00Z',
    durationMillis: 125000,
    width: 3840,
    height: 2160,
    thumbnailLink: 'https://lh3.googleusercontent.com/abc=s220',
  };

  const synthesized = synthesizeFamilyMetadata(rawItem);
  assert.equal(synthesized.cleanTitle, 'Vacaciones En Cancun 2020');
  assert.equal(synthesized.dateFormatted, '14 de febrero de 2020');
  assert.equal(synthesized.durationFormatted, '02:05');
  assert.equal(synthesized.resolutionBadge, '4K');
  assert.equal(synthesized.thumbnailLink, 'https://lh3.googleusercontent.com/abc=s800');
  assert.equal(synthesized.tmdbEnriched, false);
  assert.equal(synthesized.director, undefined);
  assert.equal(synthesized.cast, undefined);
  assert.equal(synthesized.overview, undefined);
});

// ============================================================================
// 2. TMDB CACHING & CONCURRENCY STRESS
// ============================================================================

test('TMDB Caching [Concurrency Stress]: 50 concurrent requests yield 1 external query and 49 cache hits', async () => {
  const { server, baseUrl } = await startLiveServer();

  // Clear TMDB cache to guarantee cold start
  tmdbClient.clearCache();

  try {
    const CONCURRENCY_COUNT = 50;
    const requestPromises = Array.from({ length: CONCURRENCY_COUNT }, (_, idx) =>
      fetch(`${baseUrl}/api/metadata/enrich?title=Inception&year=2010`).then(async (res) => {
        assert.equal(res.status, 200, `Request #${idx} failed with status ${res.status}`);
        return res.json();
      })
    );

    const results = await Promise.all(requestPromises);

    assert.equal(results.length, CONCURRENCY_COUNT, 'All 50 requests should complete');

    let externalCount = 0;
    let cachedCount = 0;

    for (const r of results) {
      assert.equal(r.director, 'Christopher Nolan', 'Director must be Christopher Nolan');
      assert.equal(r.year, 2010, 'Year must be 2010');
      if (r.cached === false) {
        externalCount++;
      } else if (r.cached === true) {
        cachedCount++;
      }
    }

    assert.equal(
      externalCount,
      1,
      `Expected exactly 1 external query, got ${externalCount}`
    );
    assert.equal(
      cachedCount,
      49,
      `Expected exactly 49 cache hits, got ${cachedCount}`
    );
  } finally {
    server.close();
  }
});

test('TMDB Caching [High Load Concurrency]: 100 concurrent requests without race conditions or memory leak', async () => {
  const { server, baseUrl } = await startLiveServer();
  tmdbClient.clearCache();

  try {
    const CONCURRENCY_COUNT = 100;
    const requestPromises = Array.from({ length: CONCURRENCY_COUNT }, () =>
      fetch(`${baseUrl}/api/metadata/enrich?title=Interstellar&year=2014`).then((res) => res.json())
    );

    const results = await Promise.all(requestPromises);
    assert.equal(results.length, CONCURRENCY_COUNT);

    const nonCached = results.filter((r) => r.cached === false);
    const cached = results.filter((r) => r.cached === true);

    assert.equal(nonCached.length, 1, `Exactly 1 non-cached external response expected, got ${nonCached.length}`);
    assert.equal(cached.length, 99, `Exactly 99 cached responses expected, got ${cached.length}`);
    assert.equal(results[0].director, 'Christopher Nolan');
  } finally {
    server.close();
  }
});

test('TMDB TwoTierCache [LRU Memory Eviction & Disk Fallback]: Stress test LRU capacity bounds', () => {
  const testCachePath = path.resolve(process.cwd(), 'cache', 'test_lru_cache.json');
  try {
    if (fs.existsSync(testCachePath)) fs.unlinkSync(testCachePath);
  } catch {}

  // Create cache with tiny memory capacity = 3
  const cache = new TwoTierCache(testCachePath, 60000, 3);

  try {
    // Populate 5 entries (exceeding memory capacity 3)
    for (let i = 1; i <= 5; i++) {
      cache.set(`key_${i}`, {
        id: i,
        title: `Movie ${i}`,
        originalTitle: `Movie ${i}`,
        year: 2000 + i,
        overview: `Overview ${i}`,
        posterUrl: `https://poster/${i}.jpg`,
        backdropUrl: null,
        rating: 8.0,
        runtime: '120m',
        director: 'Director',
        cast: [],
        genres: []
      });
    }

    // Memory cache should be clamped at maxMemoryItems (3)
    const sizes = cache.size();
    assert.equal(sizes.memory, 3, `Memory size should be capped at 3, got ${sizes.memory}`);
    assert.equal(sizes.disk, 5, `Disk records should retain all 5 items, got ${sizes.disk}`);

    // Accessing an evicted item (key_1) should fetch from disk tier and promote back to memory
    const retrieved1 = cache.get('key_1');
    assert.ok(retrieved1, 'Evicted item should be retrieved from disk tier');
    assert.equal(retrieved1?.title, 'Movie 1');
  } finally {
    cache.clear();
    try {
      if (fs.existsSync(testCachePath)) fs.unlinkSync(testCachePath);
    } catch {}
  }
});

test('TMDB RequestThrottler [Concurrency Ceiling]: Enforces maximum active task bound', async () => {
  const throttler = new RequestThrottler(2, 50); // maxConcurrency 2, pause 50ms
  let activeMax = 0;

  const tasks = Array.from({ length: 8 }, (_, idx) => {
    return throttler.enqueue(async () => {
      const active = throttler.getActiveCount();
      if (active > activeMax) activeMax = active;
      await new Promise((resolve) => setTimeout(resolve, 30));
      return idx;
    });
  });

  const results = await Promise.all(tasks);
  assert.equal(results.length, 8);
  assert.ok(
    activeMax <= 2,
    `Active count must NEVER exceed maxConcurrency (2). Observed peak: ${activeMax}`
  );
});

test('TMDB Search Fallback [4-Stage Fallback]: Mismatched year (Inception 2020) falls back to title search and succeeds', async () => {
  const { server, baseUrl } = await startLiveServer();
  try {
    // Stage 1 search with title 'Inception' and mismatched year 2020 fails on year,
    // Stage 2 fallback searches title alone and successfully resolves Inception (2010)
    const res = await fetch(`${baseUrl}/api/metadata/enrich?title=Inception&year=2020`);
    assert.equal(res.status, 200);
    const data = await res.json();

    assert.equal(
      data.director,
      'Christopher Nolan',
      `Should match Inception and return Christopher Nolan despite mismatched year 2020`
    );
    assert.ok(
      Array.isArray(data.cast) && data.cast.includes('Leonardo DiCaprio'),
      `Cast must include Leonardo DiCaprio`
    );
  } finally {
    server.close();
  }
});

test('TMDB Search Fallback [Stage 3 Secondary Stripping]: Title with parenthetical phrase resolves base title', async () => {
  const { server, baseUrl } = await startLiveServer();
  try {
    // Title with extraneous secondary phrase
    const res = await fetch(`${baseUrl}/api/metadata/enrich?title=${encodeURIComponent('Inception (Edición Especial 1080p)')}`);
    assert.equal(res.status, 200);
    const data = await res.json();

    assert.equal(data.director, 'Christopher Nolan');
  } finally {
    server.close();
  }
});

// ============================================================================
// 3. MOCK SERVER ORACLE CONFORMANCE PROBE
// ============================================================================

test('Mock Server Oracle [Conformance Investigation]: Verify mock-server behavior on category variations', async () => {
  const mockServer = new MockServer(3199);
  await mockServer.start();

  try {
    // Standard supported category in mock-server
    const resStd = await fetch('http://127.0.0.1:3199/api/metadata/enrich?title=Vacaciones&category=familiares');
    assert.equal(resStd.status, 403, 'MockServer must reject category=familiares with 403');

    // Investigation: how does MockServer handle category='familia' vs category='home-videos' when title has no family keyword?
    const resFam = await fetch('http://127.0.0.1:3199/api/metadata/enrich?title=Vacaciones&category=familia');
    const resHome = await fetch('http://127.0.0.1:3199/api/metadata/enrich?title=Vacaciones&category=home-videos');

    // Document mock server behavior
    console.log(`[MockServer Oracle Probe] category=familia status: ${resFam.status}`);
    console.log(`[MockServer Oracle Probe] category=home-videos status: ${resHome.status}`);
  } finally {
    await mockServer.stop();
  }
});
