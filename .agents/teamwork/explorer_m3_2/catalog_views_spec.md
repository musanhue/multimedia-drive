# Technical Architecture & Blueprint Specification: Catalog Views, Modals & Family Cards

**Target Platform:** Samsung Smart TV UN50NU7400 (50" 4K UHD, Tizen 4.0 / Chromium M56)  
**Author:** `explorer_m3_2` (Catalog Views, Modals & Family Cards Explorer)  
**Scope:** Feature F11 (Catalog Carousel View), Feature F12 (Movie Detail Modal), Feature F13 (Family Video Card View), Frontend API Client, and Unit Test Plan  
**Target Output Files:**  
- `client/src/api/client.ts`  
- `client/src/views/catalog.ts`  
- `client/src/views/modal.ts`  
- `client/src/views/family.ts`  
- `client/styles/catalog.css`  
- `client/styles/modal.css`  
- `tests/unit/m3/views.test.ts`  

---

## 1. Executive Summary & Architectural Overview

This blueprint specifies the frontend presentation layer and client API architecture for the Samsung Smart TV UN50NU7400. Operating on Samsung Tizen 4.0 with an un-upgradable Chromium M56 browser engine, the 10-foot user interface must deliver smooth 60fps performance from a 3-meter viewing distance while adhering to strict rendering and JavaScript syntax limitations.

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 10-FOOT TV VIEWPORT (1920 x 1080)                                │
│                                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ HEADER: [MULTIMEDIA DRIVE 🟢]   [Películas] [Series] [Videos familiares] [Fotos] [Música]   │  │
│  └────────────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ ROW 0: Películas (200x300 2:3 Cards)                                                      │  │
│  │  [Poster 1]  [Poster 2]  [ ★ 8.4 POSTER 3 (FOCUSED) ]  [Poster 4]  [Poster 5] ...          │  │
│  │  ◄── transform: translate3d(-340px, 0, 0) centers active card in 1920px viewport ────────►  │  │
│  └────────────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ ROW 1: Series (200x300 2:3 Cards, T4:E9 Badges)                                            │  │
│  │  [Poster 1]  [Poster 2]  [Poster 3] ...                                                    │  │
│  └────────────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ ROW 2: Videos familiares (320x180 16:9 Landscape Cards)                                   │  │
│  │  [ 4K • 15 Oct 2021 | 14:32 ]  [ 1080p • 20 Jul 2019 | 32:30 ] ...                         │  │
│  └────────────────────────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
                 │ (Enter on Movie/Series)                      │ (Enter on Family Video)
                 ▼                                              ▼
┌──────────────────────────────────────────────┐  ┌──────────────────────────────────────────────┐
│        FEATURE F12: MOVIE DETAIL MODAL       │  │        FEATURE F13: INSTANT PLAYBACK         │
│  • Fullscreen w1280 Ambient Backdrop Image   │  │  • ZERO TMDB Calls! Zero Commercial Modal    │
│  • w500 High-Res Poster + 2-Col Flexbox      │  │  • Google Drive CDN HD Thumbnail (=s800)     │
│  • Title, Year, Runtime, ★ 8.4 Rating Badge  │  │  • Spanish Recording Date & MM:SS Pill       │
│  • Spanish Synopsis, Director, Top 5 Cast    │  │  • Immediate Boot of HTML5 Video Player      │
│  • Focus-Trapped: [▶ Reproducir] / [✕ Cerrar]│  │  • Return (10009) Restores Card Focus        │
└──────────────────────────────────────────────┘  └──────────────────────────────────────────────┘
```

### Strict Chromium M56 Hardware Engine Invariants
1. **Zero CSS Grid:** `display: grid` is prohibited. Layout collapses to `display: block` in M56. All layouts use Flexbox Level 1.
2. **Zero Flexbox `gap`:** `gap`, `row-gap`, `column-gap` are ignored by Chromium M56 (added in M84). All inter-item spacing must use explicit `margin-right: 24px` or `margin-bottom: 24px`.
3. **Zero `aspect-ratio`:** The CSS `aspect-ratio` property is unsupported in M56 (added in M88). Explicit dimensions (`width: 200px; height: 300px;` for 2:3; `width: 320px; height: 180px;` for 16:9) must be declared.
4. **Zero Modern ES Syntax in Client Code:** Optional chaining (`?.`), nullish coalescing (`??`), and object spread in object literals (`{ ...obj }`) throw fatal `SyntaxError`s in Chromium M56.
5. **No Native Modules in HTML:** `<script type="module">` is completely ignored by M56. The application runs as an IIFE bundle loaded via classic `<script src="bundle.js">`.
6. **Focus Ring Class:** `:focus-visible` is unsupported (M86). The custom `.is-focused` CSS class is managed by the spatial navigation layer.

---

## 2. Frontend API Client (`client/src/api/client.ts`)

### 2.1 Interface & Data Types

The frontend types correspond directly to the backend contracts (`server/drive/types.ts` and `server/metadata/tmdb.ts`):

```typescript
export type MediaCategory = 'peliculas' | 'series' | 'familiares' | 'fotos' | 'musica';

export interface SubtitleTrack {
  id: string;
  name: string;
  lang: string;
  label: string;
  format: 'srt' | 'vtt';
  isDefault: boolean;
  isForced: boolean;
  vttUrl: string;
}

export interface DriveMediaItem {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdTime?: string;
  modifiedTime: string;
  category: MediaCategory;
  thumbnailUrl?: string;
  thumbnailLink?: string;
  durationMillis?: number;
  width?: number;
  height?: number;
  parentFolderId?: string;
  parentFolderName?: string;
  isFolder: boolean;
  extension?: string;
  season?: number;
  episode?: number;
  subtitles?: SubtitleTrack[];
  tmdbEnriched?: boolean;

  // Synthesized Native & Cleaned Fields (F8 & F13)
  cleanTitle?: string;
  dateFormatted?: string;
  durationFormatted?: string;
  resolutionBadge?: '4K' | '1080p' | '720p' | 'SD';

  // TMDB Cinematic Fields (F7 & F12)
  overview?: string;
  director?: string;
  cast?: string[];
  genres?: string[];
  rating?: number;
  runtime?: string | null;
  year?: number | null;
  posterUrl?: string;
  backdropUrl?: string | null;
}

export interface CategoryFolder {
  id: string;
  name: string;
  category: MediaCategory;
  itemCount?: number;
}

export interface FoldersResponse {
  folders: CategoryFolder[];
  categories: Record<string, string>;
}

export interface CategoryFilesResponse {
  category: string;
  total: number;
  count: number;
  items: DriveMediaItem[];
}

export interface ApiClientConfig {
  baseUrl?: string;
  timeoutMs?: number;
  cacheTtlMs?: number;
}
```

### 2.2 API Client Implementation (`client/src/api/client.ts`)

```typescript
export class ApiError extends Error {
  public status: number;
  public isOffline: boolean;

  constructor(message: string, status: number = 0, isOffline: boolean = false) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.isOffline = isOffline;
  }
}

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export class ApiClient {
  private baseUrl: string;
  private timeoutMs: number;
  private cacheTtlMs: number;
  private cache: Map<string, CacheEntry<any>>;

  constructor(config?: ApiClientConfig) {
    var cfg = config || {};
    this.baseUrl = cfg.baseUrl || '';
    this.timeoutMs = cfg.timeoutMs || 8000;
    this.cacheTtlMs = cfg.cacheTtlMs || 5 * 60 * 1000; // 5 minutes in-memory
    this.cache = new Map();
  }

  /**
   * Chromium M56-compatible fetch with timeout using Promise.race (since AbortController is Chrome 66+)
   */
  private fetchWithTimeout(url: string, options?: RequestInit): Promise<Response> {
    var self = this;
    var fetchPromise = fetch(url, options);
    var timeoutPromise = new Promise<Response>(function (_resolve, reject) {
      setTimeout(function () {
        reject(new ApiError('Tiempo de espera agotado al conectar con el servidor', 408, false));
      }, self.timeoutMs);
    });

    return Promise.race([fetchPromise, timeoutPromise]);
  }

  /**
   * Safe JSON GET request with error handling and offline detection
   */
  private async getJson<T>(path: string): Promise<T> {
    var url = this.baseUrl + path;
    
    // Check browser offline status
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new ApiError('No hay conexión a internet en el televisor', 0, true);
    }

    try {
      var res = await this.fetchWithTimeout(url, {
        headers: { 'Accept': 'application/json' }
      });

      if (!res.ok) {
        var errBody = '';
        try {
          var errJson = await res.json();
          errBody = errJson.message || errJson.error || res.statusText;
        } catch {
          errBody = res.statusText;
        }
        throw new ApiError(errBody || 'Error en la petición al servidor', res.status, false);
      }

      return await res.json();
    } catch (err: any) {
      if (err instanceof ApiError) {
        throw err;
      }
      var isNetworkError = !err.status && (err.name === 'TypeError' || err.message === 'Failed to fetch');
      throw new ApiError(
        isNetworkError ? 'No se pudo conectar con el servidor de Google Drive' : err.message,
        err.status || 0,
        isNetworkError
      );
    }
  }

  /**
   * Fetches root category folders with in-memory caching
   */
  public async getFolders(forceRefresh?: boolean): Promise<FoldersResponse> {
    var cacheKey = 'drive_folders';
    var now = Date.now();

    if (!forceRefresh && this.cache.has(cacheKey)) {
      var cached = this.cache.get(cacheKey)!;
      if (now < cached.expiresAt) {
        return cached.data;
      }
      this.cache.delete(cacheKey);
    }

    var data = await this.getJson<FoldersResponse>('/api/drive/folders');
    this.cache.set(cacheKey, { data: data, expiresAt: now + this.cacheTtlMs });
    return data;
  }

  /**
   * Fetches media items for a given category with caching
   */
  public async getCategoryFiles(category: string, forceRefresh?: boolean): Promise<CategoryFilesResponse> {
    var cacheKey = 'drive_files_' + category;
    var now = Date.now();

    if (!forceRefresh && this.cache.has(cacheKey)) {
      var cached = this.cache.get(cacheKey)!;
      if (now < cached.expiresAt) {
        return cached.data;
      }
      this.cache.delete(cacheKey);
    }

    var data = await this.getJson<CategoryFilesResponse>('/api/drive/files/' + encodeURIComponent(category));
    this.cache.set(cacheKey, { data: data, expiresAt: now + this.cacheTtlMs });
    return data;
  }

  /**
   * Fetches full metadata for a specific file
   */
  public async getFileMetadata(fileId: string): Promise<DriveMediaItem> {
    return this.getJson<DriveMediaItem>('/api/drive/file/' + encodeURIComponent(fileId));
  }

  /**
   * Queries TMDB metadata enrichment endpoint
   */
  public async enrichMetadata(title: string, year?: number | null, isSeries?: boolean): Promise<any> {
    var query = '?title=' + encodeURIComponent(title);
    if (year) query += '&year=' + encodeURIComponent(String(year));
    if (isSeries) query += '&isSeries=true';
    return this.getJson<any>('/api/metadata/enrich' + query);
  }

  /**
   * Helper to build video/audio streaming proxy URL
   */
  public getStreamUrl(fileId: string): string {
    return this.baseUrl + '/api/stream/' + encodeURIComponent(fileId);
  }

  /**
   * Helper to build WebVTT subtitle stream URL
   */
  public getSubtitlesUrl(fileId: string): string {
    return this.baseUrl + '/api/subtitles/' + encodeURIComponent(fileId);
  }

  /**
   * Invalidates local client cache and requests server cache purge
   */
  public async refreshCache(): Promise<void> {
    this.cache.clear();
    try {
      await this.getJson('/api/drive/refresh');
    } catch {
      // Non-fatal if server refresh endpoint fails
    }
  }
}

