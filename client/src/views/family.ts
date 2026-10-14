import type { DriveMediaItem } from '../types';

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
    ? '<div class="family-badge family-date-badge">' + item.dateFormatted + '</div>'
    : '';

  var resBadgeHtml = item.resolutionBadge
    ? '<div class="family-badge family-res-badge ' + (item.resolutionBadge === '4K' ? 'is-4k' : '') + '">' + item.resolutionBadge + '</div>'
    : '';

  var durationBadgeHtml = item.durationFormatted
    ? '<div class="family-badge family-duration-badge">' + item.durationFormatted + '</div>'
    : '';

  card.innerHTML =
    '<div class="family-thumb-wrapper">' +
      '<img class="family-thumb-img" src="' + thumbnailSrc + '" alt="' + displayTitle + '" onerror="this.src=\'' + fallbackSvg + '\'"/>' +
      '<div class="family-badge-container-top">' +
        dateBadgeHtml +
      '</div>' +
      '<div class="family-badge-container-bottom">' +
        resBadgeHtml +
        durationBadgeHtml +
      '</div>' +
    '</div>' +
    '<div class="family-info-box">' +
      '<span class="family-title">' + displayTitle + '</span>' +
    '</div>';

  return card;
}
