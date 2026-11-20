// Crescent Bay itself: a grid of roads, blocks of buildings, a park and a
// harbour. Pure data and geometry — no drawing, no browser — so the world can
// be built and stepped in a test as well as in the game.
import { WORLD, PALETTE } from './config.js';
import { makeRng, range, pick, clamp } from './random.js';

export function buildCity(seed) {
  const rng = makeRng(seed);
  const buildings = [];
  const trees = [];
  const roadHalf = WORLD.roadWidth / 2;
  const xs = [0, ...WORLD.roadsX, WORLD.width];
  const ys = [0, ...WORLD.roadsY, WORLD.waterY, WORLD.height];

  // The park fills the block between roads x 1000..1600, y 1600..2200.
  const park = {
    x: WORLD.roadsX[1] + roadHalf,
    y: WORLD.roadsY[2] + roadHalf,
    w: WORLD.roadsX[2] - WORLD.roadsX[1] - WORLD.roadWidth,
    h: WORLD.roadsY[3] - WORLD.roadsY[2] - WORLD.roadWidth,
  };

  for (let bx = 0; bx < xs.length - 1; bx += 1) {
    for (let by = 0; by < ys.length - 1; by += 1) {
      const x0 = xs[bx] + (bx === 0 ? 0 : roadHalf);
      const x1 = xs[bx + 1] - (bx + 1 === xs.length - 1 ? 0 : roadHalf);
      const y0 = ys[by] + (by === 0 ? 0 : roadHalf);
      const y1 = ys[by + 1] - (by + 1 === ys.length - 1 ? 0 : roadHalf);
      if (x1 - x0 < 120 || y1 - y0 < 120) continue;
      // Park block: trees, no buildings.
      if (x0 >= park.x - 1 && y0 >= park.y - 1 && x1 <= park.x + park.w + 1 && y1 <= park.y + park.h + 1) {
        for (let i = 0; i < 26; i += 1) {
          trees.push({ x: range(rng, x0 + 20, x1 - 20), y: range(rng, y0 + 20, y1 - 20), r: range(rng, 10, 18) });
        }
        continue;
      }
      // Harbour front: no buildings south of the last avenue, so the docks stay reachable.
      if (y0 >= WORLD.roadsY[3]) continue;
      // One or two buildings per block, with a margin for the sidewalk.
      const count = rng() < 0.55 ? 1 : 2;
      for (let i = 0; i < count; i += 1) {
        const bw = range(rng, 130, Math.max(140, (x1 - x0) / count - 40));
        const bh = range(rng, 110, Math.max(120, (y1 - y0) - 40));
        const bx0 = x0 + 24 + (count === 2 ? i * ((x1 - x0 - 48) / 2) : (x1 - x0 - bw) / 2);
        const by0 = y0 + 24 + range(rng, 0, Math.max(1, y1 - y0 - bh - 48));
        buildings.push({
          x: clamp(bx0, x0 + 16, x1 - 60),
          y: clamp(by0, y0 + 16, y1 - 60),
          w: Math.min(bw, x1 - 32 - (bx0 - x0)),
          h: Math.min(bh, y1 - 32 - (by0 - y0)),
          color: pick(rng, PALETTE.buildingRoof),
          roof: rng(),
        });
      }
    }
  }

  // Docks jut into the water along the harbour front.
  const docks = [];
  for (let i = 0; i < 4; i += 1) {
    docks.push({ x: 520 + i * 640, y: WORLD.waterY, w: 90, h: 120 });
  }

  return { buildings, trees, park, docks, seed };
}

export function isWater(city, x, y) {
  return y >= WORLD.waterY;
}

export function isRoad(x, y) {
  const half = WORLD.roadWidth / 2;
  for (const rx of WORLD.roadsX) if (Math.abs(x - rx) <= half) return true;
  for (const ry of WORLD.roadsY) if (Math.abs(y - ry) <= half) return true;
  return false;
}

/** The nearest road centreline point to (x, y) — used to snap spawns onto roads. */
export function nearestRoadPoint(x, y) {
  let bestX = WORLD.roadsX[0];
  let bestD = Infinity;
  for (const rx of WORLD.roadsX) {
    const d = Math.abs(x - rx);
    if (d < bestD) { bestD = d; bestX = rx; }
  }
  let bestY = WORLD.roadsY[0];
  bestD = Infinity;
  for (const ry of WORLD.roadsY) {
    const d = Math.abs(y - ry);
    if (d < bestD) { bestD = d; bestY = ry; }
  }
  // Snap to whichever centreline is closer.
  if (Math.abs(x - bestX) <= Math.abs(y - bestY)) return { x: bestX, y };
  return { x, y: bestY };
}

/** True when the circle at (x, y, r) overlaps any building. */
export function hitsBuilding(city, x, y, r) {
  for (const b of city.buildings) {
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return b;
  }
  return null;
}

/**
 * Push a circle out of buildings and the world edge; returns the building hit
 * (or null). Water blocks on-foot movement too, except on the docks.
 */
export function resolveCollision(city, p, r) {
  let hit = null;
  for (const b of city.buildings) {
    const cx = clamp(p.x, b.x, b.x + b.w);
    const cy = clamp(p.y, b.y, b.y + b.h);
    const dx = p.x - cx;
    const dy = p.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      hit = b;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        p.x = cx + (dx / d) * r;
        p.y = cy + (dy / d) * r;
      } else {
        p.y = b.y - r;
      }
    }
  }
  p.x = clamp(p.x, r, WORLD.width - r);
  p.y = clamp(p.y, r, WORLD.height - r);
  return hit;
}

/** Traffic lights: one cycle per intersection, green NS then green EW. */
export function lightState(time, rx, ry) {
  const cycle = 12;
  const phase = (time + (rx + ry) / 400) % cycle;
  return phase < 6 ? 'ns' : 'ew';
}