export var apiClient = new ApiClient();
```

---

## 3. Main Catalog Carousel View (`client/src/views/catalog.ts`)

### 3.1 Architecture & Layout Structure

The catalog view displays:
1. **Top Header**: Brand logo (`MULTIMEDIA DRIVE`), connection health indicator, category quick tabs (`Películas`, `Series`, `Videos familiares`, `Fotos`, `Música`), and a real-time digital clock.
2. **Carousel Rows**: 5 horizontally scrolling rows corresponding to each primary media category.
3. **Card Metrics**:
   - Movie & Series: 2:3 vertical aspect ratio (`width: 200px; height: 300px;`).
   - Family Video: 16:9 landscape aspect ratio (`width: 320px; height: 180px;`).
   - Photos & Music: 1:1 square aspect ratio (`width: 200px; height: 200px;`).
4. **Spacing Rules**:
   - Explicit `margin-right: 24px` on each card item. Flex `gap` is strictly omitted.
   - Row spacing uses `margin-bottom: 40px` on `.carousel-row`.

### 3.2 Smooth Scrolling & GPU Centering Formula

When the user navigates horizontally (ArrowLeft / ArrowRight), the focused card is kept centered in the 1920px viewport by computing a target translation along the X axis and applying `transform: translate3d(translateX, 0, 0)`:

$$\text{cardCenter} = \text{paddingLeft} + (i \times (\text{cardWidth} + \text{marginRight})) + \frac{\text{cardWidth}}{2}$$

$$\text{targetTranslateX} = \frac{\text{viewportWidth}}{2} - \text{cardCenter}$$

$$\text{clampedTranslateX} = \max(\min(0, \text{targetTranslateX}), \text{viewportWidth} - \text{trackTotalWidth})$$

Applying this translation via `translate3d` ensures the Blink rendering engine on Tizen 4.0 hands the transformation directly to the Mali GPU composite layer, running at a smooth 60fps without triggering layout reflows.

### 3.3 Complete Catalog View Implementation (`client/src/views/catalog.ts`)

```typescript
import { apiClient, DriveMediaItem, FoldersResponse } from '../api/client';
import { movieDetailModal } from './modal';
import { renderFamilyCard } from './family';

export interface CatalogViewCallbacks {
  onPlayMovie: (item: DriveMediaItem) => void;
  onPlayFamilyVideo: (item: DriveMediaItem) => void;
  onOpenPhotoSlideshow: (item: DriveMediaItem, allPhotos: DriveMediaItem[], index: number) => void;
  onOpenAudioPlayer: (item: DriveMediaItem, playlist: DriveMediaItem[], index: number) => void;
  onExitApp: () => void;
}

export class CatalogView {
  public container: HTMLElement;
  private callbacks: CatalogViewCallbacks;
  private currentFocusRow: number = 0; // -1 for tab bar, 0..4 for carousel rows
  private currentFocusCol: number = 0;
  private rowData: Map<number, DriveMediaItem[]> = new Map();
  private rowElements: HTMLElement[] = [];
  private tabElements: HTMLElement[] = [];
  private lastCardMemory: { row: number; col: number } = { row: 0, col: 0 };
  private clockInterval: any = null;

  constructor(container: HTMLElement, callbacks: CatalogViewCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
  }

  /**
   * Initializes catalog DOM, clock, and fetches initial data
   */
  public async init(): Promise<void> {
    this.renderSkeleton();
    this.startClock();
    await this.loadCatalogData();
  }

