import fs from 'fs';
import path from 'path';
import { getConfig } from '../config';

// ---------------------------------------------------------------------------
// Type Definitions & Interfaces
// ---------------------------------------------------------------------------

export interface EnrichedMetadata {
  id: number | null;
  title: string;
  originalTitle: string;
  year: number | null;
  overview: string;
  posterUrl: string;
  backdropUrl: string | null;
  rating: number;
  runtime: string | null;
  director: string;
  cast: string[];
  genres: string[];
  isSeries?: boolean;
  season?: number | null;
  episode?: number | null;
  cached: boolean;
}

export interface TMDBClientOptions {
  apiKey?: string;
  language?: string;
  cacheFilePath?: string;
  cacheTtlMs?: number;
  maxMemoryItems?: number;
  maxConcurrency?: number;
  throttlePauseMs?: number;
  requestTimeoutMs?: number;
}

interface DiskCacheRecord {
  data: Omit<EnrichedMetadata, 'cached'>;
  timestamp: number;
  expiresAt: number;
}

interface DiskCacheStructure {
  version: number;
  entries: Record<string, DiskCacheRecord>;
}

// ---------------------------------------------------------------------------
// Concurrency Throttler
// ---------------------------------------------------------------------------

export class RequestThrottler {
  private maxConcurrency: number;
  private pauseMs: number;
  private running = 0;
  private queue: Array<() => void> = [];

  constructor(maxConcurrency = 4, pauseMs = 100) {
    this.maxConcurrency = maxConcurrency;
    this.pauseMs = pauseMs;
  }

  async enqueue<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const execute = async () => {
        this.running++;
        try {
          const result = await task();
          resolve(result);
        } catch (err) {
          reject(err);
        } finally {
          this.running--;
          if (this.pauseMs > 0) {
            await new Promise((r) => setTimeout(r, this.pauseMs));
          }
          this.dequeue();
        }
      };

      if (this.running < this.maxConcurrency) {
        execute();
      } else {
        this.queue.push(execute);
      }
    });
  }

  private dequeue(): void {
    if (this.running < this.maxConcurrency && this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) next();
    }
  }

  getPendingCount(): number {
    return this.queue.length;
  }

  getActiveCount(): number {
    return this.running;
  }
}

// ---------------------------------------------------------------------------
// 2-Tier Cache: In-Memory LRU + Persistent JSON Disk
// ---------------------------------------------------------------------------

export class TwoTierCache {
  private memoryCache: Map<string, DiskCacheRecord> = new Map();
  private diskRecords: Map<string, DiskCacheRecord> = new Map();
  private maxMemoryItems: number;
  private cacheFilePath: string;
  private cacheTtlMs: number;
  private saveTimeout: NodeJS.Timeout | null = null;
  private dirty = false;

