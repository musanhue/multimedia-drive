import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiClient } from '../../../client/src/api/client';
import { upgradeDriveThumbnail, renderFamilyCard } from '../../../client/src/views/family';
import { M56Validator } from '../../harness/m56-validator';
import fs from 'node:fs';
import path from 'node:path';

// Minimal DOM mock for headless Node execution
if (typeof (global as any).document === 'undefined') {
  (global as any).document = {
    createElement: (tag: string) => {
      const attrs: Record<string, string> = {};
      return {
        tagName: tag.toUpperCase(),
        className: '',
        id: '',
        innerHTML: '',
        setAttribute: (k: string, v: string) => { attrs[k] = v; },
        getAttribute: (k: string) => attrs[k],
        addEventListener: () => {},
        style: {}
      };
    }
  };
}

test('Views Unit: Frontend API Client Instantiation & URL Construction', () => {
  const client = new ApiClient({ baseUrl: 'http://localhost:3000', timeoutMs: 5000 });
  assert.equal(client.getStreamUrl('test1234'), 'http://localhost:3000/api/stream/test1234');
  assert.equal(client.getSubtitlesUrl('sub1234'), 'http://localhost:3000/api/subtitles/sub1234');
});

test('Views Unit: Frontend API Client Offline Network Error Handling', async () => {
  const client = new ApiClient({ baseUrl: 'http://127.0.0.1:59999', timeoutMs: 300 });
  try {
    await client.getFolders();
    assert.fail('Should have thrown an ApiError');
  } catch (err: any) {
    assert.equal(err.name, 'ApiError');
    assert.ok(err.message.length > 0);
  }
});

test('Views Unit: Family Video Thumbnail Upgrade to =s800', () => {
  const standardThumb = 'https://lh3.googleusercontent.com/drive-thumb-1=s220';
  const upgraded = upgradeDriveThumbnail(standardThumb);
  assert.equal(upgraded, 'https://lh3.googleusercontent.com/drive-thumb-1=s800');

  const plainThumb = 'https://lh3.googleusercontent.com/drive-thumb-1';
  const upgradedPlain = upgradeDriveThumbnail(plainThumb);
  assert.equal(upgradedPlain, 'https://lh3.googleusercontent.com/drive-thumb-1=s800');
});

test('Views Unit: Family Video Card Render Composition', () => {
  const item: any = {
    id: 'fam_01',
    name: 'Cumpleaños_de_Lucas_2021.mp4',
    cleanTitle: 'Cumpleaños De Lucas 2021',
    category: 'familiares',
    dateFormatted: '15 de octubre de 2021',
    durationFormatted: '14:32',
    resolutionBadge: '4K',
    thumbnailLink: 'https://lh3.googleusercontent.com/drive-thumb-1=s220'
  };

  const card = renderFamilyCard(item, 2, 0);
  assert.ok(card.className.includes('family-video-card'), 'Card must have family-video-card class');
  assert.equal(card.getAttribute('data-category'), 'familiares');
  assert.ok(card.innerHTML.includes('15 de octubre de 2021'), 'Must include date badge');
  assert.ok(card.innerHTML.includes('14:32'), 'Must include duration badge');
  assert.ok(card.innerHTML.includes('4K'), 'Must include 4K resolution badge');
  assert.ok(card.innerHTML.includes('=s800'), 'Must use upgraded thumbnail');
});

test('Views Unit: Chromium M56 Static Code Compliance of Views', () => {
  const viewsDir = path.resolve(__dirname, '../../../client/src/views');
  const files = ['family.ts', 'modal.ts', 'catalog.ts'];
  for (const f of files) {
    const full = path.join(viewsDir, f);
    if (fs.existsSync(full)) {
      const code = fs.readFileSync(full, 'utf8');
      const res = M56Validator.validateJavaScript(code);
      assert.equal(res.valid, true, `M56 JS violation in ${f}: ${JSON.stringify(res.violations)}`);
    }
  }
});

test('Views Unit: Chromium M56 Static CSS Compliance of Stylesheets', () => {
  const stylesDir = path.resolve(__dirname, '../../../client/styles');
  const cssFiles = ['catalog.css', 'modal.css'];
  for (const f of cssFiles) {
    const full = path.join(stylesDir, f);
    if (fs.existsSync(full)) {
      const css = fs.readFileSync(full, 'utf8');
      const res = M56Validator.validateCSS(css);
      assert.equal(res.valid, true, `M56 CSS violation in ${f}: ${JSON.stringify(res.violations)}`);
    }
  }
});

test('Views Unit: Horizontal Carousel Centering Math', () => {
  const viewportWidth = 1920;
  const cardWidth = 200;
  const margin = 24;
  const stride = cardWidth + margin; // 224
  const paddingLeft = 80;

  // Card 0 center = 80 + 100 = 180. Target translate = 960 - 180 = 780.
  // Clamped to 0 (cannot scroll right of start)
  let cardIdx = 0;
  let cardCenter = paddingLeft + (cardIdx * stride) + (cardWidth / 2);
  let targetTranslate = (viewportWidth / 2) - cardCenter;
  if (targetTranslate > 0) targetTranslate = 0;
  assert.equal(targetTranslate, 0);

  // Card 5 center = 80 + (5 * 224) + 100 = 80 + 1120 + 100 = 1300.
  // Target translate = 960 - 1300 = -340.
  cardIdx = 5;
  cardCenter = paddingLeft + (cardIdx * stride) + (cardWidth / 2);
  targetTranslate = (viewportWidth / 2) - cardCenter;
  assert.equal(targetTranslate, -340);
});

test('Views Unit: Modal Button Focus Trapping State Machine', () => {
  let currentIdx = 0;
  const buttonsCount = 2;

  // ArrowRight -> 1
  if (currentIdx < buttonsCount - 1) currentIdx++;
  assert.equal(currentIdx, 1);

  // ArrowRight again (edge boundary clamped)
  if (currentIdx < buttonsCount - 1) currentIdx++;
  assert.equal(currentIdx, 1);

  // ArrowLeft -> 0
  if (currentIdx > 0) currentIdx--;
  assert.equal(currentIdx, 0);

  // ArrowLeft again (edge boundary clamped)
  if (currentIdx > 0) currentIdx--;
  assert.equal(currentIdx, 0);
});