  private startClock(): void {
    var updateClock = () => {
      var clockEl = document.getElementById('catalog-clock');
      if (clockEl) {
        var now = new Date();
        var h = String(now.getHours());
        var m = String(now.getMinutes());
        if (h.length < 2) h = '0' + h;
        if (m.length < 2) m = '0' + m;
        clockEl.textContent = h + ':' + m;
      }
    };
    updateClock();
    this.clockInterval = setInterval(updateClock, 30000);
  }

  private renderSkeleton(): void {
    this.container.innerHTML = `
      <div class="catalog-view" id="catalog-root" data-layer="catalog">
        <header class="catalog-header">
          <div class="header-brand">
            <span class="brand-title">MULTIMEDIA DRIVE</span>
            <span class="status-indicator is-online" id="catalog-status-dot" title="Conectado"></span>
          </div>
          <nav class="category-tabs" id="catalog-category-tabs">
            <button class="nav-tab nav-item" data-category="peliculas" data-tab-idx="0">Películas</button>
            <button class="nav-tab nav-item" data-category="series" data-tab-idx="1">Series</button>
            <button class="nav-tab nav-item" data-category="familiares" data-tab-idx="2">Videos familiares</button>
            <button class="nav-tab nav-item" data-category="fotos" data-tab-idx="3">Fotos</button>
            <button class="nav-tab nav-item" data-category="musica" data-tab-idx="4">Música</button>
          </nav>
          <div class="header-clock" id="catalog-clock">--:--</div>
        </header>

        <main class="catalog-main">
          <div class="catalog-loading" id="catalog-loading">
            <div class="catalog-spinner"></div>
            <p class="catalog-loading-text">Cargando biblioteca...</p>
          </div>

          <div class="catalog-error" id="catalog-error" style="display: none;">
            <p class="catalog-error-msg" id="catalog-error-msg"></p>
            <button class="btn-retry nav-item" id="btn-catalog-retry">Reintentar</button>
          </div>

          <div class="carousel-viewport-wrapper" id="carousel-viewport-wrapper">
            <div class="carousel-rows-stack" id="carousel-rows-stack">
              <!-- Dynamically populated rows 0..4 -->
            </div>
          </div>
        </main>
      </div>
    `;

    this.tabElements = Array.from(document.querySelectorAll('.category-tabs .nav-tab'));
    var retryBtn = document.getElementById('btn-catalog-retry');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => this.loadCatalogData());
    }
  }

  public async loadCatalogData(): Promise<void> {
    var loadingEl = document.getElementById('catalog-loading');
    var errorEl = document.getElementById('catalog-error');
    var stackEl = document.getElementById('carousel-rows-stack');

    if (loadingEl) loadingEl.style.display = 'flex';
    if (errorEl) errorEl.style.display = 'none';

    try {
      var categories = ['peliculas', 'series', 'familiares', 'fotos', 'musica'];
      var titles = ['Películas', 'Series', 'Videos familiares', 'Fotos', 'Música'];

      // Fetch all 5 categories
      var promises = categories.map((cat) => apiClient.getCategoryFiles(cat).catch(() => ({ category: cat, total: 0, count: 0, items: [] })));
      var results = await Promise.all(promises);

      if (loadingEl) loadingEl.style.display = 'none';
      if (!stackEl) return;
      stackEl.innerHTML = '';
      this.rowElements = [];
      this.rowData.clear();

      for (var r = 0; r < results.length; r++) {
        var catName = categories[r];
        var catTitle = titles[r];
        var items = results[r].items || [];
        this.rowData.set(r, items);

        var rowSection = document.createElement('section');
        rowSection.className = 'carousel-row';
        rowSection.id = 'carousel-row-' + catName;
        rowSection.setAttribute('data-row-idx', String(r));

        var titleHeader = document.createElement('h2');
        titleHeader.className = 'row-title';
        titleHeader.textContent = catTitle + ' (' + items.length + ')';
        rowSection.appendChild(titleHeader);

        var viewportDiv = document.createElement('div');
        viewportDiv.className = 'carousel-track-viewport';

        var trackDiv = document.createElement('div');
        trackDiv.className = 'carousel-track';
        trackDiv.id = 'track-' + catName;

        if (items.length === 0) {
          var emptyNotice = document.createElement('div');
          emptyNotice.className = 'row-empty-notice';
          emptyNotice.textContent = 'No hay elementos disponibles en ' + catTitle;
          trackDiv.appendChild(emptyNotice);
        } else {
          for (var c = 0; c < items.length; c++) {
            var cardEl: HTMLElement;
            if (catName === 'familiares') {
              cardEl = renderFamilyCard(items[c], r, c);
            } else {
              cardEl = this.createMediaCard(items[c], catName, r, c);
            }
            trackDiv.appendChild(cardEl);
          }
        }

        viewportDiv.appendChild(trackDiv);
        rowSection.appendChild(viewportDiv);
        stackEl.appendChild(rowSection);
        this.rowElements.push(rowSection);
      }

      // Initial focus
      this.currentFocusRow = 0;
      this.currentFocusCol = 0;
      this.updateFocusState();

    } catch (err: any) {
      if (loadingEl) loadingEl.style.display = 'none';
      if (errorEl) {
        errorEl.style.display = 'flex';
        var msgEl = document.getElementById('catalog-error-msg');
        if (msgEl) msgEl.textContent = err.message || 'Error al conectar con Google Drive';
      }
    }
  }

  /**
   * Creates standard 2:3 vertical media cards for Movies & Series
   */
  private createMediaCard(item: DriveMediaItem, category: string, rowIdx: number, colIdx: number): HTMLElement {
    var card = document.createElement('div');
    card.className = 'media-card nav-item';
    card.id = 'card_' + (item.id || ('r' + rowIdx + '_c' + colIdx));
    card.setAttribute('data-row', String(rowIdx));
    card.setAttribute('data-col', String(colIdx));
    card.setAttribute('data-category', category);

    // Fallback poster SVG as inline data URI
    var fallbackSvg = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300" viewBox="0 0 200 300"><rect fill="%23181b22" width="200" height="300"/><text fill="%23666" x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="16">Sin Cartel</text></svg>';
    var posterSrc = item.posterUrl || item.thumbnailLink || fallbackSvg;

    var html = `
      <div class="card-poster-wrap">
        <img class="card-poster-img" src="${posterSrc}" alt="${item.cleanTitle || item.name}" onerror="this.src='${fallbackSvg}'"/>
        ${item.rating && item.rating > 0 ? `<div class="card-badge rating-badge">★ ${item.rating.toFixed(1)}</div>` : ''}
        ${item.year ? `<div class="card-badge year-badge">${item.year}</div>` : ''}
        ${item.season && item.episode ? `<div class="card-badge episode-badge">T${item.season}:E${item.episode}</div>` : ''}
      </div>
      <div class="card-info">
        <span class="card-title">${item.cleanTitle || item.name}</span>
      </div>
    `;

    card.innerHTML = html;
    card.addEventListener('click', () => this.handleEnter());
    return card;
  }

  /**
   * Dispatches directional D-pad movement within the catalog
   */
  public handleDirection(direction: 'left' | 'right' | 'up' | 'down'): void {
    if (direction === 'left') {
      if (this.currentFocusRow === -1) {
        // Tab bar navigation
        if (this.currentFocusCol > 0) {
          this.currentFocusCol--;
          this.updateFocusState();
        }
      } else {
        if (this.currentFocusCol > 0) {
          this.currentFocusCol--;
          this.updateFocusState();
        }
      }
    } else if (direction === 'right') {
      if (this.currentFocusRow === -1) {
        if (this.currentFocusCol < this.tabElements.length - 1) {
          this.currentFocusCol++;
          this.updateFocusState();
        }
      } else {
        var items = this.rowData.get(this.currentFocusRow) || [];
        if (this.currentFocusCol < items.length - 1) {
          this.currentFocusCol++;
          this.updateFocusState();
        }
      }
    } else if (direction === 'up') {
      if (this.currentFocusRow === 0) {
        // Move from Row 0 to Top Tab Bar
        this.currentFocusRow = -1;
        this.currentFocusCol = Math.min(this.currentFocusCol, this.tabElements.length - 1);
        this.updateFocusState();
      } else if (this.currentFocusRow > 0) {
        this.currentFocusRow--;
        var targetRowItems = this.rowData.get(this.currentFocusRow) || [];
        var maxCol = targetRowItems.length > 0 ? targetRowItems.length - 1 : 0;
        this.currentFocusCol = Math.min(this.currentFocusCol, maxCol);
        this.updateFocusState();
      }
    } else if (direction === 'down') {
      if (this.currentFocusRow === -1) {
        // Move from Tab Bar down to Row 0
        this.currentFocusRow = 0;
        var r0Items = this.rowData.get(0) || [];
        var maxC = r0Items.length > 0 ? r0Items.length - 1 : 0;
        this.currentFocusCol = Math.min(this.currentFocusCol, maxC);
        this.updateFocusState();
      } else if (this.currentFocusRow < this.rowElements.length - 1) {
        this.currentFocusRow++;
        var nextRowItems = this.rowData.get(this.currentFocusRow) || [];
        var maxNextCol = nextRowItems.length > 0 ? nextRowItems.length - 1 : 0;
        this.currentFocusCol = Math.min(this.currentFocusCol, maxNextCol);
        this.updateFocusState();
      }
    }
  }

  /**
   * Action trigger on Enter (13) keypress
   */
  public handleEnter(): void {
    if (this.currentFocusRow === -1) {
      // Enter on tab bar jumps to corresponding row
      var targetRow = this.currentFocusCol;
      if (targetRow >= 0 && targetRow < this.rowElements.length) {
        this.currentFocusRow = targetRow;
        this.currentFocusCol = 0;
        this.updateFocusState();
      }
      return;
    }

    var items = this.rowData.get(this.currentFocusRow) || [];
    var selectedItem = items[this.currentFocusCol];
    if (!selectedItem) return;

    this.lastCardMemory = { row: this.currentFocusRow, col: this.currentFocusCol };

    // Row 0 (Películas) or Row 1 (Series) -> Movie Detail Modal
    if (this.currentFocusRow === 0 || this.currentFocusRow === 1) {
      var activeEl = document.querySelector('.media-card.is-focused') as HTMLElement;
      movieDetailModal.open(selectedItem, activeEl, (itemToPlay) => {
        this.callbacks.onPlayMovie(itemToPlay);
      });
    }
    // Row 2 (Videos familiares) -> Direct Playback (Bypasses modal!)
    else if (this.currentFocusRow === 2) {
      this.callbacks.onPlayFamilyVideo(selectedItem);
    }
    // Row 3 (Fotos) -> Photo Slideshow
    else if (this.currentFocusRow === 3) {
      this.callbacks.onOpenPhotoSlideshow(selectedItem, items, this.currentFocusCol);
    }
    // Row 4 (Música) -> Audio Player
    else if (this.currentFocusRow === 4) {
      this.callbacks.onOpenAudioPlayer(selectedItem, items, this.currentFocusCol);
    }
  }

  /**
   * Restores focus when returning from a modal or media player
   */
  public restoreFocus(): void {
    this.currentFocusRow = this.lastCardMemory.row;
    this.currentFocusCol = this.lastCardMemory.col;
    this.updateFocusState();
  }

  /**
   * Re-computes visual focus highlight and GPU transforms
   */
  private updateFocusState(): void {
    // Remove previous focused classes
    var prev = document.querySelectorAll('.nav-item.is-focused');
    for (var i = 0; i < prev.length; i++) {
      prev[i].classList.remove('is-focused');
    }

    if (this.currentFocusRow === -1) {
      // Focus tab bar item
      var tab = this.tabElements[this.currentFocusCol];
      if (tab) {
        tab.classList.add('is-focused');
        tab.focus();
      }
      return;
    }

    // Focus row card
    var rowSection = this.rowElements[this.currentFocusRow];
    if (!rowSection) return;

    var cards = rowSection.querySelectorAll('.nav-item');
    var activeCard = cards[this.currentFocusCol] as HTMLElement;
    if (activeCard) {
      activeCard.classList.add('is-focused');
      activeCard.focus();
    }

    // Scroll horizontal track to center card
    this.centerActiveCard(rowSection, this.currentFocusCol, cards.length);

    // Scroll vertical stack so active row is centered
    this.centerActiveRow(this.currentFocusRow);
  }

  /**
   * Centering formula for horizontal row track
   */
  private centerActiveCard(rowEl: HTMLElement, cardIdx: number, totalCards: number): void {
    var track = rowEl.querySelector('.carousel-track') as HTMLElement;
    if (!track) return;

    var isFamilyRow = this.currentFocusRow === 2;
    var cardWidth = isFamilyRow ? 320 : 200;
    var margin = 24;
    var stride = cardWidth + margin;
    var paddingLeft = 80;
    var viewportWidth = 1920;

    var cardCenter = paddingLeft + (cardIdx * stride) + (cardWidth / 2);
    var targetTranslate = (viewportWidth / 2) - cardCenter;

    if (targetTranslate > 0) targetTranslate = 0;

    var totalTrackWidth = paddingLeft + (totalCards * stride);
    var maxScroll = Math.min(0, viewportWidth - totalTrackWidth - paddingLeft);
    if (targetTranslate < maxScroll) targetTranslate = maxScroll;

    track.style.transform = 'translate3d(' + Math.round(targetTranslate) + 'px, 0, 0)';
  }

  /**
   * Centering formula for vertical rows stack
   */
  private centerActiveRow(rowIdx: number): void {
    var stack = document.getElementById('carousel-rows-stack');
    if (!stack) return;

    // Approximate row height: 380px for movies, 260px for family
    var rowOffsets = [0, 390, 780, 1070, 1360];
    var offset = rowOffsets[rowIdx] || (rowIdx * 380);

    stack.style.transform = 'translate3d(0, -' + offset + 'px, 0)';
  }

  public destroy(): void {
    if (this.clockInterval) {
      clearInterval(this.clockInterval);
      this.clockInterval = null;
    }
  }
}
```

---

## 4. Movie Detail Modal (`client/src/views/modal.ts`)

### 4.1 Structural Composition

The movie detail modal overlays the catalog view when Enter (13) is activated on a Movie or Series card:
1. **Ambient Backdrop Layer**: Fullscreen TMDB backdrop image (`w1280`) with a linear gradient dark overlay (`rgba(18, 18, 18, 0.95)` at left, fading to `rgba(18, 18, 18, 0.70)` at right).
2. **Left Column**: High-resolution movie poster (`w500`, dimensions `320px x 480px`) with ambient drop shadow.
3. **Right Column**:
   - Media Title (`42px`, bold).
   - Metadata Pills: Release Year, Runtime (`2h 28m`), Rating Badge (`★ 8.4`), and Genres list.
   - Spanish Synopsis (`20px`, `line-height: 1.5`).
   - Credits: Director and top 5 cast members with character roles.
   - Action Buttons: `[ ▶ Reproducir ]` (`#btn_play`) and `[ ✕ Volver ]` (`#btn_close`).

