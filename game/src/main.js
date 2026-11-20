// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. Screens: title, play, paused, busted.
//
// ?seed=N fixes the city's layout. ?shot=start|drive|mission|wanted (with
// &seed=N) stages that scene instead of running the loop, paints it twice
// and sets window.__shotReady for a screenshot.
import { STEP, SAVE_KEY, START_CASH, POLICE, WORLD, MISSIONS } from './config.js';
import { makeRng } from './random.js';
import { buildCity } from './world.js';
import { createEntities } from './entities.js';
import { createMissions } from './missions.js';
import { ACTION_CONFIRM, ACTION_PAUSE, ACTION_INTERACT, ACTION_MUTE, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const audio = createAudio();
const renderer = createRenderer(canvas);

function makeGame() {
  const city = buildCity(seed);
  const entities = createEntities(seed);
  const missions = createMissions();
  const game = {
    city,
    entities,
    missions,
    audio,
    cash: START_CASH,
    wanted: 0,
    clock: 9 * 60, // 09:00
    time: 0,
    bestCash: START_CASH,
    hasSave: false,
    hint: '',
    bustedFine: 0,
    bustedCount: 0,
    hideTimer: 0,
    catchTimer: 0,
    saveTimer: 0,
    rng: makeRng(seed + 99),

    setWanted(level) {
      game.wanted = Math.max(0, Math.min(3, level));
      game.hideTimer = 0;
      audio.setSiren(game.wanted > 0);
    },

    addWanted(amount) {
      if (game.wanted < 3) game.setWanted(game.wanted + amount);
    },

    newGame() {
      entities.reset();
      game.cash = START_CASH;
      game.wanted = 0;
      game.clock = 9 * 60;
      game.time = 0;
      game.hideTimer = 0;
      game.catchTimer = 0;
      game.hint = '';
      missions.index = 0;
      missions.stage = 'brief';
      missions.say(`${missions.current().title} — ${missions.current().briefing}`, 6);
      audio.setSiren(false);
      audio.setEngine(0);
    },

    stepAmbient(dt) {
      game.time += dt;
      const dummy = { move: () => ({ x: 0, y: 0 }), run: () => false };
      entities.step(dt, dummy, city, game.time, 0);
    },

    stepGame(dt, input) {
      game.time += dt;
      game.clock += dt * 0.5;
      game.saveTimer += dt;
      entities.step(dt, input, city, game.time, game.wanted);
      const p = entities.player;

      // Context hint.
      if (!p.inCar) {
        const near = entities.nearestCar(p.x, p.y, 78);
        game.hint = near ? (near.driver === 'ai' ? 'Press E — jack this car' : 'Press E — get in the car') : '';
      } else {
        game.hint = 'E — get out · drive with WASD';
      }

      // Running over a pedestrian is a crime the whole street sees.
      if (p.inCar && Math.abs(p.inCar.speed) > 160) {
        for (let i = entities.peds.length - 1; i >= 0; i -= 1) {
          const ped = entities.peds[i];
          if (Math.hypot(ped.x - p.x, ped.y - p.y) < 34) {
            entities.peds.splice(i, 1);
            game.addWanted(1);
            missions.say('Someone saw that. The cops are coming.', 3);
            audio.crash();
          }
        }
      }

      // Wanted: bring in police cars, let the heat cool off out of sight.
      const wantCops = game.wanted;
      while (entities.police.length < wantCops) entities.spawnPoliceCar();
      if (game.wanted > 0) {
        let seen = false;
        for (const cop of entities.police) {
          if (Math.hypot(cop.x - p.x, cop.y - p.y) < 560) seen = true;
        }
        if (seen) {
          game.hideTimer = 0;
        } else {
          game.hideTimer += dt;
          if (game.hideTimer > POLICE.hideTime) game.setWanted(game.wanted - 1);
        }
      }

      // Busted: a cop holds you on foot, or your health runs out.
      if (!p.inCar && game.wanted > 0) {
        let close = false;
        for (const cop of entities.police) {
          if (Math.hypot(cop.x - p.x, cop.y - p.y) < POLICE.catchRadius) close = true;
        }
        if (close) {
          game.catchTimer += dt;
          if (game.catchTimer > POLICE.catchHold) {
            game.busted();
            return;
          }
        } else {
          game.catchTimer = Math.max(0, game.catchTimer - dt);
        }
      }
      if (p.health <= 0) {
        game.busted();
        return;
      }
      // A wrecked car strands you on foot.
      if (p.inCar && p.inCar.hp <= 0) {
        p.inCar.speed = 0;
        entities.exitCar();
        p.health = Math.max(1, p.health - 15);
        missions.say('Your ride is totalled. Get out and run.', 3);
      }
      // Slow health regen when nobody is after you.
      if (game.wanted === 0 && p.health < 100) p.health = Math.min(100, p.health + 0.6 * dt);

      // Missions.
      const result = missions.step(dt, game);
      if (result === 'completed') {
        game.bestCash = Math.max(game.bestCash, game.cash);
        game.save();
      } else if (result === 'failed' && missions.current() && missions.current().id === 'heat') {
        game.setWanted(0);
      }

      // Sound follows the drive.
      if (p.inCar) audio.setEngine(Math.abs(p.inCar.speed) / 520);
      else audio.setEngine(0);

      if (game.saveTimer > 10) {
        game.saveTimer = 0;
        game.save();
      }
    },

    busted() {
      const fine = Math.min(game.cash, Math.max(50, Math.floor(game.cash * 0.2)));
      game.bustedFine = fine;
      game.bustedCount += 1;
      game.cash -= fine;
      game.setWanted(0);
      const p = entities.player;
      if (p.inCar) entities.exitCar();
      p.health = 100;
      p.x = WORLD.roadsX[1];
      p.y = WORLD.roadsY[1] + 90;
      audio.busted();
      audio.setEngine(0);
      game.screen = SCREEN_BUSTED;
      game.save();
    },

    save() {
      try {
        const p = entities.player;
        window.localStorage.setItem(SAVE_KEY, JSON.stringify({
          cash: game.cash,
          mission: missions.index,
          x: p.x, y: p.y,
          clock: game.clock,
          bestCash: game.bestCash,
        }));
        game.hasSave = true;
      } catch {
        // Storage can be off (private windows): progress then lasts this visit only.
      }
    },

    load() {
      try {
        const raw = window.localStorage.getItem(SAVE_KEY);
        if (!raw) return false;
        const data = JSON.parse(raw);
        game.cash = data.cash ?? START_CASH;
        game.clock = data.clock ?? 9 * 60;
        game.bestCash = Math.max(data.bestCash ?? START_CASH, game.cash);
        missions.index = Math.min(data.mission ?? 0, MISSIONS.length);
        missions.stage = 'brief';
        const p = entities.player;
        p.x = data.x ?? p.x;
        p.y = data.y ?? p.y;
        game.hasSave = true;
        missions.say(`${missions.current().title} — ${missions.current().briefing}`, 6);
        return true;
      } catch {
        return false;
      }
    },
  };
  game.screen = SCREEN_TITLE;
  // A save on disk means the title offers Continue.
  try {
    game.hasSave = !!window.localStorage.getItem(SAVE_KEY);
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      game.bestCash = Math.max(game.bestCash, data.bestCash ?? 0, data.cash ?? 0);
    }
  } catch {
    /* ignore */
  }
  return game;
}

