// Crescent Bay — tuning numbers and palette in one place.
// The view is a fixed 1280x800 logical area; the renderer scales it to the
// window, so no rule below depends on the screen size. The world is a small
// grid city the camera scrolls over.
export const VIEW = { width: 1280, height: 800 };

export const WORLD = {
  width: 3600,
  height: 2600,
  // Road centrelines. Roads are 120 wide with 14-wide sidewalks each side.
  roadsX: [400, 1000, 1600, 2200, 2800],
  roadsY: [400, 1000, 1600, 2200],
  roadWidth: 120,
  sidewalk: 14,
  // Everything south of this line is the harbour water.
  waterY: 2400,
};

export const STEP = 1 / 60;

export const PLAYER = {
  radius: 13,
  walkSpeed: 200,
  runSpeed: 300,
  maxHealth: 100,
};

export const CAR = {
  length: 64,
  width: 30,
  maxSpeed: 520,
  accel: 320,
  brake: 520,
  reverseMax: 160,
  turnRate: 2.6,
  maxHealth: 100,
};

export const PED = { radius: 9, speed: 55, count: 26 };

export const TRAFFIC = { count: 10, cruise: 190 };

export const POLICE = {
  maxCars: 4,
  chaseSpeed: 470,
  catchRadius: 65,
  catchHold: 1.4,
  // Seconds out of every cop's sight before a star drops.
  hideTime: 9,
};

export const MISSIONS = [
  {
    id: 'first-wheels',
    title: 'M1 · First Wheels',
    briefing:
      'Jax needs wheels. Steal any car (walk up and press E), then bring it to the green marker.',
    reward: 250,
  },
  {
    id: 'harbor-run',
    title: 'M2 · Harbor Run',
    briefing:
      'A package for the docks. Drive it to the harbour marker before the timer runs out.',
    reward: 400,
    timeLimit: 90,
  },
  {
    id: 'heat',
    title: 'M3 · Heat',
    briefing:
      'Three stars and every cop in Crescent Bay is coming. Survive 60 seconds without getting busted.',
    reward: 600,
    timeLimit: 60,
  },
];

export const PALETTE = {
  grass: '#7fae62',
  grassDark: '#74a158',
  road: '#3a3f47',
  roadLine: '#e8d44d',
  sidewalk: '#b9b3a4',
  buildingRoof: ['#c96f4a', '#4a7ec9', '#8a5fc0', '#c9a44a', '#5fb08a', '#b0526e'],
  buildingEdge: '#00000055',
  park: '#5d9b4a',
  water: '#2f6f9e',
  dock: '#8a6f4d',
  player: '#f2c94c',
  playerRing: '#1b1e24',
  ped: '#e8e4da',
  police: '#20242c',
  policeLightR: '#ff3b30',
  policeLightB: '#2f7bff',
  marker: '#37e08b',
  markerHot: '#ff5a4e',
  hudPanel: 'rgba(12, 14, 20, 0.72)',
  hudText: '#f2f4f6',
  hudMuted: '#aab2bd',
  star: '#ffd94a',
  starEmpty: '#5a6068',
  title: '#f7f3e8',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

export const SAVE_KEY = 'crescent-bay.save.v1';

export const START_CASH = 120;