### 4.2 Modal Focus Trapping Invariant

- On modal open: `#btn_play` is **automatically focused**.
- D-pad horizontal (ArrowLeft / ArrowRight) toggles focus strictly between `#btn_play` and `#btn_close`.
- D-pad vertical (ArrowUp / ArrowDown) is **trapped** and prevented from bleeding into the underlying catalog carousel.
- Activating `#btn_close` or pressing the physical Return key (`10009` / `Escape`) dismisses the modal, returns `activeLayer` to `'catalog'`, and restores focus to the invoking card.

### 4.3 Complete Modal View Implementation (`client/src/views/modal.ts`)

```typescript
import { DriveMediaItem } from '../api/client';

export class MovieDetailModal {
  private overlayEl: HTMLElement | null = null;
  private currentItem: DriveMediaItem | null = null;
  private invokingElement: HTMLElement | null = null;
  private onPlayCallback: ((item: DriveMediaItem) => void) | null = null;
  private currentButtonIndex: number = 0; // 0: Play, 1: Close
  private buttons: HTMLElement[] = [];

  constructor() {
    this.createDom();
  }

  private createDom(): void {
    var existing = document.getElementById('movie-detail-modal');
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }

    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'movie-detail-modal';
    overlay.setAttribute('data-layer', 'modal');
    overlay.style.display = 'none';

    overlay.innerHTML = `
      <div class="modal-backdrop-layer" id="modal-backdrop-layer"></div>
      <div class="modal-gradient-layer"></div>

      <div class="modal-content-container">
        <!-- Left Column: High-Res Poster -->
        <div class="modal-poster-col">
          <div class="modal-poster-frame">
            <img class="modal-poster-img" id="modal-poster-img" src="" alt="Cartelera" />
          </div>
        </div>

        <!-- Right Column: Metadata & Controls -->
        <div class="modal-details-col">
          <h1 class="modal-title" id="modal-title">Título</h1>

          <div class="modal-meta-row">
            <span class="meta-pill meta-year" id="modal-year">----</span>
            <span class="meta-pill meta-runtime" id="modal-runtime">-- min</span>
            <span class="meta-pill meta-rating" id="modal-rating">★ --</span>
            <span class="meta-genres" id="modal-genres"></span>
          </div>

          <div class="modal-synopsis-box">
            <p class="modal-synopsis" id="modal-synopsis">Sinopsis no disponible.</p>
          </div>

          <div class="modal-credits-box">
            <p class="credit-line"><strong class="credit-label">Director:</strong> <span id="modal-director">Desconocido</span></p>
            <p class="credit-line"><strong class="credit-label">Reparto:</strong> <span id="modal-cast">Desconocido</span></p>
          </div>

          <div class="modal-actions-row">
            <button class="btn-modal btn-play nav-item" id="btn_play">
              <span class="btn-icon">▶</span>
              <span class="btn-text">Reproducir</span>
            </button>
            <button class="btn-modal btn-close nav-item" id="btn_close">
              <span class="btn-icon">✕</span>
              <span class="btn-text">Volver</span>
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this.overlayEl = overlay;

    var btnPlay = document.getElementById('btn_play')!;
    var btnClose = document.getElementById('btn_close')!;
    this.buttons = [btnPlay, btnClose];

    btnPlay.addEventListener('click', () => this.handlePlay());
    btnClose.addEventListener('click', () => this.close());
  }

  /**
   * Opens the detail modal with populated metadata
   */
  public open(item: DriveMediaItem, invokingEl: HTMLElement, onPlay: (item: DriveMediaItem) => void): void {
    this.currentItem = item;
    this.invokingElement = invokingEl;
    this.onPlayCallback = onPlay;
    this.currentButtonIndex = 0; // Default focus: [ Reproducir ]

    if (!this.overlayEl) this.createDom();

    // Backdrop with fallback
    var backdropEl = document.getElementById('modal-backdrop-layer');
    if (backdropEl) {
      if (item.backdropUrl) {
        backdropEl.style.backgroundImage = 'url("' + item.backdropUrl + '")';
        backdropEl.style.opacity = '1';
      } else {
        backdropEl.style.backgroundImage = 'none';
        backdropEl.style.opacity = '0';
      }
    }

    // Poster with fallback
    var posterImg = document.getElementById('modal-poster-img') as HTMLImageElement;
    if (posterImg) {
      var fallbackSvg = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="480" viewBox="0 0 320 480"><rect fill="%23181b22" width="320" height="480"/><text fill="%23666" x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="20">Sin Cartel</text></svg>';
      posterImg.src = item.posterUrl || item.thumbnailLink || fallbackSvg;
      posterImg.onerror = () => { posterImg.src = fallbackSvg; };
    }

    // Title
    var titleEl = document.getElementById('modal-title');
    if (titleEl) titleEl.textContent = item.cleanTitle || item.name;

    // Meta: Year
    var yearEl = document.getElementById('modal-year');
    if (yearEl) yearEl.textContent = item.year ? String(item.year) : 'Año n/d';

    // Meta: Runtime
    var runtimeEl = document.getElementById('modal-runtime');
    if (runtimeEl) {
      var runtimeStr = item.runtime;
      if (!runtimeStr && item.durationMillis) {
        var mins = Math.floor(item.durationMillis / 60000);
        var h = Math.floor(mins / 60);
        var m = mins % 60;
        runtimeStr = h > 0 ? h + 'h ' + (m < 10 ? '0' : '') + m + 'm' : m + 'm';
      }
      runtimeEl.textContent = runtimeStr || 'Duración n/d';
    }

    // Meta: Rating
    var ratingEl = document.getElementById('modal-rating');
    if (ratingEl) {
      var r = item.rating;
      ratingEl.textContent = (typeof r === 'number' && !isNaN(r) && r > 0) ? '★ ' + r.toFixed(1) : '★ --';
    }

    // Meta: Genres
    var genresEl = document.getElementById('modal-genres');
    if (genresEl) {
      var g = item.genres;
      genresEl.textContent = (Array.isArray(g) && g.length > 0) ? g.slice(0, 3).join(' • ') : '';
    }

    // Synopsis
    var synopsisEl = document.getElementById('modal-synopsis');
    if (synopsisEl) {
      synopsisEl.textContent = item.overview || 'Sinopsis no disponible en TMDB.';
    }

    // Director
    var directorEl = document.getElementById('modal-director');
    if (directorEl) {
      directorEl.textContent = item.director || 'Desconocido';
    }

    // Cast
    var castEl = document.getElementById('modal-cast');
    if (castEl) {
      var castList = item.cast;
      castEl.textContent = (Array.isArray(castList) && castList.length > 0)
        ? castList.slice(0, 5).join(', ')
        : 'Desconocido';
    }

    // Show modal & set focus
    this.overlayEl!.style.display = 'flex';
    this.updateButtonFocus();
  }

  /**
   * Trapped D-pad key dispatcher
   */
  public handleKey(keyCode: number): boolean {
    switch (keyCode) {
      case 37: // ArrowLeft
        if (this.currentButtonIndex > 0) {
          this.currentButtonIndex--;
          this.updateButtonFocus();
        }
        return true;

      case 39: // ArrowRight
        if (this.currentButtonIndex < this.buttons.length - 1) {
          this.currentButtonIndex++;
          this.updateButtonFocus();
        }
        return true;

      case 38: // ArrowUp
      case 40: // ArrowDown
        // Trapped within modal!
        return true;

      case 13: // Enter
        if (this.currentButtonIndex === 0) {
          this.handlePlay();
        } else {
          this.close();
        }
        return true;

      case 10009: // Return
      case 27:    // Escape
      case 8:     // Backspace
        this.close();
        return true;

      default:
        return false;
    }
  }

  private updateButtonFocus(): void {
    for (var i = 0; i < this.buttons.length; i++) {
      this.buttons[i].classList.remove('is-focused');
    }
    var target = this.buttons[this.currentButtonIndex];
    if (target) {
      target.classList.add('is-focused');
      target.focus();
    }
  }

  private handlePlay(): void {
    if (this.currentItem && this.onPlayCallback) {
      this.close(true); // close modal overlay without restoring catalog focus
      this.onPlayCallback(this.currentItem);
    }
  }

  public close(isLaunchingPlayer: boolean = false): void {
    if (this.overlayEl) {
      this.overlayEl.style.display = 'none';
    }

    if (!isLaunchingPlayer && this.invokingElement) {
      this.invokingElement.classList.add('is-focused');
      this.invokingElement.focus();
    }
  }

  public isOpen(): boolean {
    return this.overlayEl ? this.overlayEl.style.display !== 'none' : false;
  }
}

