// Prototype & Verification for 2D Spatial Navigation on Tizen 4.0 (Chromium M56)
class SpatialNavigator {
  constructor() {
    this.currentFocused = null;
    this.focusHistory = [];
    this.layers = ['catalog']; // layer stack
  }

  // Calculate directional distance between source rect and candidate rect
  // Metric: Directional Euclidean with secondary axis penalty
  calculateDistance(src, target, direction) {
    const srcCenter = {
      x: src.left + src.width / 2,
      y: src.top + src.height / 2
    };
    const targetCenter = {
      x: target.left + target.width / 2,
      y: target.top + target.height / 2
    };

    const dx = targetCenter.x - srcCenter.x;
    const dy = targetCenter.y - srcCenter.y;

    // Check validity according to direction
    let primaryDist, secondaryDist;
    switch (direction) {
      case 'right':
        if (target.left <= src.left + 5) return Infinity; // must be to the right
        primaryDist = target.left - (src.left + src.width);
        secondaryDist = Math.abs(targetCenter.y - srcCenter.y);
        break;
      case 'left':
        if (target.left + target.width >= src.left + src.width - 5) return Infinity; // must be to the left
        primaryDist = src.left - (target.left + target.width);
        secondaryDist = Math.abs(targetCenter.y - srcCenter.y);
        break;
      case 'down':
        if (target.top <= src.top + 5) return Infinity; // must be below
        primaryDist = target.top - (src.top + src.height);
        secondaryDist = Math.abs(targetCenter.x - srcCenter.x);
        break;
      case 'up':
        if (target.top + target.height >= src.top + src.height - 5) return Infinity; // must be above
        primaryDist = src.top - (target.top + target.height);
        secondaryDist = Math.abs(targetCenter.x - srcCenter.x);
        break;
      default:
        return Infinity;
    }

    if (primaryDist < 0) primaryDist = 0;

    // Directional weighting: penalize perpendicular movement by 2.5x to preserve row/column affinity
    return primaryDist + 2.5 * secondaryDist;
  }

  findNextElement(currentRect, candidates, direction) {
    let bestEl = null;
    let minDistance = Infinity;

    for (const cand of candidates) {
      if (cand.rect === currentRect) continue;
      const dist = this.calculateDistance(currentRect, cand.rect, direction);
      if (dist < minDistance) {
        minDistance = dist;
        bestEl = cand;
      }
    }

    return bestEl;
  }
}

// Test spatial navigation logic
const nav = new SpatialNavigator();

const items = [
  // Row 0: Movies
  { id: 'movie_0', rect: { left: 50, top: 100, width: 200, height: 300 } },
  { id: 'movie_1', rect: { left: 280, top: 100, width: 200, height: 300 } },
  { id: 'movie_2', rect: { left: 510, top: 100, width: 200, height: 300 } },
  // Row 1: Home Videos
  { id: 'home_0', rect: { left: 50, top: 450, width: 320, height: 180 } },
  { id: 'home_1', rect: { left: 400, top: 450, width: 320, height: 180 } }
];

console.log("From movie_0 -> RIGHT should be movie_1:");
const nextRight = nav.findNextElement(items[0].rect, items, 'right');
console.log("Result:", nextRight ? nextRight.id : 'none');

console.log("From movie_1 -> DOWN should be home_0 or home_1 (closest X center):");
const nextDown = nav.findNextElement(items[1].rect, items, 'down');
console.log("Result:", nextDown ? nextDown.id : 'none');

console.log("From home_1 -> UP should be movie_1 or movie_2:");
const nextUp = nav.findNextElement(items[4].rect, items, 'up');
console.log("Result:", nextUp ? nextUp.id : 'none');
