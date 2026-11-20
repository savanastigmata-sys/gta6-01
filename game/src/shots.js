// The screenshot scenes behind ?shot=start|drive|mission|wanted (with
// &seed=N). Each one plays the real rules forward from a fresh world for a
// fixed number of steps, steered by a simple autopilot, so the frame is what
// a short game really looks like and the same seed always gives the same frame.
import { STEP, WORLD } from './config.js';
import { SCREEN_TITLE, SCREEN_PLAY } from './render.js';
import { angleDiff, clamp } from './random.js';

const SAMPLE = STEP;

/** Drive the player's car toward (tx, ty) for one step; returns the input. */
function driveToward(game, tx, ty) {
  const p = game.entities.player;
  const car = p.inCar;
  if (!car) return { x: 0, y: 0 };
  const want = Math.atan2(ty - car.y, tx - car.x);
  const steer = clamp(angleDiff(car.angle, want) * 1.8, -1, 1);
  return { x: steer, y: -1 };
}

function autopilot(game, name, t) {
  const p = game.entities.player;
  if (!p.inCar) return { x: 0, y: 0 };
  if (name === 'mission' && game.missions.marker) {
    return driveToward(game, game.missions.marker.x, game.missions.marker.y);
  }
  if (name === 'wanted') {
    // Flee east down the avenue, weaving a little but staying on the road.
    const weave = Math.sin(t * 0.9) * 22;
    const car = p.inCar;
    return driveToward(game, car.x + 500, 1000 + weave);
  }
  // Drive: cruise east along the avenue, then south.
  const car = p.inCar;
  const tx = car.x < 2600 ? 2700 : car.x;
  const ty = car.x < 2600 ? 1000 : 2100;
  return driveToward(game, tx, ty);
}

/**
 * Set `game` to the named scene and return the screen to draw over it.
 * `game` is the object main.js builds (entities, missions, city, wanted…).
 */
export function stageShot(name, game) {
  game.newGame();
  const input = { move: () => ({ x: 0, y: 0 }), run: () => false };
  if (name === 'start') {
    for (let i = 0; i < 5 / SAMPLE; i += 1) game.stepAmbient(SAMPLE);
    return { screen: SCREEN_TITLE };
  }
  // Put Jax in a car downtown for the driving scenes.
  const car = game.entities.cars.find((c) => c.parked && Math.abs(c.y - 1000) < 80)
    || game.entities.cars.find((c) => c.parked);
  if (car) {
    game.entities.player.x = car.x;
    game.entities.player.y = car.y;
    game.entities.enterCar(car);
  }
  if (name === 'drive') {
    game.entities.player.x = 1000;
    game.entities.player.y = 1000;
    if (game.entities.player.inCar) {
      const c = game.entities.player.inCar;
      c.x = 1000;
      c.y = 1000;
      c.angle = 0;
    }
    // Three seconds east down the avenue: far enough to be moving, close
    // enough to still be downtown.
    for (let i = 0; i < 3 / SAMPLE; i += 1) {
      const t = i * SAMPLE;
      input.move = () => autopilot(game, 'drive', t);
      game.stepGame(SAMPLE, input);
    }
    return { screen: SCREEN_PLAY };
  }
  if (name === 'mission') {
    game.missions.startMission(game); // M1
    game.missions.complete(game); // bank it, move to M2
    game.missions.startMission(game); // M2 Harbor Run, timed
    if (game.entities.player.inCar) {
      const c = game.entities.player.inCar;
      c.x = 1600;
      c.y = 2050;
      c.angle = Math.PI / 2;
      game.entities.player.x = c.x;
      game.entities.player.y = c.y;
    }
    // 0.3 s south: close enough that the harbour marker is in the frame,
    // far enough that the mission is still running.
    for (let i = 0; i < 0.3 / SAMPLE; i += 1) {
      const t = i * SAMPLE;
      input.move = () => autopilot(game, 'mission', t);
      game.stepGame(SAMPLE, input);
    }
    return { screen: SCREEN_PLAY };
  }
  if (name === 'wanted') {
    game.setWanted(3);
    if (game.entities.player.inCar) {
      const c = game.entities.player.inCar;
      c.x = 1400;
      c.y = 1000;
      c.angle = 0;
      c.speed = 380; // already fleeing at speed when the frame is taken
      game.entities.player.x = c.x;
      game.entities.player.y = c.y;
    }
    // Spawn the pursuit now (stepGame only tops it up) and put it in frame.
    const cops = game.entities.police;
    while (cops.length < 3) game.entities.spawnPoliceCar();
    const spots = [
      { x: 1150, y: 1000, angle: 0 },
      { x: 2600, y: 974, angle: Math.PI },
      { x: 1600, y: 700, angle: Math.PI / 2 },
    ];
    cops.forEach((cop, i) => {
      const s = spots[i % spots.length];
      cop.x = s.x;
      cop.y = s.y;
      cop.angle = s.angle;
      cop.speed = 300;
    });
    // 1.5 s: the cruisers are closing in, the player is still moving fast.
    for (let i = 0; i < 1.5 / SAMPLE; i += 1) {
      const t = i * SAMPLE;
      input.move = () => autopilot(game, 'wanted', t);
      game.stepGame(SAMPLE, input);
    }
    return { screen: SCREEN_PLAY };
  }
  return { screen: SCREEN_TITLE };
}