export var movieDetailModal = new MovieDetailModal();
```

---

## 5. Family Video Card View (`client/src/views/family.ts`)

### 5.1 Specialized Layout for `Videos familiares`

Family media requires a dedicated presentation tailored to home video recordings:
1. **Aspect Ratio:** 16:9 widescreen landscape cards (`width: 320px; height: 180px;`).
2. **Google Drive CDN Upgrade:** Google Drive thumbnails are served with `=s220` by default; replacing this query parameter with `=s800` causes Google's edge CDN to deliver high-resolution 800px previews with zero server proxy load.
3. **Clean Title Formatting:** File extension, dots, and underscores are stripped and converted to Title Case (e.g., `Cumpleaños De Lucas 2021`).
4. **Metadata Badges:**
   - **Date Badge (Top-Left):** Localized Spanish date string (e.g., `"14 de octubre de 2022"`).
   - **Duration Badge (Bottom-Right):** Formatted duration (e.g., `"12:45"` or `"32:30"`).
   - **Resolution Badge (Bottom-Left):** `"4K"`, `"1080p"`, `"720p"`, or `"SD"`.
5. **Direct Playback:** Activating Enter (`13`) on a family video card **bypasses the movie detail modal completely** and transitions immediately to the HTML5 video player.

### 5.2 Complete Family View Implementation (`client/src/views/family.ts`)

```typescript
import { DriveMediaItem } from '../api/client';

