// Drawing only: the city, its cars and people, and the HUD, in pixels out.
// The 1280x800 view is scaled to fit the window; a camera follows the
// player across the city. Flat shapes and canvas text, no images, no fonts
// fetched from anywhere.
import { VIEW, WORLD, PALETTE, FONT, CAR, PLAYER } from './config.js';
import { clamp } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';

const MINIMAP = { w: 230, h: 168, margin: 16 };

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
    view.scale = Math.min(canvas.width / VIEW.width, canvas.height / VIEW.height);
    view.x = (canvas.width - VIEW.width * view.scale) / 2;
    view.y = (canvas.height - VIEW.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align, weight) {
    const key = `${weight || ''}${size}`;
    if (!fonts.has(key)) fonts.set(key, `${weight || ''} ${size}px ${FONT}`);
    ctx.font = fonts.get(key);
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, y);
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = PALETTE.hudPanel;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 10);
    ctx.fill();
  }

  function drawCity(city, cam, time) {
    const x0 = cam.x - 40;
    const y0 = cam.y - 40;
    const x1 = cam.x + VIEW.width + 40;
    const y1 = cam.y + VIEW.height + 40;
    // Grass base.
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    // Mow stripes for a little texture.
    ctx.fillStyle = PALETTE.grassDark;
    for (let gy = Math.floor(y0 / 120) * 120; gy < y1; gy += 240) {
      ctx.fillRect(x0, gy, x1 - x0, 120);
    }
    // Harbour water + docks.
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(x0, WORLD.waterY, x1 - x0, WORLD.height - WORLD.waterY);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    for (let wx = Math.floor(x0 / 90) * 90; wx < x1; wx += 90) {
      const wob = Math.sin(time * 1.4 + wx * 0.05) * 6;
      ctx.beginPath();
      ctx.moveTo(wx, WORLD.waterY + 40 + wob);
      ctx.lineTo(wx + 46, WORLD.waterY + 40 + wob);
      ctx.stroke();
    }
    for (const d of city.docks) {
      ctx.fillStyle = PALETTE.dock;
      ctx.fillRect(d.x, d.y, d.w, d.h);
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.strokeRect(d.x, d.y, d.w, d.h);
    }
    // Park.
    ctx.fillStyle = PALETTE.park;
    ctx.fillRect(city.park.x, city.park.y, city.park.w, city.park.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.strokeRect(city.park.x, city.park.y, city.park.w, city.park.h);
    for (const t of city.trees) {
      ctx.fillStyle = '#3f7d33';
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#57a047';
      ctx.beginPath();
      ctx.arc(t.x - 3, t.y - 3, t.r * 0.65, 0, Math.PI * 2);
      ctx.fill();
    }
    // Roads: asphalt, sidewalks, centre dashes.
    const half = WORLD.roadWidth / 2;
    for (const rx of WORLD.roadsX) {
      ctx.fillStyle = PALETTE.sidewalk;
      ctx.fillRect(rx - half - WORLD.sidewalk, y0, WORLD.roadWidth + WORLD.sidewalk * 2, y1 - y0);
      ctx.fillStyle = PALETTE.road;
      ctx.fillRect(rx - half, y0, WORLD.roadWidth, y1 - y0);
    }
    for (const ry of WORLD.roadsY) {
      ctx.fillStyle = PALETTE.sidewalk;
      ctx.fillRect(x0, ry - half - WORLD.sidewalk, x1 - x0, WORLD.roadWidth + WORLD.sidewalk * 2);
      ctx.fillStyle = PALETTE.road;
      ctx.fillRect(x0, ry - half, x1 - x0, WORLD.roadWidth);
    }
    // Centre dashes.
    ctx.strokeStyle = PALETTE.roadLine;
    ctx.lineWidth = 3;
    ctx.setLineDash([26, 22]);
    for (const rx of WORLD.roadsX) {
      ctx.beginPath();
      ctx.moveTo(rx, y0);
      ctx.lineTo(rx, Math.min(y1, WORLD.waterY));
      ctx.stroke();
    }
    for (const ry of WORLD.roadsY) {
      ctx.beginPath();
      ctx.moveTo(x0, ry);
      ctx.lineTo(x1, ry);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // Crosswalks at intersections.
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (const rx of WORLD.roadsX) {
      for (const ry of WORLD.roadsY) {
        for (let i = -2; i <= 2; i += 1) {
          ctx.fillRect(rx - 44 + i * 18, ry - half - 8, 10, 16);
        }
      }
    }
    // Buildings: soft shadow, roof, roof detail.
    for (const b of city.buildings) {
      if (b.x > x1 || b.x + b.w < x0 || b.y > y1 || b.y + b.h < y0) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(b.x + 7, b.y + 9, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = PALETTE.buildingEdge;
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(b.x + 10, b.y + 10, b.w - 20, 12);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      const cols = Math.max(1, Math.floor(b.w / 46));
      const rows = Math.max(1, Math.floor(b.h / 46));
      for (let cx = 0; cx < cols; cx += 1) {
        for (let cy = 0; cy < rows; cy += 1) {
          if ((cx * 7 + cy * 3 + Math.floor(b.roof * 10)) % 3 === 0) {
            ctx.fillRect(b.x + 16 + cx * 46, b.y + 30 + cy * 46, 18, 14);
          }
        }
      }
    }
  }

  function drawCar(car, time) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.roundRect(-CAR.length / 2 + 3, -CAR.width / 2 + 4, CAR.length, CAR.width, 8);
    ctx.fill();
    // Wheels.
    ctx.fillStyle = '#15181d';
    ctx.fillRect(-22, -CAR.width / 2 - 3, 14, 7);
    ctx.fillRect(10, -CAR.width / 2 - 3, 14, 7);
    ctx.fillRect(-22, CAR.width / 2 - 4, 14, 7);
    ctx.fillRect(10, CAR.width / 2 - 4, 14, 7);
    // Body.
    ctx.fillStyle = car.color;
    ctx.beginPath();
    ctx.roundRect(-CAR.length / 2, -CAR.width / 2, CAR.length, CAR.width, 9);
    ctx.fill();
    // Windshield + roof.
    ctx.fillStyle = 'rgba(20,28,38,0.85)';
    ctx.fillRect(6, -CAR.width / 2 + 5, 12, CAR.width - 10);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(-16, -CAR.width / 2 + 5, 16, CAR.width - 10);
    // Headlights.
    ctx.fillStyle = '#ffe9a8';
    ctx.fillRect(CAR.length / 2 - 3, -CAR.width / 2 + 4, 3, 6);
    ctx.fillRect(CAR.length / 2 - 3, CAR.width / 2 - 10, 3, 6);
    if (car.police) {
      ctx.fillStyle = '#f2f4f6';
      ctx.fillRect(-CAR.length / 2 + 4, -CAR.width / 2 + 3, CAR.length - 8, 6);
      const blink = Math.floor(time * 4) % 2 === 0;
      ctx.fillStyle = blink ? PALETTE.policeLightR : PALETTE.policeLightB;
      ctx.beginPath();
      ctx.arc(-4, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = blink ? PALETTE.policeLightB : PALETTE.policeLightR;
      ctx.beginPath();
      ctx.arc(8, 0, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPerson(x, y, angle, color, radius) {
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(x + 2, y + 3, radius, radius * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2b2620';
    ctx.beginPath();
    ctx.arc(x + Math.cos(angle) * 4, y + Math.sin(angle) * 4, radius * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawMarker(marker, time) {
    const pulse = 1 + Math.sin(time * 4) * 0.12;
    ctx.strokeStyle = PALETTE.marker;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(marker.x, marker.y, 46 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(55,224,139,0.18)';
    ctx.beginPath();
    ctx.arc(marker.x, marker.y, 46 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.marker;
    ctx.beginPath();
    ctx.moveTo(marker.x, marker.y - 58);
    ctx.lineTo(marker.x - 12, marker.y - 34);
    ctx.lineTo(marker.x + 12, marker.y - 34);
    ctx.closePath();
    ctx.fill();
    text(marker.label, marker.x, marker.y - 68, 17, PALETTE.marker, 'center', 'bold');
  }

  function drawMinimap(game, city) {
    const mw = MINIMAP.w;
    const mh = MINIMAP.h;
    const mx = VIEW.width - mw - MINIMAP.margin;
    const my = VIEW.height - mh - MINIMAP.margin;
    const sx = mw / WORLD.width;
    const sy = mh / WORLD.height;
    panel(mx - 6, my - 6, mw + 12, mh + 12);
    ctx.save();
    ctx.beginPath();
    ctx.rect(mx, my, mw, mh);
    ctx.clip();
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(mx, my, mw, mh);
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(mx, my + WORLD.waterY * sy, mw, mh - WORLD.waterY * sy);
    ctx.fillStyle = PALETTE.road;
    for (const rx of WORLD.roadsX) ctx.fillRect(mx + rx * sx - 2, my, 4, mh);
    for (const ry of WORLD.roadsY) ctx.fillRect(mx, my + ry * sy, mw, 4);
    ctx.fillStyle = '#8a6f4d';
    for (const d of city.docks) ctx.fillRect(mx + d.x * sx, my + d.y * sy, d.w * sx, d.h * sy);
    if (game.missions.marker) {
      const m = game.missions.marker;
      ctx.fillStyle = PALETTE.marker;
      ctx.beginPath();
      ctx.arc(mx + m.x * sx, my + m.y * sy, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const car of game.entities.police) {
      ctx.fillStyle = '#ff5a4e';
      ctx.beginPath();
      ctx.arc(mx + car.x * sx, my + car.y * sy, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    const p = game.entities.player;
    ctx.fillStyle = PALETTE.player;
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(mx + p.x * sx, my + p.y * sy, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    text('CRESCENT BAY', mx + 4, my + mh - 8, 12, PALETTE.hudMuted, 'left', 'bold');
  }

  function drawHud(game) {
    const p = game.entities.player;
    // Top-left: cash, wanted stars, health.
    panel(16, 14, 250, 96);
    text(`$${game.cash}`, 30, 48, 30, PALETTE.hudText, 'left', 'bold');
    const stars = '★'.repeat(game.wanted) + '☆'.repeat(3 - game.wanted);
    text(stars, 30, 78, 24, game.wanted > 0 ? PALETTE.star : PALETTE.starEmpty, 'left');
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(30, 90, 150, 8);
    ctx.fillStyle = p.health > 30 ? '#37e08b' : '#ff5a4e';
    ctx.fillRect(30, 90, 150 * clamp(p.health / 100, 0, 1), 8);
    text('HEALTH', 188, 98, 11, PALETTE.hudMuted, 'left', 'bold');
    // Top-centre: mission objective.
    const obj = game.missions.objective();
    const ow = Math.min(560, ctx.measureText(obj).width + 40);
    panel((VIEW.width - 560) / 2, 14, 560, 44);
    text(game.missions.current() ? game.missions.current().title : 'Free roam', VIEW.width / 2, 32, 15, PALETTE.hudMuted, 'center', 'bold');
    text(obj, VIEW.width / 2, 50, 15, PALETTE.hudText, 'center');
    // Top-right: clock + speed.
    panel(VIEW.width - 216, 14, 200, 62);
    const hours = Math.floor(game.clock / 60) % 24;
    const mins = Math.floor(game.clock % 60);
    text(`${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`, VIEW.width - 30, 40, 24, PALETTE.hudText, 'right', 'bold');
    const speed = p.inCar ? Math.round(Math.abs(p.inCar.speed) * 0.18) : Math.round(p.speed * 0.18);
    text(p.inCar ? `${speed} km/h` : 'on foot', VIEW.width - 30, 64, 15, PALETTE.hudMuted, 'right');
    if (p.inCar) {
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(VIEW.width - 200, 84, 168, 6);
      ctx.fillStyle = p.inCar.hp > 30 ? '#37e08b' : '#ff5a4e';
      ctx.fillRect(VIEW.width - 200, 84, 168 * clamp(p.inCar.hp / 100, 0, 1), 6);
    }
    drawMinimap(game, game.city);
    // Bottom-centre dialog.
    if (game.missions.message) {
      const msg = game.missions.message;
      panel(240, VIEW.height - 92, VIEW.width - 480, 52);
      text(msg, VIEW.width / 2, VIEW.height - 58, 16, PALETTE.hudText, 'center');
    }
    // Mission banner.
    if (game.missions.banner) {
      text(game.missions.banner, VIEW.width / 2, 120, 30, '#37e08b', 'center', 'bold');
    }
    // Context hint.
    if (game.hint) {
      text(game.hint, VIEW.width / 2, VIEW.height - 120, 17, '#ffe9a8', 'center', 'bold');
    }
  }

  function drawTitle(game, best) {
    ctx.fillStyle = 'rgba(8, 10, 16, 0.62)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    text('CRESCENT BAY', VIEW.width / 2, 240, 84, PALETTE.title, 'center', 'bold');
    text('an original open-world crime game', VIEW.width / 2, 282, 22, PALETTE.hudMuted, 'center');
    text('Jax is back in town with $120 and a grudge. Steal cars, run jobs,', VIEW.width / 2, 350, 19, PALETTE.hudText, 'center');
    text('and stay one step ahead of the Crescent Bay PD.', VIEW.width / 2, 378, 19, PALETTE.hudText, 'center');
    text('WASD / arrows — walk & drive · E — steal / enter car · Shift — run', VIEW.width / 2, 440, 18, '#ffe9a8', 'center');
    text('P — pause · M — mute · progress saves automatically', VIEW.width / 2, 470, 18, '#ffe9a8', 'center');
    const hasSave = game.hasSave;
    text(hasSave ? 'Press Enter — Continue' : 'Press Enter — New Game', VIEW.width / 2, 540, 26, '#37e08b', 'center', 'bold');
    if (best > 0) text(`Best cash: $${best}`, VIEW.width / 2, 580, 16, PALETTE.hudMuted, 'center');
  }

  function drawPaused() {
    ctx.fillStyle = 'rgba(8, 10, 16, 0.6)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    text('PAUSED', VIEW.width / 2, 360, 56, PALETTE.title, 'center', 'bold');
    text('Press P to keep playing', VIEW.width / 2, 410, 20, PALETTE.hudMuted, 'center');
  }

  function drawBusted(game) {
    ctx.fillStyle = 'rgba(8, 10, 16, 0.72)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    text('BUSTED', VIEW.width / 2, 340, 72, '#ff5a4e', 'center', 'bold');
    text('The Crescent Bay PD caught up with Jax.', VIEW.width / 2, 392, 20, PALETTE.hudText, 'center');
    text(`They took $${game.bustedFine} and let him walk.`, VIEW.width / 2, 424, 20, PALETTE.hudText, 'center');
    text('Press Enter to get back out there', VIEW.width / 2, 500, 22, '#37e08b', 'center', 'bold');
  }

  /** Paint one frame of the game on the given screen. */
  function draw(game, screen) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0c0e14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    const p = game.entities.player;
    const cam = {
      x: clamp(p.x - VIEW.width / 2, -80, WORLD.width - VIEW.width + 80),
      y: clamp(p.y - VIEW.height / 2, -80, WORLD.height - VIEW.height + 80),
    };
    ctx.save();
    ctx.translate(-cam.x, -cam.y);
    drawCity(game.city, cam, game.time);
    if (game.missions.marker) drawMarker(game.missions.marker, game.time);
    for (const car of game.entities.cars) drawCar(car, game.time);
    for (const ped of game.entities.peds) drawPerson(ped.x, ped.y, Math.atan2(ped.ty - ped.y, ped.tx - ped.x), ped.color, 9);
    if (!p.inCar) drawPerson(p.x, p.y, p.angle, PALETTE.player, PLAYER.radius);
    ctx.restore();
    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) drawHud(game);
    if (screen === SCREEN_TITLE) drawTitle(game, game.bestCash);
    else if (screen === SCREEN_PAUSED) drawPaused();
    else if (screen === SCREEN_BUSTED) drawBusted(game);
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
