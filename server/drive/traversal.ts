import { drive_v3 } from 'googleapis';
import { getDriveClient } from './client';
import {
  MediaCategory,
  DriveMediaItem,
  CategoryFolderMap,
  FolderNode,
  SubtitleTrack,
} from './types';
import { memoryCache } from './cache';
import { matchSubtitlesForVideo } from '../subtitles/matcher';

export function normalizeString(str: string): string {
  if (!str || typeof str !== 'string') return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\/+$/, '')
    .trim()
    .toLowerCase();
}

export function matchCategory(folderName: string): MediaCategory | null {
  if (!folderName || typeof folderName !== 'string') return null;
  const norm = normalizeString(folderName);
  if (/^(peliculas|cine|movies)$/.test(norm)) return 'peliculas';
  if (/^(series|tv|shows|series tv|tv shows)$/.test(norm)) return 'series';
  if (/^(videos familiares|familia|home videos|videos caseros|videos|videos_familiares|familiares)$/.test(norm)) {
    return 'familiares';
  }
  if (/^(fotos|fotografias|photos|imagenes)$/.test(norm)) return 'fotos';
  if (/^(musica|music|audio)$/.test(norm)) return 'musica';
  return null;
}

export function normalizeCategoryParam(param: string): MediaCategory | null {
  if (!param || typeof param !== 'string') return null;
  const norm = normalizeString(param);
  return matchCategory(norm);
}

export function transformThumbnailLink(link?: string | null): string | undefined {
  if (!link) return undefined;
  if (/=[sw]\d+.*$/.test(link)) {
    return link.replace(/=[sw]\d+.*$/, '=w800');
  }
  return `${link}=w800`;
}

const MIME_EXTENSIONS: Record<string, string> = {
  mkv: 'video/x-matroska',
  mp4: 'video/mp4',
  avi: 'video/x-msvideo',
  mov: 'video/quicktime',
  wmv: 'video/x-ms-wmv',
  ts: 'video/mp2t',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
  aac: 'audio/aac',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  srt: 'text/plain',
  vtt: 'text/vtt',
};

export function inferMimeType(name: string, reportedMime?: string | null): string {
  if (reportedMime && reportedMime !== 'application/octet-stream') {
    return reportedMime;
  }
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return MIME_EXTENSIONS[ext] || reportedMime || 'application/octet-stream';
}

export function parseSeriesEpisodeInfo(filename: string): { season?: number; episode?: number } {
  const match = filename.match(/(?:s(\d{1,2})e(\d{1,2})|(\d{1,2})x(\d{1,2})|season[._\s-]*(\d{1,2})[._\s-]*episode[._\s-]*(\d{1,2}))/i);
  if (match) {
    const season = parseInt(match[1] || match[3] || match[5], 10);
    const episode = parseInt(match[2] || match[4] || match[6], 10);
    return { season, episode };
  }
  return {};
}

export class DriveTraversalEngine {
  private drive?: drive_v3.Drive;
  private rootFolderId?: string;

  constructor(drive?: drive_v3.Drive, rootFolderId?: string) {
    this.drive = drive;
    this.rootFolderId = rootFolderId;
  }

  private getClient(): drive_v3.Drive {
    return this.drive || getDriveClient();
  }

  private getRootId(): string {
    return this.rootFolderId || process.env.DRIVE_ROOT_FOLDER_ID || '';
  }