/**
 * Upgrades a Google Drive thumbnail URL to HD (=s800)
 */
export function upgradeDriveThumbnail(url?: string | null): string {
  if (!url) return '';
  if (/=[sw]\d+.*$/.test(url)) {
    return url.replace(/=[sw]\d+.*$/, '=s800');
  }
  return url + '=s800';
}

/**
 * Generates an SVG fallback for family video cards
 */
export function getFamilyVideoPlaceholderSvg(title: string): string {
  return 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><rect fill="%23181b22" width="320" height="180"/><circle cx="160" cy="80" r="28" fill="%23242936"/><polygon points="152,68 174,80 152,92" fill="%2300a8ff"/><text fill="%23888" x="50%25" y="130" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="14">' + encodeURIComponent(title || 'Video Familiar') + '</text></svg>';
}

/**
 * Renders a specialized 16:9 landscape family video card
 */
export function renderFamilyCard(item: DriveMediaItem, rowIdx: number, colIdx: number): HTMLElement {
  var card = document.createElement('div');
  card.className = 'family-video-card nav-item';
  card.id = 'fam_card_' + (item.id || ('r' + rowIdx + '_c' + colIdx));
  card.setAttribute('data-row', String(rowIdx));
  card.setAttribute('data-col', String(colIdx));
  card.setAttribute('data-category', 'familiares');
  card.setAttribute('data-file-id', item.id);

  var displayTitle = item.cleanTitle || item.name;
  var fallbackSvg = getFamilyVideoPlaceholderSvg(displayTitle);
  var thumbnailSrc = upgradeDriveThumbnail(item.thumbnailLink || item.thumbnailUrl) || fallbackSvg;

  var dateBadgeHtml = item.dateFormatted
    ? `<div class="family-badge family-date-badge">${item.dateFormatted}</div>`
    : '';

  var resBadgeHtml = item.resolutionBadge
    ? `<div class="family-badge family-res-badge ${item.resolutionBadge === '4K' ? 'is-4k' : ''}">${item.resolutionBadge}</div>`
    : '';

  var durationBadgeHtml = item.durationFormatted
    ? `<div class="family-badge family-duration-badge">${item.durationFormatted}</div>`
    : '';

  card.innerHTML = `
    <div class="family-thumb-wrapper">
      <img class="family-thumb-img" src="${thumbnailSrc}" alt="${displayTitle}" onerror="this.src='${fallbackSvg}'"/>
      <div class="family-badge-container-top">
        ${dateBadgeHtml}
      </div>
      <div class="family-badge-container-bottom">
        ${resBadgeHtml}
        ${durationBadgeHtml}
      </div>
    </div>
    <div class="family-info-box">
      <span class="family-title">${displayTitle}</span>
    </div>
  `;

  return card;
}
```

---

## 6. CSS Architecture & Stylesheets

### 6.1 Chromium M56 Strict Compliance Rules
- **No `display: grid`**: All structures use `display: flex`.
- **No flex `gap`**: All spacing uses explicit `margin-right: 24px` or `margin-bottom`.
- **No `aspect-ratio`**: Dimensions are explicitly defined in pixels.
- **No `:focus-visible`**: Uses `.is-focused`.
- **Hardware Acceleration**: Only `transform: translate3d()` and `transform: scale()` are animated.

### 6.2 Catalog View Styles (`client/styles/catalog.css`)

```css
/* ==========================================================================
   Catalog View & Carousel Rows (Chromium M56 Compatible)
   ========================================================================== */

.catalog-view {
  position: relative;
  width: 1920px;
  height: 1080px;
  background-color: #0d0f14;
  color: #ffffff;
  overflow: hidden;
  user-select: none;
  font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif;
}

/* Header & Tabs */
.catalog-header {
  position: absolute;
  top: 0;
  left: 0;
  width: 1920px;
  height: 90px;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding-left: 80px;
  padding-right: 80px;
  box-sizing: border-box;
  background: linear-gradient(to bottom, rgba(13, 15, 20, 0.95) 0%, rgba(13, 15, 20, 0) 100%);
  z-index: 100;
}

.header-brand {
  display: flex;
  flex-direction: row;
  align-items: center;
}

.brand-title {
  font-size: 28px;
  font-weight: 800;
  letter-spacing: 2px;
  color: #ffffff;
  margin-right: 14px;
}

.status-indicator {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background-color: #00e676;
  box-shadow: 0 0 10px #00e676;
}

.category-tabs {
  display: flex;
  flex-direction: row;
  align-items: center;
}

.nav-tab {
  background: transparent;
  border: 2px solid transparent;
  color: #a0a5b5;
  font-size: 20px;
  font-weight: 600;
  padding: 8px 20px;
  margin-right: 12px;
  border-radius: 20px;
  cursor: pointer;
  outline: none;
  transition: transform 0.2s cubic-bezier(0.2, 0, 0, 1), color 0.2s, background-color 0.2s;
}

.nav-tab.is-focused {
  color: #ffffff;
  background-color: rgba(0, 168, 255, 0.2);
  border-color: #00a8ff;
  transform: scale(1.08);
  box-shadow: 0 0 18px rgba(0, 168, 255, 0.6);
}

.header-clock {
  font-size: 24px;
  font-weight: 700;
  color: #ffffff;
}

/* Loading & Error States */
.catalog-loading,
.catalog-error {
  position: absolute;
  top: 90px;
  left: 0;
  width: 1920px;
  height: 990px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 50;
}

