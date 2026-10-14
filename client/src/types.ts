/**
 * Core Type Definitions for Multimedia Drive Frontend (Chromium M56)
 */

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

export interface NavRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface NavNode {
  id: string;
  group?: string;
  row?: number;
  col?: number;
  rect?: NavRect;
  data?: any;
}

export interface LayerState {
  layerId: string;
  invokingId?: string | null;
  restoreRow?: number;
  restoreCol?: number;
  onClose?: () => void;
}

export interface KeyDispatchResult {
  handled: boolean;
  action?: string;
  layer?: string;
  focus?: NavNode | null;
  boundaryReached?: boolean;
  trapped?: boolean;
  reason?: string;
  keyCode?: number;
  currentTime?: number;
  index?: number;
  item?: any;
  restoredFocus?: any;
  playing?: boolean;
  autoAdvance?: boolean;
  isPlaying?: boolean;
  currentLayer?: string;
}