function readBestCash() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return 0;
    return JSON.parse(raw).bestCash ?? 0;
  } catch {
    return 0;
  }
}

function runShot(name) {
  const game = makeGame();
  game.bestCash = Math.max(game.bestCash, readBestCash());
  const scene = stageShot(name, game);
  let painted = 0;
  function paint() {
    renderer.draw(game, scene.screen);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const game = makeGame();
  // Debug/testing handle: lets an automated playtest read state and drive
  // inputs without touching the game itself.
  window.__crescentBay = game;
  const input = createInput();
  let screen = SCREEN_TITLE;
  let accumulator = 0;
  let last = performance.now();

  function announce(message) {
    status.textContent = message;
  }

  function startFresh() {
    game.newGame();
    screen = SCREEN_PLAY;
    announce('Playing Crescent Bay. First mission: First Wheels.');
  }

  function continueGame() {
    game.load();
    screen = SCREEN_PLAY;
    announce('Continuing Crescent Bay.');
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      audio.setMuted(!audio.isMuted());
      return;
    }
    if (actions & ACTION_CONFIRM) audio.unlock();
    if (screen === SCREEN_TITLE && (actions & ACTION_CONFIRM)) {
      audio.unlock();
      if (game.hasSave) continueGame();
      else startFresh();
      return;
    }
    if (screen === SCREEN_BUSTED && (actions & ACTION_CONFIRM)) {
      game.newGame();
      game.load();
      screen = SCREEN_PLAY;
      return;
    }
    if (screen === SCREEN_PAUSED && (actions & (ACTION_PAUSE | ACTION_CONFIRM))) {
      screen = SCREEN_PLAY;
      announce('Playing.');
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    if (actions & ACTION_PAUSE) {
      screen = SCREEN_PAUSED;
      audio.setEngine(0);
      announce('Paused.');
      return;
    }
    if (actions & ACTION_CONFIRM) {
      const m = game.missions.current();
      if (m && game.missions.stage === 'brief') {
        game.missions.startMission(game);
        if (m.id === 'heat') game.setWanted(3);
        announce(`Mission started: ${m.title}.`);
      }
      return;
    }
    if (actions & ACTION_INTERACT) {
      const p = game.entities.player;
      if (p.inCar) {
        game.entities.exitCar();
        audio.setEngine(0);
      } else {
        const car = game.entities.nearestCar(p.x, p.y, 78);
        if (car) {
          const hadDriver = car.driver === 'ai';
          game.entities.enterCar(car);
          audio.unlock();
          if (hadDriver) {
            game.addWanted(1);
            game.missions.say('You just jacked that car in broad daylight. Move!', 3);
            audio.crash();
          } else {
            audio.pickup();
          }
        }
      }
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      game.stepAmbient(STEP);
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    game.stepGame(STEP, input);
    if (game.screen === SCREEN_BUSTED) {
      screen = SCREEN_BUSTED;
      game.screen = SCREEN_PLAY;
      announce('Busted. The police took their cut.');
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
      step();
      accumulator -= STEP;
    }
    if (screen !== SCREEN_TITLE && screen !== SCREEN_PLAY) accumulator = 0;
    renderer.draw(game, screen);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      audio.setEngine(0);
      announce('Paused.');
    }
  });

  announce('Crescent Bay. Press Enter to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