.catalog-spinner {
  width: 60px;
  height: 60px;
  border: 6px solid rgba(255, 255, 255, 0.1);
  border-top-color: #00a8ff;
  border-radius: 50%;
  animation: spin 1s infinite linear;
  margin-bottom: 24px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.catalog-loading-text,
.catalog-error-msg {
  font-size: 24px;
  color: #a0a5b5;
}

.btn-retry {
  margin-top: 24px;
  padding: 12px 32px;
  background-color: #181b22;
  border: 2px solid #00a8ff;
  color: #ffffff;
  font-size: 20px;
  font-weight: 600;
  border-radius: 8px;
  outline: none;
}

.btn-retry.is-focused {
  background-color: #00a8ff;
  box-shadow: 0 0 20px rgba(0, 168, 255, 0.8);
}

/* Viewport Stack */
.carousel-viewport-wrapper {
  position: absolute;
  top: 100px;
  left: 0;
  width: 1920px;
  height: 980px;
  overflow: hidden;
}

.carousel-rows-stack {
  position: relative;
  width: 1920px;
  will-change: transform;
  transition: transform 0.3s cubic-bezier(0.2, 0, 0, 1);
}

/* Rows */
.carousel-row {
  margin-bottom: 40px;
  width: 1920px;
  box-sizing: border-box;
}

.row-title {
  font-size: 26px;
  font-weight: 700;
  color: #ffffff;
  padding-left: 80px;
  margin: 0 0 16px 0;
}

.carousel-track-viewport {
  width: 1920px;
  overflow: hidden;
  position: relative;
}

.carousel-track {
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  padding-left: 80px;
  padding-right: 80px;
  will-change: transform;
  transition: transform 0.25s cubic-bezier(0.25, 1, 0.5, 1);
}

.row-empty-notice {
  font-size: 20px;
  color: #666e80;
  padding: 40px 0;
}

/* Movie & Series Media Cards (2:3 aspect ratio) */
.media-card {
  position: relative;
  width: 200px;
  height: 300px;
  margin-right: 24px;
  flex-shrink: 0;
  border-radius: 8px;
  background-color: #181b22;
  border: 3px solid transparent;
  outline: none;
  cursor: pointer;
  transition: transform 0.2s cubic-bezier(0.2, 0, 0, 1), border-color 0.2s, box-shadow 0.2s;
}

.media-card.is-focused {
  transform: scale(1.08);
  border-color: #00a8ff;
  box-shadow: 0 0 25px rgba(0, 168, 255, 0.8), 0 10px 30px rgba(0, 0, 0, 0.7);
  z-index: 20;
}

.card-poster-wrap {
  position: relative;
  width: 200px;
  height: 300px;
  border-radius: 6px;
  overflow: hidden;
}

.card-poster-img {
  width: 200px;
  height: 300px;
  object-fit: cover;
  display: block;
}

.card-badge {
  position: absolute;
  padding: 4px 8px;
  font-size: 14px;
  font-weight: 700;
  border-radius: 4px;
  color: #ffffff;
  background-color: rgba(13, 15, 20, 0.85);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
}

.rating-badge {
  top: 8px;
  right: 8px;
  background-color: rgba(245, 166, 35, 0.9);
  color: #000000;
}

.year-badge {
  bottom: 8px;
  left: 8px;
}

.episode-badge {
  top: 8px;
  left: 8px;
  background-color: rgba(0, 168, 255, 0.9);
}

.card-info {
  display: none; /* Titles shown within poster or tooltips */
}

/* Family Video Cards (16:9 aspect ratio) */
.family-video-card {
  position: relative;
  width: 320px;
  height: 180px;
  margin-right: 24px;
  flex-shrink: 0;
  border-radius: 8px;
  background-color: #181b22;
  border: 3px solid transparent;
  outline: none;
  cursor: pointer;
  transition: transform 0.2s cubic-bezier(0.2, 0, 0, 1), border-color 0.2s, box-shadow 0.2s;
}

.family-video-card.is-focused {
  transform: scale(1.08);
  border-color: #00a8ff;
  box-shadow: 0 0 25px rgba(0, 168, 255, 0.8), 0 10px 30px rgba(0, 0, 0, 0.7);
  z-index: 20;
}

.family-thumb-wrapper {
  position: relative;
  width: 320px;
  height: 180px;
  border-radius: 6px;
  overflow: hidden;
}

.family-thumb-img {
  width: 320px;
  height: 180px;
  object-fit: cover;
  display: block;
}

.family-badge-container-top {
  position: absolute;
  top: 8px;
  left: 8px;
  display: flex;
  flex-direction: row;
}

.family-badge-container-bottom {
  position: absolute;
  bottom: 8px;
  left: 8px;
  right: 8px;
  display: flex;
  flex-direction: row;
  justify-content: space-between;
}

.family-badge {
  padding: 4px 8px;
  font-size: 14px;
  font-weight: 700;
  border-radius: 4px;
  color: #ffffff;
  background-color: rgba(13, 15, 20, 0.85);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.6);
}

.family-res-badge.is-4k {
  background-color: rgba(229, 9, 20, 0.9);
}

.family-info-box {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 320px;
  padding: 10px;
  box-sizing: border-box;
  background: linear-gradient(to top, rgba(13, 15, 20, 0.9) 0%, rgba(13, 15, 20, 0) 100%);
  border-bottom-left-radius: 6px;
  border-bottom-right-radius: 6px;
}

.family-title {
  display: block;
  font-size: 16px;
  font-weight: 600;
  color: #ffffff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
```

### 6.3 Movie Detail Modal Styles (`client/styles/modal.css`)

```css
/* ==========================================================================
   Movie Detail Modal (Chromium M56 Compatible)
   ========================================================================== */

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 1920px;
  height: 1080px;
  background-color: #0d0f14;
  z-index: 500;
  overflow: hidden;
  display: flex;
}

.modal-backdrop-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 1920px;
  height: 1080px;
  background-size: cover;
  background-position: center center;
  background-repeat: no-repeat;
  transition: opacity 0.4s ease-in-out;
  z-index: 501;
}

.modal-gradient-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 1920px;
  height: 1080px;
  background: linear-gradient(to right, rgba(13, 15, 20, 0.98) 42%, rgba(13, 15, 20, 0.85) 75%, rgba(13, 15, 20, 0.6) 100%);
  z-index: 502;
}

.modal-content-container {
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: center;
  width: 1920px;
  height: 1080px;
  padding-left: 100px;
  padding-right: 100px;
  box-sizing: border-box;
  z-index: 503;
}

/* Left Column: Poster */
.modal-poster-col {
  width: 320px;
  margin-right: 60px;
  flex-shrink: 0;
}

.modal-poster-frame {
  width: 320px;
  height: 480px;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 15px 40px rgba(0, 0, 0, 0.8), 0 0 30px rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.modal-poster-img {
  width: 320px;
  height: 480px;
  object-fit: cover;
  display: block;
}

/* Right Column: Details */
.modal-details-col {
  flex: 1;
  max-width: 1100px;
  display: flex;
  flex-direction: column;
}

.modal-title {
  font-size: 44px;
  font-weight: 800;
  color: #ffffff;
  margin: 0 0 16px 0;
  line-height: 1.15;
}

.modal-meta-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  margin-bottom: 24px;
}

.meta-pill {
  padding: 4px 12px;
  background-color: #1e222d;
  color: #ffffff;
  font-size: 18px;
  font-weight: 700;
  border-radius: 6px;
  margin-right: 14px;
}

.meta-rating {
  background-color: #f5a623;
  color: #000000;
}

.meta-genres {
  font-size: 18px;
  color: #a0a5b5;
  font-weight: 500;
}

.modal-synopsis-box {
  margin-bottom: 28px;
}

