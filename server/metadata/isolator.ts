import { DriveMediaItem } from '../drive/types';

export class IsolationBarrierError extends Error {
  public readonly statusCode = 403;
  constructor(message: string = 'Strict Isolation Barrier: Family media is barred from external TMDB enrichment') {
    super(message);
    this.name = 'IsolationBarrierError';
  }
}

const FAMILY_CATEGORY_REGEX = /^(videos?[-_ ]*familiares?|familia(res)?|home[-_ ]*videos?|videos?[-_ ]*caseros?|videos)$/i;
const FAMILY_KEYWORD_REGEX = /\b(videos?[-_ ]*familiares?|home[-_ ]*videos?|familia(res)?|videos?[-_ ]*caseros?)\b/i;

const SPANISH_MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

export function normalizeText(str: string): string {
  if (!str || typeof str !== 'string') return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function isFamilyCategory(category?: string | null): boolean {
  if (!category) return false;
  const norm = normalizeText(category);
  return FAMILY_CATEGORY_REGEX.test(norm);
}

export function isFamilyFolder(folderPath?: string | null, folderName?: string | null): boolean {
  const combined = `${folderPath || ''}/${folderName || ''}`;
  const norm = normalizeText(combined);
  return FAMILY_KEYWORD_REGEX.test(norm);
}

export function containsFamilyKeywords(text?: string | null): boolean {
  if (!text) return false;
  const norm = normalizeText(text);
  return FAMILY_KEYWORD_REGEX.test(norm);
}

export function isFamilyContent(query: {
  category?: string | null;
  title?: string | null;
  folderPath?: string | null;
  folderName?: string | null;
}): boolean {
  if (query.category && isFamilyCategory(query.category)) return true;
  if (isFamilyFolder(query.folderPath, query.folderName)) return true;
  if (query.title && containsFamilyKeywords(query.title)) return true;
  return false;
}

export function assertFamilyIsolation(query: {
  category?: string | null;
  title?: string | null;
  folderPath?: string | null;
  folderName?: string | null;
}): void {
  if (isFamilyContent(query)) {
    throw new IsolationBarrierError();
  }
}

export function formatFamilyCleanTitle(filename: string): string {
  if (!filename || typeof filename !== 'string') return '';
  // 1. Strip file extension
  const base = filename.replace(/\.[a-zA-Z0-9]{2,4}$/, '');
  // 2. Replace underscores, dots, hyphens with spaces
  let spaced = base.replace(/[._-]+/g, ' ').trim();
  // 3. Collapse multiple spaces
  spaced = spaced.replace(/\s+/g, ' ');
  // 4. Title Case each word without Unicode boundary bugs
  return spaced
    .split(' ')
    .filter(Boolean)
    .map((word) => {
      const firstChar = word.charAt(0).toUpperCase();
      const rest = word.slice(1).toLowerCase();
      return firstChar + rest;
    })
    .join(' ');
}

export function formatSpanishDate(dateInput?: string | Date | null): string {
  if (!dateInput) return '';
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return '';
  const day = d.getUTCDate();
  const month = SPANISH_MONTHS[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  return `${day} de ${month} de ${year}`;
}

export function formatFamilyDuration(durationMillis?: number | string | null): string {
  if (!durationMillis) return '00:00';
  const millis = typeof durationMillis === 'string' ? parseInt(durationMillis, 10) : durationMillis;
  if (isNaN(millis) || millis <= 0) return '00:00';

  const totalSeconds = Math.floor(millis / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  const mm = minutes < 10 ? `0${minutes}` : `${minutes}`;
  const ss = seconds < 10 ? `0${seconds}` : `${seconds}`;

  return `${mm}:${ss}`;
}

export function getResolutionBadge(height?: number | null): '4K' | '1080p' | '720p' | 'SD' | undefined {
  if (!height || typeof height !== 'number' || height <= 0) return undefined;
  if (height >= 2160) return '4K';
  if (height >= 1080) return '1080p';
  if (height >= 720) return '720p';
  return 'SD';
}

export function upgradeThumbnailToHD(thumbnailLink?: string | null): string | undefined {
  if (!thumbnailLink) return undefined;
  if (/=[sw]\d+.*$/.test(thumbnailLink)) {
    return thumbnailLink.replace(/=[sw]\d+.*$/, '=s800');
  }
  return `${thumbnailLink}=s800`;
}

/**
 * Transforms a raw Drive media item into a strictly isolated family media item.
 * Guarantees zero TMDB fields and synthesizes native metadata.
 */
export function synthesizeFamilyMetadata(item: DriveMediaItem): DriveMediaItem {
  const cleanTitle = formatFamilyCleanTitle(item.name);
  const createdTime = item.createdTime || item.modifiedTime;
  const dateFormatted = formatSpanishDate(createdTime);
  const durationFormatted = formatFamilyDuration(item.durationMillis);
  const resolutionBadge = getResolutionBadge(item.height);
  const hdThumbnail = upgradeThumbnailToHD(item.thumbnailLink || item.thumbnailUrl);

  return {
    id: item.id,
    name: item.name,
    mimeType: item.mimeType,
    size: item.size,
    createdTime,
    modifiedTime: item.modifiedTime,
    category: 'familiares',
    cleanTitle,
    dateFormatted,
    durationMillis: item.durationMillis,
    durationFormatted,
    width: item.width,
    height: item.height,
    resolutionBadge,
    thumbnailLink: hdThumbnail,
    thumbnailUrl: hdThumbnail,
    parentFolderId: item.parentFolderId,
    parentFolderName: item.parentFolderName,
    isFolder: false,
    extension: item.extension,
    subtitles: item.subtitles || [],
    // Hard Barrier Invariants:
    tmdbEnriched: false,
    // Explicitly undefined commercial fields
    director: undefined,
    cast: undefined,
    overview: undefined,
    genres: undefined,
    rating: undefined,
    posterUrl: undefined,
    backdropUrl: undefined,
  };
}
