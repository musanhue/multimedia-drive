import { SpatialNavigationEngine } from './engine';

export class DomNavigationAdapter {
  private engine: SpatialNavigationEngine;
  private currentElement: HTMLElement | null = null;

  constructor(engine: SpatialNavigationEngine) {
    this.engine = engine;
  }

  public init(): void {
    window.addEventListener('keydown', (e: KeyboardEvent) => this.handleKeyDown(e));
    this.syncFocus();
  }

  public handleKeyDown(event: KeyboardEvent): void {
    const keyCode = event.keyCode || event.which;
    const res = this.engine.dispatchKey(keyCode);

    if (res.handled) {
      event.preventDefault();
      event.stopPropagation();
      this.syncFocus();
    }
  }

  public syncFocus(): void {
    const focusNode = this.engine.getCurrentFocus();
    if (!focusNode) return;

    const el = document.getElementById(focusNode.id) ||
      (document.querySelector('[data-nav-id="' + focusNode.id + '"]') as HTMLElement);

    if (el && el !== this.currentElement) {
      if (this.currentElement) {
        this.currentElement.classList.remove('is-focused', 'focused');
      }
      this.currentElement = el;
      this.currentElement.classList.add('is-focused', 'focused');
      this.currentElement.focus();
      this.ensureVisible(this.currentElement);
    }
  }

  public ensureVisible(element: HTMLElement): void {
    // 1. Horizontal Carousel Smooth Centering via translate3d
    const row = element.closest('.carousel-row') as HTMLElement;
    if (row) {
      const track = row.querySelector('.carousel-track') as HTMLElement;
      if (track) {
        const cardRect = element.getBoundingClientRect();
        // Viewport center is 960px (1920 / 2)
        const offset = (cardRect.left + cardRect.width / 2) - 960;
        const currentTransform = (track as any)._translateX || 0;
        const newTransform = Math.min(0, currentTransform - offset);
        (track as any)._translateX = newTransform;
        track.style.transform = 'translate3d(' + newTransform + 'px, 0, 0)';
      }
    }

    // 2. Vertical Row Centering
    if (row) {
      const container = document.getElementById('main-view-container');
      if (container) {
        const rowRect = row.getBoundingClientRect();
        // Center row in 990px view container
        const rowOffset = (rowRect.top + rowRect.height / 2) - 540;
        const curY = (container as any)._translateY || 0;
        const newY = Math.min(0, curY - rowOffset);
        (container as any)._translateY = newY;
        container.style.transform = 'translate3d(0, ' + newY + 'px, 0)';
      }
    }
  }
}
