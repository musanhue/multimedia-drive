import { apiClient } from '../api/client';
import type { DriveMediaItem } from '../types';
import { movieDetailModal } from './modal';
import { renderFamilyCard } from './family';
import { toggleAppFullscreen, onFullscreenChange, isAppFullscreen } from '../navigation/fullscreen';

export interface CatalogViewCallbacks {
  onPlayMovie: (item: DriveMediaItem) => void;
  onPlayFamilyVideo: (item: DriveMediaItem) => void;
  onOpenPhotoSlideshow: (item: DriveMediaItem, allPhotos: DriveMediaItem[], index: number) => void;
  onOpenAudioPlayer: (item: DriveMediaItem, playlist: DriveMediaItem[], index: number) => void;
  onExitApp: () => void;
}

interface CategoryGroup {
  name: string;
  title: string;
  items: DriveMediaItem[];
}

export class CatalogView {
  public container: HTMLElement;
  private callbacks: CatalogViewCallbacks;
  public currentFocusRow: number = 0; // -2 for filter bar, -1 for tab bar, 0..N for carousel rows
  public currentFocusCol: number = 0;
  public columnMemory: number = 0;

  private allCategoryGroups: CategoryGroup[] = [];
  private rowData: Map<number, DriveMediaItem[]> = new Map();
  private rowElements: HTMLElement[] = [];
  private tabElements: HTMLElement[] = [];
  private filterElements: HTMLElement[] = [];
  private lastCardMemory: { row: number; col: number } = { row: 0, col: 0 };
  private clockInterval: any = null;

  // Filter state
  public searchQuery: string = '';
  public filterGenre: string = 'all';
  public filterYear: string = 'all';
  public filterSort: string = 'drive-newest';
  public activeCategoryFilter: string = 'all';

  constructor(container: HTMLElement, callbacks: CatalogViewCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
  }

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
    this.container.innerHTML =
      '<div class="catalog-view" id="catalog-root" data-layer="catalog">' +
        '<header class="catalog-header">' +
          '<div class="header-brand">' +
            '<span class="brand-title">MULTIMEDIA DRIVE</span>' +
            '<span class="status-indicator is-online" id="catalog-status-dot" title="Conectado"></span>' +
            '<span class="version-badge">v1.4</span>' +
          '</div>' +
          '<nav class="category-tabs" id="catalog-category-tabs">' +
            '<button class="nav-tab nav-item is-active" data-category="all" data-tab-idx="0">Todos</button>' +
            '<button class="nav-tab nav-item" data-category="peliculas" data-tab-idx="1">Películas</button>' +
            '<button class="nav-tab nav-item" data-category="series" data-tab-idx="2">Series</button>' +
            '<button class="nav-tab nav-item" data-category="familiares" data-tab-idx="3">Videos familiares</button>' +
            '<button class="nav-tab nav-item" data-category="fotos" data-tab-idx="4">Fotos</button>' +
            '<button class="nav-tab nav-item" data-category="musica" data-tab-idx="5">Música</button>' +
          '</nav>' +
          '<div class="header-actions">' +
            '<button class="btn-refresh nav-item" id="btn-catalog-fullscreen" title="Pantalla Completa (Modo App)">⛶ Pantalla Completa</button>' +
            '<button class="btn-refresh nav-item" id="btn-catalog-refresh" title="Actualizar contenido (Tecla R o Botón Verde)">🔄 Actualizar</button>' +
            '<div class="header-clock" id="catalog-clock">--:--</div>' +
          '</div>' +
        '</header>' +
        '<!-- Buscador y Barra de Filtros -->' +
        '<div class="catalog-filter-bar" id="catalog-filter-bar">' +
          '<div class="search-box-wrapper">' +
            '<span class="search-icon">🔍</span>' +
            '<input type="text" id="catalog-search-input" class="search-input nav-item" placeholder="Buscar por título, reparto o director..." autocomplete="off" />' +
            '<button id="btn-search-clear" class="btn-search-clear" style="display:none;" title="Limpiar búsqueda">✕</button>' +
          '</div>' +
          '<div class="filter-dropdowns">' +
            '<div class="filter-group">' +
              '<label for="select-filter-genre">Género:</label>' +
              '<select id="select-filter-genre" class="filter-select nav-item">' +
                '<option value="all">Todos los géneros</option>' +
              '</select>' +
            '</div>' +
            '<div class="filter-group">' +
              '<label for="select-filter-year">Año:</label>' +
              '<select id="select-filter-year" class="filter-select nav-item">' +
                '<option value="all">Todos los años</option>' +
              '</select>' +
            '</div>' +
            '<div class="filter-group">' +
              '<label for="select-filter-sort">Ordenar por:</label>' +
              '<select id="select-filter-sort" class="filter-select nav-item">' +
                '<option value="drive-newest">Agregado a Drive (Más reciente)</option>' +
                '<option value="drive-oldest">Agregado a Drive (Más antiguo)</option>' +
                '<option value="year-newest">Año de estreno (Más nuevo)</option>' +
                '<option value="year-oldest">Año de estreno (Más clásico)</option>' +
                '<option value="title-az">Título (A - Z)</option>' +
                '<option value="rating-desc">Calificación TMDB (★)</option>' +
              '</select>' +
            '</div>' +
            '<button id="btn-reset-filters" class="btn-reset-filters nav-item" title="Restablecer filtros">Borrar Filtros</button>' +
          '</div>' +
        '</div>' +
        '<main class="catalog-main">' +
          '<div class="catalog-loading" id="catalog-loading">' +
            '<div class="catalog-spinner"></div>' +
            '<p class="catalog-loading-text">Cargando biblioteca...</p>' +
          '</div>' +
          '<div class="catalog-error" id="catalog-error" style="display: none;">' +
            '<p class="catalog-error-msg" id="catalog-error-msg"></p>' +
            '<button class="btn-retry nav-item" id="btn-catalog-retry">Reintentar</button>' +
          '</div>' +
          '<div class="carousel-viewport-wrapper" id="carousel-viewport-wrapper">' +
            '<div class="carousel-rows-stack" id="carousel-rows-stack">' +
            '</div>' +
          '</div>' +
        '</main>' +
      '</div>';