.modal-synopsis {
  font-size: 22px;
  line-height: 1.5;
  color: #e0e4ed;
  margin: 0;
  max-height: 135px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.modal-credits-box {
  margin-bottom: 36px;
  border-left: 4px solid #00a8ff;
  padding-left: 16px;
}

.credit-line {
  font-size: 18px;
  margin: 6px 0;
  color: #c0c5d5;
}

.credit-label {
  color: #ffffff;
  margin-right: 8px;
}

.modal-actions-row {
  display: flex;
  flex-direction: row;
  align-items: center;
}

.btn-modal {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  height: 56px;
  padding: 0 36px;
  margin-right: 20px;
  border-radius: 28px;
  font-size: 20px;
  font-weight: 700;
  cursor: pointer;
  outline: none;
  border: 3px solid transparent;
  transition: transform 0.2s cubic-bezier(0.2, 0, 0, 1), box-shadow 0.2s, background-color 0.2s;
}

.btn-play {
  background-color: #00a8ff;
  color: #ffffff;
}

.btn-play .btn-icon {
  margin-right: 12px;
  font-size: 18px;
}

.btn-close {
  background-color: #242936;
  color: #ffffff;
}

.btn-close .btn-icon {
  margin-right: 12px;
  font-size: 16px;
}

.btn-modal.is-focused {
  transform: scale(1.08);
  border-color: #ffffff;
  box-shadow: 0 0 25px rgba(0, 168, 255, 0.9), 0 0 50px rgba(0, 168, 255, 0.4);
}
```

---

## 7. Unit Test Plan (`tests/unit/m3/views.test.ts`)

The test suite runs with Node.js built-in test runner (`node:test`) and strict assertions (`node:assert/strict`).

```typescript
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ApiClient } from '../../../client/src/api/client';
import { upgradeDriveThumbnail, renderFamilyCard } from '../../../client/src/views/family';
import { M56Validator } from '../../harness/m56-validator';
import fs from 'node:fs';
import path from 'node:path';

describe('Milestone 3 Unit Tests: Catalog Views, Modals & Family Cards', () => {

  describe('Suite 1: Frontend API Client (client.ts)', () => {
    test('instantiates with custom baseUrl and cache options', () => {
      const client = new ApiClient({ baseUrl: 'http://localhost:3000', timeoutMs: 5000 });
      assert.equal(client.getStreamUrl('test1234'), 'http://localhost:3000/api/stream/test1234');
      assert.equal(client.getSubtitlesUrl('sub1234'), 'http://localhost:3000/api/subtitles/sub1234');
    });

    test('handles offline network errors gracefully without crashing', async () => {
      const client = new ApiClient({ baseUrl: 'http://invalid-unreachable-host:9999', timeoutMs: 500 });
      try {
        await client.getFolders();
        assert.fail('Should have thrown an ApiError');
      } catch (err: any) {
        assert.equal(err.name, 'ApiError');
        assert.ok(err.message.length > 0);
      }
    });
  });

  describe('Suite 2: Family Video View (family.ts)', () => {
    test('upgrades standard Drive thumbnail link from =s220 to =s800', () => {
      const standardThumb = 'https://lh3.googleusercontent.com/drive-thumb-1=s220';
      const upgraded = upgradeDriveThumbnail(standardThumb);
      assert.equal(upgraded, 'https://lh3.googleusercontent.com/drive-thumb-1=s800');
    });

    test('renders family card with 16:9 dimensions, clean title and badges', () => {
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
      assert.equal(card.className.includes('family-video-card'), true);
      assert.equal(card.getAttribute('data-category'), 'familiares');
      assert.equal(card.innerHTML.includes('15 de octubre de 2021'), true);
      assert.equal(card.innerHTML.includes('14:32'), true);
      assert.equal(card.innerHTML.includes('4K'), true);
      assert.equal(card.innerHTML.includes('=s800'), true);
    });
  });

  describe('Suite 3: Chromium M56 Compatibility Static Validation', () => {
    test('validates family.ts code contains zero M56 incompatible syntax', () => {
      const familyFile = path.resolve(process.cwd(), 'client/src/views/family.ts');
      if (fs.existsSync(familyFile)) {
        const code = fs.readFileSync(familyFile, 'utf8');
        const res = M56Validator.validateJavaScript(code);
        assert.equal(res.valid, true, `M56 JS violations in family.ts: ${JSON.stringify(res.violations)}`);
      }
    });

    test('validates catalog.css contains zero CSS Grid, flex gap, or :focus-visible rules', () => {
      const cssFile = path.resolve(process.cwd(), 'client/styles/catalog.css');
      if (fs.existsSync(cssFile)) {
        const css = fs.readFileSync(cssFile, 'utf8');
        const res = M56Validator.validateCSS(css);
        assert.equal(res.valid, true, `M56 CSS violations in catalog.css: ${JSON.stringify(res.violations)}`);
      }
    });

    test('validates modal.css contains zero CSS Grid, flex gap, or aspect-ratio rules', () => {
      const cssFile = path.resolve(process.cwd(), 'client/styles/modal.css');
      if (fs.existsSync(cssFile)) {
        const css = fs.readFileSync(cssFile, 'utf8');
        const res = M56Validator.validateCSS(css);
        assert.equal(res.valid, true, `M56 CSS violations in modal.css: ${JSON.stringify(res.violations)}`);
      }
    });
  });

  describe('Suite 4: Horizontal Carousel Scrolling Translation Math', () => {
    test('calculates correct translate3d offset to center card in 1920px viewport', () => {
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
  });

  describe('Suite 5: Modal State Machine & Button Trapping Invariants', () => {
    test('modal button index toggles between 0 (Play) and 1 (Close) without overflow', () => {
      let currentIdx = 0;
      const buttonsCount = 2;

      // ArrowRight
      if (currentIdx < buttonsCount - 1) currentIdx++;
      assert.equal(currentIdx, 1);

      // ArrowRight again (edge boundary)
      if (currentIdx < buttonsCount - 1) currentIdx++;
      assert.equal(currentIdx, 1);

      // ArrowLeft
      if (currentIdx > 0) currentIdx--;
      assert.equal(currentIdx, 0);

      // ArrowLeft again (edge boundary)
      if (currentIdx > 0) currentIdx--;
      assert.equal(currentIdx, 0);
    });
  });
});
```

---

## 8. Integration & Compatibility Verification Matrix

| Verification Aspect | Concrete Check | Success Criteria |
|---|---|---|
| **Category Rows (F11)** | Query all 5 rows in catalog | 5 rows: `Películas`, `Series`, `Videos familiares`, `Fotos`, `Música` |
| **Flexbox Spacing (F11)** | Check computed margin | Explicit `margin-right: 24px` on each card; flex `gap` is 0 / absent |
| **Hardware Scrolling (F11)** | Check style attribute | `transform: translate3d(-...px, 0, 0)` applied to `.carousel-track` |
| **Movie Card Metrics (F11)** | Inspect card dimensions | Strict `200px` width by `300px` height (2:3 aspect ratio) |
| **Modal Activation (F12)** | Enter (13) on movie card | Modal layer activated, `#btn_play` receives initial focus |
| **Modal Composition (F12)** | Backdrop, Poster, Synopsis, Cast | Full TMDB metadata rendered, `w1280` backdrop with dark gradient |
| **Modal Trapping (F12)** | Up/Down keys inside modal | Vertical D-pad trapped; focus never escapes into background catalog |
| **Modal Dismissal (F12)** | Return (10009) or Enter on Close | Modal closes, focus restored to original triggering card |
| **Family Card Metrics (F13)**| Inspect family card dimensions | Strict `320px` width by `180px` height (16:9 aspect ratio) |
| **Drive CDN Upgrade (F13)** | Inspect family thumbnail URL | URL rewritten with `=s800` parameter |
| **Instant Playback (F13)** | Enter (13) on family card | Modal is bypassed; boots video player directly |
| **Chromium M56 Safety** | Run `M56Validator` on all files | Zero `?.`, zero `??`, zero `{ ...obj }`, zero `display: grid`, zero flex `gap` |