  constructor(
    cacheFilePath: string,
    cacheTtlMs = 30 * 24 * 60 * 60 * 1000, // 30 days
    maxMemoryItems = 1000
  ) {
    this.cacheFilePath = cacheFilePath;
    this.cacheTtlMs = cacheTtlMs;
    this.maxMemoryItems = maxMemoryItems;
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    try {
      const dir = path.dirname(this.cacheFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (fs.existsSync(this.cacheFilePath)) {
        const raw = fs.readFileSync(this.cacheFilePath, 'utf8');
        const parsed: DiskCacheStructure = JSON.parse(raw);
        const now = Date.now();

        if (parsed && typeof parsed.entries === 'object') {
          for (const [key, entry] of Object.entries(parsed.entries)) {
            if (entry && entry.expiresAt && now < entry.expiresAt) {
              this.diskRecords.set(key, entry);
              // Warm Tier 1 memory cache
              if (this.memoryCache.size < this.maxMemoryItems) {
                this.memoryCache.set(key, entry);
              }
            }
          }
        }
      }
    } catch (err: any) {
      console.warn(`[TMDB Cache] Failed to load disk cache (${this.cacheFilePath}):`, err.message);
      try {
        if (fs.existsSync(this.cacheFilePath)) {
          fs.renameSync(this.cacheFilePath, `${this.cacheFilePath}.corrupt.${Date.now()}`);
        }
      } catch {}
    }
  }

  get(key: string): Omit<EnrichedMetadata, 'cached'> | null {
    const now = Date.now();

    // 1. Check Tier 1: Memory LRU
    const memEntry = this.memoryCache.get(key);
    if (memEntry) {
      if (now > memEntry.expiresAt) {
        this.memoryCache.delete(key);
        this.diskRecords.delete(key);
        this.scheduleSave();
        return null;
      }
      // Re-insert for LRU update
      this.memoryCache.delete(key);
      this.memoryCache.set(key, memEntry);
      return memEntry.data;
    }

    // 2. Check Tier 2: Disk Records
    const diskEntry = this.diskRecords.get(key);
    if (diskEntry) {
      if (now > diskEntry.expiresAt) {
        this.diskRecords.delete(key);
        this.scheduleSave();
        return null;
      }
      // Promote to Tier 1
      this.setMemory(key, diskEntry);
      return diskEntry.data;
    }

    return null;
  }

  set(key: string, data: Omit<EnrichedMetadata, 'cached'>): void {
    const now = Date.now();
    const record: DiskCacheRecord = {
      data,
      timestamp: now,
      expiresAt: now + this.cacheTtlMs,
    };

    this.setMemory(key, record);
    this.diskRecords.set(key, record);
    this.dirty = true;
    this.scheduleSave();
  }

  private setMemory(key: string, record: DiskCacheRecord): void {
    if (this.memoryCache.has(key)) {
      this.memoryCache.delete(key);
    } else if (this.memoryCache.size >= this.maxMemoryItems) {
      // Evict least recently used (first key in iteration)
      const oldestKey = this.memoryCache.keys().next().value;
      if (oldestKey) {
        this.memoryCache.delete(oldestKey);
      }
    }
    this.memoryCache.set(key, record);
  }

  findPartialMatch(prefix: string): Omit<EnrichedMetadata, 'cached'> | null {
    const now = Date.now();
    for (const [key, entry] of this.memoryCache.entries()) {
      if (key.startsWith(prefix) && now <= entry.expiresAt) {
        return entry.data;
      }
    }
    for (const [key, entry] of this.diskRecords.entries()) {
      if (key.startsWith(prefix) && now <= entry.expiresAt) {
        this.setMemory(key, entry);
        return entry.data;
      }
    }
    return null;
  }

  private scheduleSave(): void {
    if (this.saveTimeout) return;
    this.saveTimeout = setTimeout(() => {
      this.saveTimeout = null;
      this.flushSync();
    }, 500);
    if (this.saveTimeout.unref) {
      this.saveTimeout.unref();
    }
  }

  flushSync(): void {
    if (!this.dirty && !fs.existsSync(this.cacheFilePath)) return;
    try {
      const dir = path.dirname(this.cacheFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const payload: DiskCacheStructure = {
        version: 1,
        entries: Object.fromEntries(this.diskRecords.entries()),
      };

      const tmpPath = `${this.cacheFilePath}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2), 'utf8');
      fs.renameSync(tmpPath, this.cacheFilePath);
      this.dirty = false;
    } catch (err: any) {
      console.warn(`[TMDB Cache] Error saving cache to disk: ${err.message}`);
    }
  }

  clear(): void {
    this.memoryCache.clear();
    this.diskRecords.clear();
    this.dirty = true;
    this.flushSync();
  }

  size(): { memory: number; disk: number } {
    return {
      memory: this.memoryCache.size,
      disk: this.diskRecords.size,
    };
  }
}

// ---------------------------------------------------------------------------
// TMDB API v3 Client
// ---------------------------------------------------------------------------

export class TMDBClient {
  private apiKey: string;
  private language: string;
  private cache: TwoTierCache;
  private throttler: RequestThrottler;
  private requestTimeoutMs: number;
  private inFlightPromises: Map<string, Promise<EnrichedMetadata>> = new Map();
  private mockOracleRecords: Record<string, any> | null = null;

  constructor(options?: TMDBClientOptions) {
    const config = getConfig();
    this.apiKey = options?.apiKey || config.tmdbApiKey || '';
    this.language = options?.language || 'es-ES';
    this.requestTimeoutMs = options?.requestTimeoutMs || 5000;

    const cachePath = options?.cacheFilePath || path.resolve(process.cwd(), 'cache', 'tmdb_cache.json');
    const ttl = options?.cacheTtlMs || 30 * 24 * 60 * 60 * 1000;
    const maxItems = options?.maxMemoryItems || 1000;

    this.cache = new TwoTierCache(cachePath, ttl, maxItems);
    this.throttler = new RequestThrottler(options?.maxConcurrency || 4, options?.throttlePauseMs || 100);

    this.loadMockOracle();
  }

  private loadMockOracle(): void {
    try {
      const mockModule = require(path.resolve(process.cwd(), 'tests/harness/mock-data'));
      if (mockModule && mockModule.TMDB_RECORDS) {
        this.mockOracleRecords = mockModule.TMDB_RECORDS;
      }
    } catch {
      this.mockOracleRecords = null;
    }
  }

  /**
   * Generates a normalized cache key.
   */
  public generateCacheKey(title: string, year?: number | null, isSeries?: boolean): string {
    const norm = (title || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    const type = isSeries ? 'tv' : 'movie';
    const yr = year ? String(year) : 'none';
    return `tmdb_${type}_${norm}_${yr}`;
  }

  /**
   * Main entrypoint: Enriches media metadata with 2-tier caching, throttling, and fallback.
   */
  async enrich(params: {
    title: string;
    year?: number | null;
    isSeries?: boolean;
    season?: number | null;
    episode?: number | null;
    category?: string | null;
  }): Promise<EnrichedMetadata> {
    const title = (params.title || '').trim();
    const year = params.year ? Number(params.year) : null;
    const isSeries = Boolean(params.isSeries);
    const key = this.generateCacheKey(title, year, isSeries);

    // If title is empty, immediately return graceful default without caching
    if (!title) {
      return this.createGracefulFallback('', year, isSeries, params.season, params.episode);
    }

    // 1. Check Cache (Tier 1 & Tier 2)
    const cachedData = this.cache.get(key);
    if (cachedData) {
      return {
        ...cachedData,
        season: params.season ?? cachedData.season,
        episode: params.episode ?? cachedData.episode,
        cached: true,
      };
    }

    // 1b. Check fuzzy yearless match in cache if year was omitted or mismatched
    const prefix = `tmdb_${isSeries ? 'tv' : 'movie'}_${title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')}_`;
    const fuzzyMatch = this.cache.findPartialMatch(prefix);
    if (fuzzyMatch && !year) {
      return {
        ...fuzzyMatch,
        season: params.season ?? fuzzyMatch.season,
        episode: params.episode ?? fuzzyMatch.episode,
        cached: true,
      };
    }

    // 2. In-Flight Request Deduplication (Prevent duplicate concurrent requests)
    if (this.inFlightPromises.has(key)) {
      const pendingPromise = this.inFlightPromises.get(key)!;
      const res = await pendingPromise;
      return {
        ...res,
        season: params.season ?? res.season,
        episode: params.episode ?? res.episode,
        cached: true,
      };
    }

    // 3. Initiate New Request Task
    const fetchTask = this.executeEnrichment(title, year, isSeries, params.season, params.episode);
    this.inFlightPromises.set(key, fetchTask);

    try {
      const result = await fetchTask;
      // Persist to 2-tier cache
      const { cached, ...persistable } = result;
      this.cache.set(key, persistable);
      return result;
    } finally {
      this.inFlightPromises.delete(key);
    }
  }

  private async executeEnrichment(
    title: string,
    year: number | null,
    isSeries: boolean,
    season?: number | null,
    episode?: number | null
  ): Promise<EnrichedMetadata> {
    if (!this.apiKey) {
      this.apiKey = process.env.TMDB_API_KEY || getConfig().tmdbApiKey || '';
    }

    // Check Mock Oracle / Offline mode if API Key is not configured
    if (!this.apiKey) {
      const mockResult = this.findMockRecord(title, year, isSeries, season, episode);
      if (mockResult) return mockResult;
      return this.createGracefulFallback(title, year, isSeries, season, episode);
    }

    try {
      // Execute 4-Stage Fallback via Throttler
      const tmdbData = await this.throttler.enqueue(() =>
        this.searchAndFetchDetails(title, year, isSeries)
      );

      if (tmdbData) {
        return {
          ...tmdbData,
          isSeries,
          season: season ?? null,
          episode: episode ?? null,
          cached: false,
        };
      }
    } catch (err: any) {
      console.warn(`[TMDB Client] External request failed for "${title}":`, err.message);
    }

    // Final Fallback: Check Mock Oracle or return graceful fallback
    const mockResult = this.findMockRecord(title, year, isSeries, season, episode);
    if (mockResult) return mockResult;

    return this.createGracefulFallback(title, year, isSeries, season, episode);
  }

  /**
   * Multi-stage search execution (Stage 1 -> Stage 2 -> Stage 3)
   */
  private async searchAndFetchDetails(
    title: string,
    year: number | null,
    isSeries: boolean
  ): Promise<Omit<EnrichedMetadata, 'cached' | 'season' | 'episode'> | null> {
    let resultId: number | null = null;

    // Stage 1: Search with title + year (if year provided)
    if (year) {
      resultId = await this.performSearch(title, year, isSeries);
    }

    // Stage 2: Search with title alone (handles year mismatch or omitted year)
    if (!resultId) {
      resultId = await this.performSearch(title, null, isSeries);
    }

    // Stage 3: Strip secondary parenthetical phrases: "Title (Secondary)" -> "Title"
    if (!resultId) {
      const stripped = title.replace(/\s*[\(\[][^\]\)]*[\)\]]/g, '').trim();
      if (stripped && stripped !== title) {
        if (year) {
          resultId = await this.performSearch(stripped, year, isSeries);
        }
        if (!resultId) {
          resultId = await this.performSearch(stripped, null, isSeries);
        }
      }
    }

    if (!resultId) {
      return null;
    }

    // Fetch unified details + credits in a single roundtrip
    return this.fetchDetailsWithCredits(resultId, isSeries);
  }

  private async performSearch(title: string, year: number | null, isSeries: boolean): Promise<number | null> {
    const endpoint = isSeries ? 'search/tv' : 'search/movie';
    const params = new URLSearchParams({
      api_key: this.apiKey,
      language: this.language,
      query: title,
      include_adult: 'false',
    });

    if (year) {
      if (isSeries) {
        params.append('first_air_date_year', String(year));
      } else {
        params.append('year', String(year));
      }
    }

    const url = `https://api.themoviedb.org/3/${endpoint}?${params.toString()}`;
    const json = await this.fetchJsonWithTimeout(url);

    if (json && Array.isArray(json.results) && json.results.length > 0) {
      return json.results[0].id;
    }

    return null;
  }

  private async fetchDetailsWithCredits(
    id: number,
    isSeries: boolean
  ): Promise<Omit<EnrichedMetadata, 'cached' | 'season' | 'episode'> | null> {
    const endpoint = isSeries ? `tv/${id}` : `movie/${id}`;
    const params = new URLSearchParams({
      api_key: this.apiKey,
      language: this.language,
      append_to_response: 'credits',
    });

    const url = `https://api.themoviedb.org/3/${endpoint}?${params.toString()}`;
    const data = await this.fetchJsonWithTimeout(url);

    if (!data || !data.id) {
      return null;
    }

    const title = isSeries ? data.name : data.title;
    const originalTitle = isSeries ? data.original_name : data.original_title;
    const dateStr = isSeries ? data.first_air_date : data.release_date;
    const year = dateStr ? parseInt(dateStr.substring(0, 4), 10) : null;

    // Director / Creator
    let director = 'Desconocido';
    if (isSeries) {
      if (Array.isArray(data.created_by) && data.created_by.length > 0) {
        director = data.created_by.map((c: any) => c.name).join(', ');
      } else if (data.credits?.crew) {
        const found = data.credits.crew.find((c: any) => c.job === 'Director') ||
                      data.credits.crew.find((c: any) => c.job === 'Executive Producer');
        if (found) director = found.name;
      }
    } else {
      if (data.credits?.crew) {
        const found = data.credits.crew.find((c: any) => c.job === 'Director');
        if (found) director = found.name;
      }
    }

    // Top 5 cast
    const cast = data.credits?.cast
      ? data.credits.cast.slice(0, 5).map((c: any) => c.name)
      : [];

    // Genres
    const genres = Array.isArray(data.genres) ? data.genres.map((g: any) => g.name) : [];

    // Runtime
    const rawMinutes = isSeries
      ? (Array.isArray(data.episode_run_time) ? data.episode_run_time[0] : null)
      : data.runtime;
    const runtime = this.formatRuntime(rawMinutes);

    // Rating
    const rating = data.vote_average ? Number(data.vote_average.toFixed(1)) : 0;

    // Poster & Backdrop
    const posterUrl = data.poster_path
      ? `https://image.tmdb.org/t/p/w500${data.poster_path}`
      : `https://via.placeholder.com/500x750.png?text=${encodeURIComponent(title || 'Sin Cartel')}`;

    const backdropUrl = data.backdrop_path
      ? `https://image.tmdb.org/t/p/w1280${data.backdrop_path}`
      : null;

    return {
      id: data.id,
      title: title || '',
      originalTitle: originalTitle || title || '',
      year,
      overview: data.overview || 'Sinopsis no disponible en TMDB.',
      posterUrl,
      backdropUrl,
      rating,
      runtime,
      director,
      cast,
      genres,
      isSeries,
    };
  }

  private async fetchJsonWithTimeout(url: string): Promise<any> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private formatRuntime(minutes: number | null | undefined): string | null {
    if (!minutes || minutes <= 0) return null;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m}m`;
    const mStr = m < 10 ? `0${m}` : `${m}`;
    return `${h}h ${mStr}m`;
  }

  private findMockRecord(
    title: string,
    year: number | null,
    isSeries: boolean,
    season?: number | null,
    episode?: number | null
  ): EnrichedMetadata | null {
    if (!this.mockOracleRecords) return null;

    const lower = title.toLowerCase().trim();

    // 1. Specific match with year
    if (year) {
      const specificKey = `${lower}_${year}`;
      for (const [key, val] of Object.entries(this.mockOracleRecords)) {
        if (key === specificKey || key.includes(specificKey)) {
          return {
            ...val,
            isSeries,
            season: season ?? val.season ?? null,
            episode: episode ?? val.episode ?? null,
            cached: false,
          };
        }
      }
    }

    // 2. Substring match
    for (const [key, val] of Object.entries(this.mockOracleRecords)) {
      const baseKey = key.split('_')[0];
      if (key.includes(lower) || lower.includes(baseKey) || baseKey.includes(lower)) {
        return {
          ...val,
          isSeries,
          season: season ?? val.season ?? null,
          episode: episode ?? val.episode ?? null,
          cached: false,
        };
      }
    }
    return null;
  }

  private createGracefulFallback(
    title: string,
    year: number | null,
    isSeries: boolean,
    season?: number | null,
    episode?: number | null
  ): EnrichedMetadata {
    return {
      id: null,
      title,
      originalTitle: title,
      year: year || null,
      overview: 'Sinopsis no disponible en TMDB.',
      posterUrl: `https://via.placeholder.com/500x750.png?text=${encodeURIComponent(title || 'Sin Cartel')}`,
      backdropUrl: null,
      rating: 0,
      runtime: null,
      director: 'Desconocido',
      cast: [],
      genres: [],
      isSeries,
      season: season ?? null,
      episode: episode ?? null,
      cached: false,
    };
  }

  public flushCache(): void {
    this.cache.flushSync();
  }

  public clearCache(): void {
    this.cache.clear();
  }
}

export const tmdbClient = new TMDBClient();
export const tmdbService = tmdbClient;
export { TMDBClient as TMDBService };
