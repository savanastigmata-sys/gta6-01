// Missions and the story around them. A mission is a small state machine:
// it names a target marker, watches the world, and pays out on completion.
// M1 steal a car and deliver it; M2 timed harbour delivery; M3 survive the heat.
import { MISSIONS, WORLD } from './config.js';
import { dist2 } from './random.js';

export function createMissions() {
  let index = 0; // which mission is active; MISSIONS.length means all done
  let stage = 'brief'; // brief | active | done
  let timer = 0;
  let marker = null;
  let message = '';
  let messageTimer = 0;
  let banner = '';
  let bannerTimer = 0;

  function current() {
    return index < MISSIONS.length ? MISSIONS[index] : null;
  }

  function placeMarker(x, y, label) {
    marker = { x, y, label };
  }

  function say(text, seconds) {
    message = text;
    messageTimer = seconds || 4;
  }

  function showBanner(text) {
    banner = text;
    bannerTimer = 3;
  }

  function startMission(game) {
    const m = current();
    if (!m) return;
    stage = 'active';
    if (m.id === 'first-wheels') {
      placeMarker(2200, 1000, 'Drop-off');
      say('Jax: "First job. Get wheels — any car — and bring it to the marker."', 5);
    } else if (m.id === 'harbor-run') {
      timer = m.timeLimit;
      placeMarker(1600, 2300, 'Harbour');
      say('Rosa: "Package for the docks. No stops, no cops. Clock is ticking."', 5);
    } else if (m.id === 'heat') {
      timer = m.timeLimit;
      marker = null;
      // A fresh ride for the getaway: the harbour car is half-wrecked by now.
      if (game.entities.player.inCar) game.entities.player.inCar.hp = 100;
      say('Rosa: "Three stars! Lose them or outlast them — sixty seconds."', 5);
    }
  }

  function complete(game) {
    const m = current();
    if (!m) return;
    game.cash += m.reward;
    if (m.id === 'heat') game.setWanted(0);
    showBanner(`Mission complete · +$${m.reward}`);
    say(`"${m.title}" done. $${m.reward} in your pocket.`, 4);
    index += 1;
    stage = 'brief';
    marker = null;
    timer = 0;
    if (game.audio) game.audio.mission();
    if (current()) {
      say(`${current().title} — ${current().briefing}`, 6);
    } else {
      say('All missions done. Crescent Bay is yours — free roam, keep the cash coming.', 6);
    }
  }

  function fail(game, reason) {
    const m = current();
    if (!m) return;
    showBanner(`Mission failed · ${reason}`);
    say(`"${m.title}" failed: ${reason}. Try again — press Enter to restart it.`, 6);
    stage = 'brief';
    marker = null;
    timer = 0;
  }

  function restart(game) {
    stage = 'brief';
    marker = null;
    timer = 0;
    startMission(game);
  }

  /**
   * Advance the active mission one step. `game` carries the player, cash,
   * wanted level and a flag the world sets when a car was just stolen.
   * Returns 'completed' | 'failed' | null.
   */
  function step(dt, game) {
    if (messageTimer > 0) messageTimer -= dt;
    if (bannerTimer > 0) bannerTimer -= dt;
    const m = current();
    if (!m || stage !== 'active') return null;

    if (m.timeLimit) {
      timer -= dt;
      if (timer <= 0) {
        if (m.id === 'heat') {
          complete(game);
          return 'completed';
        }
        fail(game, 'out of time');
        return 'failed';
      }
    }

    const p = game.entities.player;
    if (m.id === 'first-wheels') {
      if (p.inCar && marker && dist2(p.x, p.y, marker.x, marker.y) < 90 * 90) {
        complete(game);
        return 'completed';
      }
    } else if (m.id === 'harbor-run') {
      if (p.inCar && marker && dist2(p.x, p.y, marker.x, marker.y) < 100 * 100) {
        complete(game);
        return 'completed';
      }
    } else if (m.id === 'heat') {
      if (game.wanted === 0 && timer < m.timeLimit - 2) {
        complete(game);
        return 'completed';
      }
    }
    return null;
  }

  function objective() {
    const m = current();
    if (!m) return 'Free roam — Crescent Bay is yours.';
    if (stage === 'brief') return `${m.title}: press Enter to start`;
    if (m.id === 'first-wheels') return 'Steal a car (E) and drive to the marker';
    if (m.id === 'harbor-run') return `Deliver to the harbour — ${Math.max(0, Math.ceil(timer))}s left`;
    if (m.id === 'heat') return `Survive the heat — ${Math.max(0, Math.ceil(timer))}s left`;
    return m.title;
  }

  return {
    get index() { return index; },
    set index(v) { index = v; },
    get stage() { return stage; },
    set stage(v) { stage = v; },
    get marker() { return marker; },
    get timer() { return timer; },
    get message() { return messageTimer > 0 ? message : ''; },
    get banner() { return bannerTimer > 0 ? banner : ''; },
    current, startMission, complete, fail, restart, step, objective,
    say, showBanner,
  };
}