    this.tabElements = Array.from(document.querySelectorAll('.category-tabs .nav-tab, .header-actions .btn-refresh'));
    this.filterElements = [
      document.getElementById('catalog-search-input')!,
      document.getElementById('select-filter-genre')!,
      document.getElementById('select-filter-year')!,
      document.getElementById('select-filter-sort')!,
      document.getElementById('btn-reset-filters')!
    ].filter(Boolean);

    var retryBtn = document.getElementById('btn-catalog-retry');
    var refreshBtn = document.getElementById('btn-catalog-refresh');
    var fullscreenBtn = document.getElementById('btn-catalog-fullscreen');
    var searchInput = document.getElementById('catalog-search-input') as HTMLInputElement;
    var clearSearchBtn = document.getElementById('btn-search-clear');
    var genreSelect = document.getElementById('select-filter-genre') as HTMLSelectElement;
    var yearSelect = document.getElementById('select-filter-year') as HTMLSelectElement;
    var sortSelect = document.getElementById('select-filter-sort') as HTMLSelectElement;
    var resetFiltersBtn = document.getElementById('btn-reset-filters');

    var self = this;
    if (retryBtn) {
      retryBtn.addEventListener('click', function () { self.loadCatalogData(); });
    }
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () { self.refreshCatalog(); });
    }
    if (fullscreenBtn) {
      fullscreenBtn.addEventListener('click', function () {
        toggleAppFullscreen();
      });
      onFullscreenChange(function (isFs) {
        if (fullscreenBtn) {
          fullscreenBtn.innerHTML = isFs ? '⛶ Salir Pantalla Completa' : '⛶ Pantalla Completa';
        }
      });
    }

    // Tab click listeners
    for (var i = 0; i < this.tabElements.length; i++) {
      (function (tabEl: HTMLElement) {
        tabEl.addEventListener('click', function () {
          if (tabEl.id === 'btn-catalog-fullscreen') {
            toggleAppFullscreen();
          } else if (tabEl.id === 'btn-catalog-refresh') {
            self.refreshCatalog();
          } else {
            var cat = tabEl.getAttribute('data-category') || 'all';
            self.selectCategoryTab(cat);
          }
        });
      })(this.tabElements[i]);
    }

    // Search input listener
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        self.searchQuery = searchInput.value.trim().toLowerCase();
        if (clearSearchBtn) {
          clearSearchBtn.style.display = self.searchQuery.length > 0 ? 'inline-block' : 'none';
        }
        self.applyFiltersAndRender();
      });
    }

    if (clearSearchBtn) {
      clearSearchBtn.addEventListener('click', function () {
        if (searchInput) {
          searchInput.value = '';
          self.searchQuery = '';
          clearSearchBtn.style.display = 'none';
          self.applyFiltersAndRender();
        }
      });
    }

    if (genreSelect) {
      genreSelect.addEventListener('change', function () {
        self.filterGenre = genreSelect.value;
        self.applyFiltersAndRender();
      });
    }

    if (yearSelect) {
      yearSelect.addEventListener('change', function () {
        self.filterYear = yearSelect.value;
        self.applyFiltersAndRender();
      });
    }

    if (sortSelect) {
      sortSelect.addEventListener('change', function () {
        self.filterSort = sortSelect.value;
        self.applyFiltersAndRender();
      });
    }

    if (resetFiltersBtn) {
      resetFiltersBtn.addEventListener('click', function () {
        self.resetFilters();
      });
    }
  }

  public selectCategoryTab(category: string): void {
    this.activeCategoryFilter = category;
    for (var i = 0; i < this.tabElements.length; i++) {
      var tab = this.tabElements[i];
      if (!tab.classList.contains('nav-tab')) continue;
      if (tab.getAttribute('data-category') === category) {
        tab.classList.add('is-active');
      } else {
        tab.classList.remove('is-active');
      }
    }
    this.applyFiltersAndRender();
  }

  public resetFilters(): void {
    var searchInput = document.getElementById('catalog-search-input') as HTMLInputElement;
    var clearSearchBtn = document.getElementById('btn-search-clear');
    var genreSelect = document.getElementById('select-filter-genre') as HTMLSelectElement;
    var yearSelect = document.getElementById('select-filter-year') as HTMLSelectElement;
    var sortSelect = document.getElementById('select-filter-sort') as HTMLSelectElement;

    if (searchInput) searchInput.value = '';
    if (clearSearchBtn) clearSearchBtn.style.display = 'none';
    if (genreSelect) genreSelect.value = 'all';
    if (yearSelect) yearSelect.value = 'all';
    if (sortSelect) sortSelect.value = 'drive-newest';

    this.searchQuery = '';
    this.filterGenre = 'all';
    this.filterYear = 'all';
    this.filterSort = 'drive-newest';
    this.activeCategoryFilter = 'all';

    for (var i = 0; i < this.tabElements.length; i++) {
      if (!this.tabElements[i].classList.contains('nav-tab')) continue;
      if (this.tabElements[i].getAttribute('data-category') === 'all') {
        this.tabElements[i].classList.add('is-active');
      } else {
        this.tabElements[i].classList.remove('is-active');
      }
    }

    this.applyFiltersAndRender();
  }

  public async refreshCatalog(): Promise<void> {
    var loadingEl = document.getElementById('catalog-loading');
    if (loadingEl) {
      loadingEl.style.display = 'flex';
      var textEl = loadingEl.querySelector('.catalog-loading-text');
      if (textEl) textEl.textContent = 'Actualizando biblioteca desde Drive...';
    }
    await apiClient.refreshCache();
    await this.loadCatalogData(true);
  }

  public async loadCatalogData(forceRefresh?: boolean): Promise<void> {
    var loadingEl = document.getElementById('catalog-loading');
    var errorEl = document.getElementById('catalog-error');

    if (loadingEl) loadingEl.style.display = 'flex';
    if (errorEl) errorEl.style.display = 'none';

    try {
      var categories = ['peliculas', 'series', 'familiares', 'fotos', 'musica'];
      var titles = ['Películas', 'Series', 'Videos familiares', 'Fotos', 'Música'];

      var promises = categories.map(function (cat) {
        return apiClient.getCategoryFiles(cat, forceRefresh).catch(function () {
          return { category: cat, total: 0, count: 0, items: [] };
        });
      });
      var results = await Promise.all(promises);

      if (loadingEl) loadingEl.style.display = 'none';

      this.allCategoryGroups = [];
      var allItemsCombined: DriveMediaItem[] = [];

      for (var i = 0; i < results.length; i++) {
        var items = results[i].items || [];
        if (items.length > 0) {
          this.allCategoryGroups.push({
            name: categories[i],
            title: titles[i],
            items: items
          });
          allItemsCombined = allItemsCombined.concat(items);
        }
      }

      this.populateFilterDropdowns(allItemsCombined);
      this.applyFiltersAndRender();

    } catch (err: any) {
      if (loadingEl) loadingEl.style.display = 'none';
      if (errorEl) {
        errorEl.style.display = 'flex';
        var msgEl = document.getElementById('catalog-error-msg');
        if (msgEl) msgEl.textContent = err.message || 'Error al conectar con Google Drive';
      }
    }
  }

  private populateFilterDropdowns(allItems: DriveMediaItem[]): void {
    var genreSelect = document.getElementById('select-filter-genre') as HTMLSelectElement;
    var yearSelect = document.getElementById('select-filter-year') as HTMLSelectElement;

    // Genres
    if (genreSelect) {
      var genreSet = new Set<string>();
      for (var i = 0; i < allItems.length; i++) {
        var gList = allItems[i].genres;
        if (Array.isArray(gList)) {
          for (var j = 0; j < gList.length; j++) {
            if (gList[j]) genreSet.add(gList[j].trim());
          }
        }
      }
      var sortedGenres = Array.from(genreSet).sort(function (a, b) {
        return a.localeCompare(b);
      });
      genreSelect.innerHTML = '<option value="all">Todos los géneros</option>';
      for (var k = 0; k < sortedGenres.length; k++) {
        var opt = document.createElement('option');
        opt.value = sortedGenres[k];
        opt.textContent = sortedGenres[k];
        genreSelect.appendChild(opt);
      }
    }

    // Years
    if (yearSelect) {
      var yearSet = new Set<number>();
      for (var y = 0; y < allItems.length; y++) {
        var yr = allItems[y].year;
        if (yr && typeof yr === 'number' && yr > 1900) {
          yearSet.add(yr);
        }
      }
      var sortedYears = Array.from(yearSet).sort(function (a, b) {
        return b - a; // Most recent first
      });
      yearSelect.innerHTML = '<option value="all">Todos los años</option>';
      for (var m = 0; m < sortedYears.length; m++) {
        var optY = document.createElement('option');
        optY.value = String(sortedYears[m]);
        optY.textContent = String(sortedYears[m]);
        yearSelect.appendChild(optY);
      }
    }
  }

  private sortItems(items: DriveMediaItem[]): DriveMediaItem[] {
    var copy = items.slice();
    var sortMode = this.filterSort;

    var getDriveDateMs = function (item: DriveMediaItem): number {
      var d = item.createdTime || item.modifiedTime;
      return d ? new Date(d).getTime() : 0;
    };

    if (sortMode === 'drive-newest') {
      copy.sort(function (a, b) { return getDriveDateMs(b) - getDriveDateMs(a); });
    } else if (sortMode === 'drive-oldest') {
      copy.sort(function (a, b) { return getDriveDateMs(a) - getDriveDateMs(b); });
    } else if (sortMode === 'year-newest') {
      copy.sort(function (a, b) { return (b.year || 0) - (a.year || 0); });
    } else if (sortMode === 'year-oldest') {
      copy.sort(function (a, b) { return (a.year || 9999) - (b.year || 9999); });
    } else if (sortMode === 'title-az') {
      copy.sort(function (a, b) {
        var tA = (a.cleanTitle || a.name || '').toLowerCase();
        var tB = (b.cleanTitle || b.name || '').toLowerCase();
        return tA.localeCompare(tB);
      });
    } else if (sortMode === 'rating-desc') {
      copy.sort(function (a, b) { return (b.rating || 0) - (a.rating || 0); });
    }

    return copy;
  }

  private itemMatchesFilters(item: DriveMediaItem): boolean {
    // 1. Category Filter
    if (this.activeCategoryFilter !== 'all' && item.category !== this.activeCategoryFilter) {
      return false;
    }

    // 2. Genre Filter
    if (this.filterGenre !== 'all') {
      if (!item.genres || !item.genres.some(function (g) { return g.toLowerCase() === this.filterGenre.toLowerCase(); }.bind(this))) {
        return false;
      }
    }

    // 3. Year Filter
    if (this.filterYear !== 'all') {
      if (!item.year || String(item.year) !== this.filterYear) {
        return false;
      }
    }

    // 4. Search Query
    if (this.searchQuery && this.searchQuery.length > 0) {
      var query = this.searchQuery;
      var title = (item.cleanTitle || item.name || '').toLowerCase();
      var overview = (item.overview || '').toLowerCase();
      var director = (item.director || '').toLowerCase();
      var inCast = Array.isArray(item.cast) && item.cast.some(function (c) { return c.toLowerCase().indexOf(query) !== -1; });
      var inTitle = title.indexOf(query) !== -1;
      var inOverview = overview.indexOf(query) !== -1;
      var inDirector = director.indexOf(query) !== -1;

      if (!inTitle && !inOverview && !inDirector && !inCast) {
        return false;
      }
    }

    return true;
  }

  public applyFiltersAndRender(): void {
    var stackEl = document.getElementById('carousel-rows-stack');
    if (!stackEl) return;
    stackEl.innerHTML = '';
    this.rowElements = [];
    this.rowData.clear();

    var isFilterActive = this.searchQuery.length > 0 || this.filterGenre !== 'all' || this.filterYear !== 'all';

    if (isFilterActive) {
      // Unified Search Results Row
      var allMatches: DriveMediaItem[] = [];
      for (var i = 0; i < this.allCategoryGroups.length; i++) {
        var group = this.allCategoryGroups[i];
        for (var j = 0; j < group.items.length; j++) {
          if (this.itemMatchesFilters(group.items[j])) {
            allMatches.push(group.items[j]);
          }
        }
      }

      var sortedMatches = this.sortItems(allMatches);

      if (sortedMatches.length === 0) {
        var emptyDiv = document.createElement('div');
        emptyDiv.className = 'catalog-empty-state';
        emptyDiv.innerHTML =
          '<h3>No se encontraron resultados</h3>' +
          '<p>Intenta con otro término de búsqueda o restablece los filtros.</p>' +
          '<button class="btn-retry nav-item" id="btn-empty-clear">Restablecer Filtros</button>';
        stackEl.appendChild(emptyDiv);
        var selfEmpty = this;
        var btnEmptyClear = document.getElementById('btn-empty-clear');
        if (btnEmptyClear) {
          btnEmptyClear.addEventListener('click', function () { selfEmpty.resetFilters(); });
        }
        return;
      }

      // Render Filtered Results Row
      this.rowData.set(0, sortedMatches);
      var rowSection = this.createCarouselRow('Resultados (' + sortedMatches.length + ' encontrados)', sortedMatches, 0, 'resultados');
      stackEl.appendChild(rowSection);
      this.rowElements.push(rowSection);

    } else {
      // Standard Category Carrusels
      var displayGroups = this.allCategoryGroups.filter(function (g) {
        if (this.activeCategoryFilter === 'all') return true;
        return g.name === this.activeCategoryFilter;
      }.bind(this));

      if (displayGroups.length === 0) {
        var emptyNotice = document.createElement('div');
        emptyNotice.className = 'catalog-empty-state';
        emptyNotice.innerHTML =
          '<h3>Tu carpeta multimedia de Google Drive no contiene archivos reconocidos</h3>' +
          '<p>Sube tus películas, videos familiares, fotos o música a la carpeta compartida y presiona "Actualizar".</p>' +
          '<button class="btn-retry nav-item" id="btn-empty-refresh">🔄 Actualizar ahora</button>';
        stackEl.appendChild(emptyNotice);
        var selfRefresh = this;
        var emptyRefreshBtn = document.getElementById('btn-empty-refresh');
        if (emptyRefreshBtn) {
          emptyRefreshBtn.addEventListener('click', function () { selfRefresh.refreshCatalog(); });
        }
        return;
      }

      for (var r = 0; r < displayGroups.length; r++) {
        var grp = displayGroups[r];
        var sortedCategoryItems = this.sortItems(grp.items);
        this.rowData.set(r, sortedCategoryItems);

        var section = this.createCarouselRow(grp.title + ' (' + sortedCategoryItems.length + ')', sortedCategoryItems, r, grp.name);
        stackEl.appendChild(section);
        this.rowElements.push(section);
      }
    }

    this.currentFocusRow = 0;
    this.currentFocusCol = 0;
    this.columnMemory = 0;
    this.updateFocusState();
  }

  private createCarouselRow(title: string, items: DriveMediaItem[], rowIdx: number, catName: string): HTMLElement {
    var rowSection = document.createElement('section');
    rowSection.className = 'carousel-row';
    rowSection.id = 'carousel-row-' + catName;
    rowSection.setAttribute('data-row-idx', String(rowIdx));

    var titleHeader = document.createElement('h2');
    titleHeader.className = 'row-title';
    titleHeader.textContent = title;
    rowSection.appendChild(titleHeader);

    var viewportDiv = document.createElement('div');
    viewportDiv.className = 'carousel-track-viewport';

    var trackDiv = document.createElement('div');
    trackDiv.className = 'carousel-track';
    trackDiv.id = 'track-' + catName;

    for (var c = 0; c < items.length; c++) {
      var item = items[c];
      var cardEl: HTMLElement;
      if (item.category === 'familiares') {
        cardEl = renderFamilyCard(item, rowIdx, c);
        var selfCard = this;
        (function (row, col) {
          cardEl.addEventListener('click', function () {
            selfCard.currentFocusRow = row;
            selfCard.currentFocusCol = col;
            selfCard.columnMemory = col;
            selfCard.updateFocusState();
            selfCard.handleEnter();
          });
        })(rowIdx, c);
      } else {
        cardEl = this.createMediaCard(item, item.category || catName, rowIdx, c);
      }
      trackDiv.appendChild(cardEl);
    }

    viewportDiv.appendChild(trackDiv);
    rowSection.appendChild(viewportDiv);
    return rowSection;
  }

  private createMediaCard(item: DriveMediaItem, category: string, rowIdx: number, colIdx: number): HTMLElement {
    var card = document.createElement('div');
    card.className = 'media-card nav-item';
    card.id = 'card_' + (item.id || ('r' + rowIdx + '_c' + colIdx));
    card.setAttribute('data-row', String(rowIdx));
    card.setAttribute('data-col', String(colIdx));
    card.setAttribute('data-category', category);

    var fallbackSvg = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300" viewBox="0 0 200 300"><rect fill="%23181b22" width="200" height="300"/><text fill="%23666" x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="16">Sin Cartel</text></svg>';
    var posterSrc = item.posterUrl || item.thumbnailLink || fallbackSvg;

    var ratingHtml = item.rating && item.rating > 0
      ? '<div class="card-badge rating-badge">★ ' + item.rating.toFixed(1) + '</div>'
      : '';
    var yearHtml = item.year
      ? '<div class="card-badge year-badge">' + item.year + '</div>'
      : '';
    var episodeHtml = item.season && item.episode
      ? '<div class="card-badge episode-badge">T' + item.season + ':E' + item.episode + '</div>'
      : '';

    card.innerHTML =
      '<div class="card-poster-wrap">' +
        '<img class="card-poster-img" src="' + posterSrc + '" alt="' + (item.cleanTitle || item.name) + '"/>' +
        ratingHtml +
        yearHtml +
        episodeHtml +
      '</div>' +
      '<div class="card-info">' +
        '<span class="card-title">' + (item.cleanTitle || item.name) + '</span>' +
      '</div>';

    var imgEl = card.querySelector('.card-poster-img') as HTMLImageElement;
    if (imgEl) {
      imgEl.onerror = function () {
        imgEl.src = fallbackSvg;
      };
    }

    var self = this;
    card.addEventListener('click', function () {
      self.currentFocusRow = rowIdx;
      self.currentFocusCol = colIdx;
      self.columnMemory = colIdx;
      self.updateFocusState();
      self.handleEnter();
    });
    return card;
  }

  public handleDirection(direction: 'left' | 'right' | 'up' | 'down'): void {
    if (direction === 'left') {
      if (this.currentFocusRow === -2) {
        if (this.currentFocusCol > 0) {
          this.currentFocusCol--;
          this.updateFocusState();
        }
      } else if (this.currentFocusRow === -1) {
        if (this.currentFocusCol > 0) {
          this.currentFocusCol--;
          this.updateFocusState();
        }
      } else {
        if (this.currentFocusCol > 0) {
          this.currentFocusCol--;
          this.columnMemory = this.currentFocusCol;
          this.updateFocusState();
        }
      }
    } else if (direction === 'right') {
      if (this.currentFocusRow === -2) {
        if (this.currentFocusCol < this.filterElements.length - 1) {
          this.currentFocusCol++;
          this.updateFocusState();
        }
      } else if (this.currentFocusRow === -1) {
        if (this.currentFocusCol < this.tabElements.length - 1) {
          this.currentFocusCol++;
          this.updateFocusState();
        }
      } else {
        var items = this.rowData.get(this.currentFocusRow) || [];
        if (this.currentFocusCol < items.length - 1) {
          this.currentFocusCol++;
          this.columnMemory = this.currentFocusCol;
          this.updateFocusState();
        }
      }
    } else if (direction === 'up') {
      if (this.currentFocusRow === 0) {
        this.currentFocusRow = -1;
        this.currentFocusCol = Math.min(this.columnMemory, this.tabElements.length - 1);
        this.updateFocusState();
      } else if (this.currentFocusRow === -1) {
        this.currentFocusRow = -2;
        this.currentFocusCol = Math.min(this.columnMemory, this.filterElements.length - 1);
        this.updateFocusState();
      } else if (this.currentFocusRow > 0) {
        this.currentFocusRow--;
        var targetRowItems = this.rowData.get(this.currentFocusRow) || [];
        var maxCol = targetRowItems.length > 0 ? targetRowItems.length - 1 : 0;
        this.currentFocusCol = Math.min(this.columnMemory, maxCol);
        this.updateFocusState();
      }
    } else if (direction === 'down') {
      if (this.currentFocusRow === -2) {
        this.currentFocusRow = -1;
        this.currentFocusCol = 0;
        this.updateFocusState();
      } else if (this.currentFocusRow === -1) {
        this.currentFocusRow = 0;
        var r0Items = this.rowData.get(0) || [];
        var maxC = r0Items.length > 0 ? r0Items.length - 1 : 0;
        this.currentFocusCol = Math.min(this.columnMemory, maxC);
        this.updateFocusState();
      } else if (this.currentFocusRow < this.rowElements.length - 1) {
        this.currentFocusRow++;
        var nextRowItems = this.rowData.get(this.currentFocusRow) || [];
        var maxNextCol = nextRowItems.length > 0 ? nextRowItems.length - 1 : 0;
        this.currentFocusCol = Math.min(this.columnMemory, maxNextCol);
        this.updateFocusState();
      }
    }
  }

  public handleEnter(): void {
    if (this.currentFocusRow === -2) {
      var filterEl = this.filterElements[this.currentFocusCol];
      if (filterEl) {
        filterEl.focus();
        if (filterEl.id === 'btn-reset-filters') {
          this.resetFilters();
        }
      }
      return;
    }

    if (this.currentFocusRow === -1) {
      var tab = this.tabElements[this.currentFocusCol];
      if (tab) {
        if (tab.id === 'btn-catalog-fullscreen') {
          toggleAppFullscreen();
        } else if (tab.id === 'btn-catalog-refresh') {
          this.refreshCatalog();
        } else {
          var cat = tab.getAttribute('data-category') || 'all';
          this.selectCategoryTab(cat);
        }
      }
      return;
    }

    var items = this.rowData.get(this.currentFocusRow) || [];
    var selectedItem = items[this.currentFocusCol];
    if (!selectedItem) return;

    this.lastCardMemory = { row: this.currentFocusRow, col: this.currentFocusCol };

    var self = this;
    var cat = selectedItem.category || '';
    if (cat === 'peliculas' || cat === 'series') {
      var activeEl = document.querySelector('.media-card.is-focused') as HTMLElement;
      movieDetailModal.open(selectedItem, activeEl, function (itemToPlay) {
        self.callbacks.onPlayMovie(itemToPlay);
      });
    } else if (cat === 'familiares') {
      this.callbacks.onPlayFamilyVideo(selectedItem);
    } else if (cat === 'fotos') {
      this.callbacks.onOpenPhotoSlideshow(selectedItem, items, this.currentFocusCol);
    } else if (cat === 'musica') {
      this.callbacks.onOpenAudioPlayer(selectedItem, items, this.currentFocusCol);
    } else {
      var activeElDef = document.querySelector('.media-card.is-focused') as HTMLElement;
      movieDetailModal.open(selectedItem, activeElDef, function (itemToPlay) {
        self.callbacks.onPlayMovie(itemToPlay);
      });
    }
  }

  public restoreFocus(): void {
    this.currentFocusRow = this.lastCardMemory.row;
    this.currentFocusCol = this.lastCardMemory.col;
    this.columnMemory = this.currentFocusCol;
    this.updateFocusState();
  }

  private updateFocusState(): void {
    var prev = document.querySelectorAll('.nav-item.is-focused');
    for (var i = 0; i < prev.length; i++) {
      prev[i].classList.remove('is-focused');
    }

    if (this.currentFocusRow === -2) {
      var fEl = this.filterElements[this.currentFocusCol];
      if (fEl) {
        fEl.classList.add('is-focused');
        fEl.focus();
      }
      return;
    }

    if (this.currentFocusRow === -1) {
      var tab = this.tabElements[this.currentFocusCol];
      if (tab) {
        tab.classList.add('is-focused');
        tab.focus();
      }
      return;
    }

    var rowSection = this.rowElements[this.currentFocusRow];
    if (!rowSection) return;

    var cards = rowSection.querySelectorAll('.nav-item');
    var activeCard = cards[this.currentFocusCol] as HTMLElement;
    if (activeCard) {
      activeCard.classList.add('is-focused');
      activeCard.focus();
    }

    this.centerActiveCard(rowSection, this.currentFocusCol, cards.length);
    this.centerActiveRow(this.currentFocusRow);
  }

  private centerActiveCard(rowEl: HTMLElement, cardIdx: number, totalCards: number): void {
    var track = rowEl.querySelector('.carousel-track') as HTMLElement;
    if (!track) return;

    var isFamilyRow = rowEl.id.indexOf('familiares') !== -1;
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

  private centerActiveRow(rowIdx: number): void {
    var stack = document.getElementById('carousel-rows-stack');
    if (!stack) return;

    var rowOffsets = [0, 390, 780, 1070, 1360];
    var offset = rowOffsets[rowIdx] !== undefined ? rowOffsets[rowIdx] : (rowIdx * 380);

    stack.style.transform = 'translate3d(0, -' + offset + 'px, 0)';
  }

  public destroy(): void {
    if (this.clockInterval) {
      clearInterval(this.clockInterval);
      this.clockInterval = null;
    }
  }
}
