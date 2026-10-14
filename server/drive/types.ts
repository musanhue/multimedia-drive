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

  // TMDB Cinematic Fields (F7)
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

export interface CategoryFolderMap {
  peliculas?: string;
  series?: string;
  familiares?: string;
  fotos?: string;
  musica?: string;
  [key: string]: string | undefined;
}

export interface FolderNode {
  id: string;
  name: string;
  category: MediaCategory;
  filesCount?: number;
  subfoldersCount?: number;
}