  /**
   * Resolves the IDs of the main category folders under DRIVE_ROOT_FOLDER_ID
   */
  async resolveCategoryFolders(): Promise<{ categoryMap: CategoryFolderMap; folders: FolderNode[] }> {
    const rootId = this.getRootId();
    const cacheKey = `categories_map:${rootId}`;
    const cached = memoryCache.get<{ categoryMap: CategoryFolderMap; folders: FolderNode[] }>(cacheKey);
    if (cached) return cached;

    const driveClient = this.getClient();
    const query = `'${rootId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const res = await driveClient.files.list({
      q: query,
      pageSize: 100,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      fields: 'files(id, name)',
    });

    const categoryMap: CategoryFolderMap = {};
    const folders: FolderNode[] = [];
    const files = res.data.files || [];

    for (const folder of files) {
      if (!folder.name || !folder.id) continue;
      const matched = matchCategory(folder.name);
      if (matched && !categoryMap[matched]) {
        categoryMap[matched] = folder.id;
        folders.push({
          id: folder.id,
          name: folder.name,
          category: matched,
        });
      }
    }

    const result = { categoryMap, folders };
    // Cache categories map for 10 minutes
    memoryCache.set(cacheKey, result, 600000);
    return result;
  }

  /**
   * Recursively traverses and lists items in a category
   */
  async listCategoryItems(category: MediaCategory): Promise<DriveMediaItem[]> {
    const cacheKey = `category_items:${category}`;
    const cached = memoryCache.get<DriveMediaItem[]>(cacheKey);
    if (cached) return cached;

    const { categoryMap } = await this.resolveCategoryFolders();
    const folderId = categoryMap[category];

    if (!folderId) {
      console.warn(`Category folder not found for: ${category}`);
      return [];
    }

    const rawFiles = await this.traverseFolder(folderId, category, folderId);

    // Group subtitles strictly by parentFolderId to eliminate cross-folder contamination
    const videoFiles = rawFiles.filter(
      (f) => !f.isFolder && (f.mimeType.startsWith('video/') || ['mkv', 'mp4', 'avi', 'mov', 'wmv'].includes(f.extension || ''))
    );
    const subtitleFiles = rawFiles.filter(
      (f) => !f.isFolder && (f.extension === 'srt' || f.extension === 'vtt')
    );

    const subtitlesByFolder = new Map<string, Array<{ id: string; name: string; size?: number }>>();
    for (const sub of subtitleFiles) {
      const parentId = sub.parentFolderId || '__root__';
      const list = subtitlesByFolder.get(parentId) || [];
      list.push({ id: sub.id, name: sub.name, size: sub.size });
      subtitlesByFolder.set(parentId, list);
    }

    for (const video of videoFiles) {
      const parentId = video.parentFolderId || '__root__';
      const folderSubs = subtitlesByFolder.get(parentId) || [];
      const matchedSubs = matchSubtitlesForVideo(video.name, folderSubs);
      video.subtitles = matchedSubs;
    }

    // Cache category items for 10 minutes
    memoryCache.set(cacheKey, rawFiles, 600000);
    return rawFiles;
  }

  /**
   * Recursive traversal through folders
   */
  private async traverseFolder(
    folderId: string,
    category: MediaCategory,
    parentFolderId: string,
    parentFolderName?: string
  ): Promise<DriveMediaItem[]> {
    const driveClient = this.getClient();
    const query = `'${folderId}' in parents and trashed = false`;
    let pageToken: string | undefined = undefined;
    const items: DriveMediaItem[] = [];
    const subfolderPromises: Promise<DriveMediaItem[]>[] = [];

    do {
      const res: any = await driveClient.files.list({
        q: query,
        pageSize: 1000,
        pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        fields: 'nextPageToken, files(id, name, mimeType, size, createdTime, modifiedTime, thumbnailLink, videoMediaMetadata, imageMediaMetadata)',
      });

      const files = res.data.files || [];
      for (const file of files) {
        if (!file.id || !file.name) continue;

        const isFolder = file.mimeType === 'application/vnd.google-apps.folder';

        if (isFolder) {
          subfolderPromises.push(
            this.traverseFolder(file.id, category, folderId, file.name)
          );
        } else {
          const mediaItem = this.mapToDriveMediaItem(file, category, folderId, parentFolderName);
          if (this.isRelevantForCategory(mediaItem, category)) {
            items.push(mediaItem);
            // Cache individual file metadata for 2 hours
            memoryCache.set(`file_meta:${mediaItem.id}`, mediaItem, 7200000);
          }
        }
      }

      pageToken = res.data.nextPageToken || undefined;
    } while (pageToken);

    const subResults = await Promise.all(subfolderPromises);
    for (const subItems of subResults) {
      items.push(...subItems);
    }

    return items;
  }

  /**
   * Maps Google Drive file schema to normalized DriveMediaItem
   */
  mapToDriveMediaItem(
    file: drive_v3.Schema$File,
    category: MediaCategory,
    parentFolderId: string,
    parentFolderName?: string
  ): DriveMediaItem {
    const name = file.name || 'Untitled';
    const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
    const mimeType = isFolder ? file.mimeType! : inferMimeType(name, file.mimeType);
    const size = parseInt(file.size || '0', 10);
    const createdTime = file.createdTime || undefined;
    const modifiedTime = file.modifiedTime || new Date().toISOString();
    const durationMillis = file.videoMediaMetadata?.durationMillis
      ? parseInt(file.videoMediaMetadata.durationMillis, 10)
      : undefined;
    const width = file.videoMediaMetadata?.width || file.imageMediaMetadata?.width || undefined;
    const height = file.videoMediaMetadata?.height || file.imageMediaMetadata?.height || undefined;
    const thumbnailUrl = transformThumbnailLink(file.thumbnailLink);
    const extension = name.includes('.') ? name.split('.').pop()?.toLowerCase() : undefined;
    const seriesInfo = category === 'series' ? parseSeriesEpisodeInfo(name) : {};

    return {
      id: file.id!,
      name,
      mimeType,
      size,
      createdTime,
      modifiedTime,
      category,
      thumbnailUrl,
      thumbnailLink: thumbnailUrl,
      durationMillis,
      width,
      height,
      parentFolderId,
      parentFolderName,
      isFolder,
      extension,
      season: seriesInfo.season,
      episode: seriesInfo.episode,
      tmdbEnriched: category !== 'familiares',
    };
  }

  private isRelevantForCategory(item: DriveMediaItem, category: MediaCategory): boolean {
    const ext = item.extension || '';

    if (category === 'peliculas' || category === 'series' || category === 'familiares') {
      return (
        item.mimeType.startsWith('video/') ||
        ['mkv', 'mp4', 'avi', 'mov', 'wmv', 'ts', 'm4v', 'webm', 'srt', 'vtt'].includes(ext)
      );
    }

    if (category === 'fotos') {
      return (
        item.mimeType.startsWith('image/') ||
        ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'].includes(ext)
      );
    }

    if (category === 'musica') {
      return (
        item.mimeType.startsWith('audio/') ||
        ['mp3', 'flac', 'aac', 'm4a', 'wav', 'ogg'].includes(ext)
      );
    }

    return true;
  }
}
