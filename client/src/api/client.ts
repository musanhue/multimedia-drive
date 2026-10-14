import type {
  MediaCategory,
  SubtitleTrack,
  DriveMediaItem,
  CategoryFolder,
  FoldersResponse,
  CategoryFilesResponse
} from '../types';

export type {
  MediaCategory,
  SubtitleTrack,
  DriveMediaItem,
  CategoryFolder,
  FoldersResponse,
  CategoryFilesResponse
};

export interface ApiClientConfig {
  baseUrl?: string;
  timeoutMs?: number;
  cacheTtlMs?: number;
}

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
  public baseUrl: string;
  public timeoutMs: number;
  public cacheTtlMs: number;
  private cache: Map<string, CacheEntry<any>>;

  constructor(config?: ApiClientConfig) {
    var cfg = config || {};
    var defaultBase = 'https://multimedia-drive.onrender.com';
    if (typeof window !== 'undefined' && window.location && window.location.protocol !== 'file:' && window.location.origin) {
      defaultBase = window.location.origin;
    }
    this.baseUrl = cfg.baseUrl || defaultBase;
    this.timeoutMs = cfg.timeoutMs || 8000;
    this.cacheTtlMs = cfg.cacheTtlMs || 5 * 60 * 1000;
    this.cache = new Map();
  }

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

  private async getJson<T>(path: string): Promise<T> {
    var url = this.baseUrl + path;

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

  public async getFileMetadata(fileId: string): Promise<DriveMediaItem> {
    return this.getJson<DriveMediaItem>('/api/drive/file/' + encodeURIComponent(fileId));
  }

  public async enrichMetadata(title: string, year?: number | null, isSeries?: boolean): Promise<any> {
    var query = '?title=' + encodeURIComponent(title);
    if (year) query += '&year=' + encodeURIComponent(String(year));
    if (isSeries) query += '&isSeries=true';
    return this.getJson<any>('/api/metadata/enrich' + query);
  }

  public getStreamUrl(fileId: string): string {
    return (this.baseUrl || '') + '/api/stream/' + encodeURIComponent(fileId);
  }

  public getSubtitlesUrl(fileId: string): string {
    return (this.baseUrl || '') + '/api/subtitles/' + encodeURIComponent(fileId);
  }

  public async getAudioTracks(fileId: string): Promise<any[]> {
    var url = (this.baseUrl || '') + '/api/audio/list/' + encodeURIComponent(fileId);
    try {
      var res = await fetch(url);
      if (res.ok) {
        var data = await res.json();
        return Array.isArray(data.tracks) ? data.tracks : [];
      }
    } catch {
      // Fallback
    }
    return [];
  }

  public async refreshCache(): Promise<void> {
    this.cache.clear();
    try {
      await this.getJson('/api/drive/refresh');
    } catch {
      // Non-fatal if server refresh fails
    }
  }
}

export var apiClient = new ApiClient();
