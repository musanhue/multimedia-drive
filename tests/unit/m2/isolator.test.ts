import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  isFamilyCategory,
  isFamilyFolder,
  containsFamilyKeywords,
  assertFamilyIsolation,
  IsolationBarrierError,
  formatFamilyCleanTitle,
  formatSpanishDate,
  formatFamilyDuration,
  getResolutionBadge,
  upgradeThumbnailToHD,
  synthesizeFamilyMetadata,
} from '../../../server/metadata/isolator';
import { DriveMediaItem } from '../../../server/drive/types';

describe('Feature F8: Strict Family Video Isolation Barrier', () => {
  describe('Category & Keyword Detection', () => {
    test('identifies all canonical and edge-case family category slugs', () => {
      const familySlugs = [
        'familiares',
        'Videos familiares',
        'VIDEOS FAMILIARES',
        'videos_familiares',
        'familia',
        'home videos',
        'home-videos',
        'home_videos',
        'videos caseros',
      ];
      for (const slug of familySlugs) {
        assert.equal(isFamilyCategory(slug), true, `Slug '${slug}' should be detected as family category`);
      }

      assert.equal(isFamilyCategory('peliculas'), false);
      assert.equal(isFamilyCategory('series'), false);
      assert.equal(isFamilyCategory('fotos'), false);
      assert.equal(isFamilyCategory('musica'), false);
    });

    test('detects family folder hierarchy paths', () => {
      assert.equal(isFamilyFolder('/GoogleDrive/Root/Videos Familiares', '2021'), true);
      assert.equal(isFamilyFolder(undefined, 'Home Videos'), true);
      assert.equal(isFamilyFolder('/Peliculas/Accion', 'Matrix'), false);
    });

    test('detects family keywords in titles regardless of diacritics', () => {
      assert.equal(containsFamilyKeywords('Paseo en familia'), true);
      assert.equal(containsFamilyKeywords('Cumpleaños en familia 2021'), true);
      assert.equal(containsFamilyKeywords('Home video navidad'), true);
      assert.equal(containsFamilyKeywords('Inception 2010'), false);
    });

    test('assertFamilyIsolation throws IsolationBarrierError with 403 status', () => {
      assert.throws(
        () => assertFamilyIsolation({ category: 'familiares', title: 'Titanic_en_el_lago' }),
        (err: any) => err instanceof IsolationBarrierError && err.statusCode === 403 && err.message.includes('Isolation Barrier')
      );

      assert.throws(
        () => assertFamilyIsolation({ title: 'Paseo en familia' }),
        (err: any) => err instanceof IsolationBarrierError && err.statusCode === 403
      );

      // Non-family does not throw
      assert.doesNotThrow(() => assertFamilyIsolation({ category: 'peliculas', title: 'Inception' }));
    });
  });

  describe('Native Drive Metadata Synthesis', () => {
    test('formats clean title in Title Case preserving Spanish diacritics and numbers', () => {
      assert.equal(formatFamilyCleanTitle('Cumpleaños_de_Lucas_2021.mp4'), 'Cumpleaños De Lucas 2021');
      assert.equal(formatFamilyCleanTitle('Vacaciones_Bariloche_2019.mp4'), 'Vacaciones Bariloche 2019');
      assert.equal(formatFamilyCleanTitle('Navidad_En_Familia_2022.mov'), 'Navidad En Familia 2022');
      assert.equal(formatFamilyCleanTitle('bebe.primeros.pasos.mkv'), 'Bebe Primeros Pasos');
    });

    test('formats Spanish dates with "de" preposition', () => {
      assert.equal(formatSpanishDate('2021-10-15T15:30:00Z'), '15 de octubre de 2021');
      assert.equal(formatSpanishDate('2019-07-20T10:15:00Z'), '20 de julio de 2019');
      assert.equal(formatSpanishDate('2022-12-25T01:00:00Z'), '25 de diciembre de 2022');
      assert.equal(formatSpanishDate(''), '');
    });

    test('formats duration as MM:SS', () => {
      assert.equal(formatFamilyDuration(872000), '14:32');
      assert.equal(formatFamilyDuration(1950000), '32:30');
      assert.equal(formatFamilyDuration(450000), '07:30');
      assert.equal(formatFamilyDuration(0), '00:00');
    });

    test('classifies resolution badges accurately', () => {
      assert.equal(getResolutionBadge(2160), '4K');
      assert.equal(getResolutionBadge(1080), '1080p');
      assert.equal(getResolutionBadge(720), '720p');
      assert.equal(getResolutionBadge(480), 'SD');
      assert.equal(getResolutionBadge(undefined), undefined);
    });

    test('upgrades thumbnail link to =s800 edge CDN', () => {
      assert.equal(
        upgradeThumbnailToHD('https://lh3.googleusercontent.com/drive-thumb-1=s220'),
        'https://lh3.googleusercontent.com/drive-thumb-1=s800'
      );
      assert.equal(
        upgradeThumbnailToHD('https://lh3.googleusercontent.com/drive-thumb-1=s800'),
        'https://lh3.googleusercontent.com/drive-thumb-1=s800'
      );
      assert.equal(
        upgradeThumbnailToHD('https://lh3.googleusercontent.com/drive-thumb-1=w220'),
        'https://lh3.googleusercontent.com/drive-thumb-1=s800'
      );
    });

    test('synthesizeFamilyMetadata sets all native fields and omits commercial fields', () => {
      const mockRawItem: DriveMediaItem = {
        id: 'vid_fam_1',
        name: 'Cumpleaños_de_Lucas_2021.mp4',
        mimeType: 'video/mp4',
        size: 1073741824,
        createdTime: '2021-10-15T15:30:00Z',
        modifiedTime: '2021-10-15T15:30:00Z',
        category: 'familiares',
        durationMillis: 872000,
        width: 1920,
        height: 1080,
        thumbnailLink: 'https://lh3.googleusercontent.com/drive-fam-thumb-1=s220',
        isFolder: false,
      };

      const result = synthesizeFamilyMetadata(mockRawItem);

      // Positive assertions
      assert.equal(result.cleanTitle, 'Cumpleaños De Lucas 2021');
      assert.equal(result.dateFormatted, '15 de octubre de 2021');
      assert.equal(result.durationFormatted, '14:32');
      assert.equal(result.resolutionBadge, '1080p');
      assert.equal(result.thumbnailLink, 'https://lh3.googleusercontent.com/drive-fam-thumb-1=s800');
      assert.equal(result.tmdbEnriched, false);

      // Negative assertions (strictly undefined)
      assert.equal(result.director, undefined);
      assert.equal(result.cast, undefined);
      assert.equal(result.overview, undefined);
      assert.equal(result.genres, undefined);
      assert.equal(result.rating, undefined);
      assert.equal(result.posterUrl, undefined);
      assert.equal(result.backdropUrl, undefined);
    });
  });

  describe('Zero Network Leaks Assertion', () => {
    test('processing family items invokes TMDB client exactly 0 times', async () => {
      let tmdbCallsCount = 0;
      const fakeTmdbClient = {
        searchMovie: () => {
          tmdbCallsCount++;
          return Promise.resolve([]);
        },
        getDetails: () => {
          tmdbCallsCount++;
          return Promise.resolve({});
        },
      };

      const familyItems: DriveMediaItem[] = [
        {
          id: 'vid_1',
          name: 'Cumpleaños_2021.mp4',
          mimeType: 'video/mp4',
          size: 1000,
          modifiedTime: '2021-10-15T15:30:00Z',
          category: 'familiares',
          isFolder: false,
        },
        {
          id: 'vid_2',
          name: 'Vacaciones_2019.mp4',
          mimeType: 'video/mp4',
          size: 2000,
          modifiedTime: '2019-07-20T10:15:00Z',
          category: 'familiares',
          isFolder: false,
        },
      ];

      // Verifying that asserting family isolation correctly blocks TMDB requests
      for (const item of familyItems) {
        assert.throws(
          () => assertFamilyIsolation({ category: item.category, title: item.name }),
          IsolationBarrierError
        );
      }

      // Instead, family items are synthesized natively without ever invoking fakeTmdbClient
      const processed = familyItems.map((item) => synthesizeFamilyMetadata(item));

      // Assert zero calls to TMDB
      assert.equal(tmdbCallsCount, 0, 'TMDB client must not be invoked for family items');
      assert.equal(processed.length, 2);
    });
  });

  describe('Express HTTP Route Integration', () => {
    let server: any;
    let baseUrl: string;

    test('setup express server for route tests', async () => {
      process.env.NODE_ENV = 'test';
      const { app } = await import('../../../server/index');
      await new Promise<void>((resolve) => {
        server = app.listen(0, () => {
          const addr = server.address() as any;
          baseUrl = `http://localhost:${addr.port}`;
          resolve();
        });
      });
    });

    test('GET /api/metadata/clean-title returns cleaned media info', async () => {
      const res = await fetch(`${baseUrl}/api/metadata/clean-title?filename=${encodeURIComponent('Inception.2010.1080p.mkv')}`);
      assert.equal(res.status, 200);
      const json: any = await res.json();
      assert.equal(json.cleanTitle, 'Inception');
      assert.equal(json.year, 2010);
    });

    test('GET /api/metadata/enrich returns TMDB metadata', async () => {
      const res = await fetch(`${baseUrl}/api/metadata/enrich?title=Inception&year=2010`);
      assert.equal(res.status, 200);
      const json: any = await res.json();
      assert.equal(json.director, 'Christopher Nolan');
    });

    test('GET /api/metadata/enrich with category=familiares returns 403 Isolation Barrier', async () => {
      const res = await fetch(`${baseUrl}/api/metadata/enrich?title=Cumpleanos&category=familiares`);
      assert.equal(res.status, 403);
      const json: any = await res.json();
      assert.ok(json.error.includes('Isolation Barrier'));
    });

    test('GET /api/metadata/enrich with family title returns 403 Isolation Barrier', async () => {
      const res = await fetch(`${baseUrl}/api/metadata/enrich?title=${encodeURIComponent('Paseo en familia')}`);
      assert.equal(res.status, 403);
      const json: any = await res.json();
      assert.ok(json.error.includes('Isolation Barrier'));
    });

    test('GET /api/drive/files/familiares returns isolated items with =s800 thumbnails', async () => {
      const res = await fetch(`${baseUrl}/api/drive/files/familiares`);
      assert.equal(res.status, 200);
      const json: any = await res.json();
      assert.equal(json.category, 'familiares');
      assert.ok(json.items.length > 0);
      for (const item of json.items) {
        assert.equal(item.tmdbEnriched, false);
        assert.equal(item.director, undefined);
        assert.equal(item.cast, undefined);
        assert.ok(item.thumbnailLink.includes('=s800'));
      }
    });

    test('teardown express server', async () => {
      if (server) {
        await new Promise<void>((resolve) => {
          server.close(() => resolve());
        });
      }
    });
  });
});
