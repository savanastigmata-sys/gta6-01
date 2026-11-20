// The moving things: the player on foot, cars (parked, traffic AI, the
// player's, police), pedestrians and the police chase. No drawing here —
// render.js draws whatever this module owns.
import { CAR, PED, PLAYER, POLICE, TRAFFIC, WORLD } from './config.js';
import { makeRng, range, pick, clamp, angleDiff, dist2 } from './random.js';
import { hitsBuilding, isRoad, nearestRoadPoint, resolveCollision, lightState } from './world.js';

const CAR_COLORS = ['#d94f3d', '#3d7bd9', '#e8e4da', '#2fae6e', '#e8b13d', '#7a5fd0', '#c94f8a', '#4fb3c9'];
const PED_COLORS = ['#e8e4da', '#d9a05b', '#7fb069', '#c96f6f', '#8a7fd0', '#5fb3c9'];

export function makeCar(x, y, angle, color, opts) {
  return {
    x, y, angle,
    speed: 0,
    color,
    hp: CAR.maxHealth,
    driver: (opts && opts.driver) || null, // 'player' | 'ai' | null (parked)
    parked: !!(opts && opts.parked),
    police: !!(opts && opts.police),
    // Traffic AI: which road it follows and which way along it.
    axis: (opts && opts.axis) || 'x',
    dir: (opts && opts.dir) || 1,
    lane: (opts && opts.lane) || 0,
    cruise: (opts && opts.cruise) || TRAFFIC.cruise,
    wait: 0,
    skid: 0,
    hitCd: 0, // seconds until the next wall impact can hurt the car
    id: (opts && opts.id) || 0,
  };
}

export function createEntities(seed) {
  const rng = makeRng(seed * 7919 + 13);
  const player = {
    x: WORLD.roadsX[1], y: WORLD.roadsY[1] + 90,
    angle: -Math.PI / 2, health: PLAYER.maxHealth,
    inCar: null, speed: 0,
  };
  const cars = [];
  const peds = [];
  const police = [];
  let carId = 1;

  function randomRoadSpot() {
    if (rng() < 0.5) {
      const rx = pick(rng, WORLD.roadsX);
      return { x: rx + (rng() < 0.5 ? -26 : 26), y: range(rng, 140, WORLD.height - 160), axis: 'y', dir: rng() < 0.5 ? 1 : -1 };
    }
    const ry = pick(rng, WORLD.roadsY);
    return { x: range(rng, 140, WORLD.width - 140), y: ry + (rng() < 0.5 ? -26 : 26), axis: 'x', dir: rng() < 0.5 ? 1 : -1 };
  }

  function spawnParked(count) {
    for (let i = 0; i < count; i += 1) {
      const spot = randomRoadSpot();
      const angle = spot.axis === 'x' ? (spot.dir > 0 ? 0 : Math.PI) : (spot.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      cars.push(makeCar(spot.x, spot.y, angle, pick(rng, CAR_COLORS), { parked: true, axis: spot.axis, dir: spot.dir, id: carId }));
      carId += 1;
    }
  }

  function spawnTraffic(count) {
    for (let i = 0; i < count; i += 1) {
      const spot = randomRoadSpot();
      const angle = spot.axis === 'x' ? (spot.dir > 0 ? 0 : Math.PI) : (spot.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      cars.push(makeCar(spot.x, spot.y, angle, pick(rng, CAR_COLORS), {
        driver: 'ai', axis: spot.axis, dir: spot.dir, cruise: range(rng, 150, 220), id: carId,
      }));
      carId += 1;
    }
  }

  function spawnPeds(count) {
    for (let i = 0; i < count; i += 1) {
      const x = range(rng, 100, WORLD.width - 100);
      const y = range(rng, 100, WORLD.waterY - 60);
      const p = nearestRoadPoint(x, y);
      peds.push({
        x: p.x + range(rng, -40, 40), y: p.y + range(rng, -40, 40),
        tx: p.x, ty: p.y, speed: range(rng, 40, 70),
        color: pick(rng, PED_COLORS), wait: range(rng, 0, 3), panic: 0,
      });
    }
  }

  function reset() {
    cars.length = 0;
    peds.length = 0;
    police.length = 0;
    player.x = WORLD.roadsX[1];
    player.y = WORLD.roadsY[1] + 90;
    player.angle = -Math.PI / 2;
    player.health = PLAYER.maxHealth;
    player.inCar = null;
    player.speed = 0;
    spawnParked(14);
    spawnTraffic(TRAFFIC.count);
    spawnPeds(PED.count);
  }

  function nearestCar(x, y, maxDist) {
    let best = null;
    let bestD = maxDist * maxDist;
    for (const car of cars) {
      const d = dist2(x, y, car.x, car.y);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  /** Put the player in a car; an AI driver is thrown out as a pedestrian. */
  function enterCar(car) {
    if (car.driver === 'ai') {
      peds.push({
        x: car.x - Math.cos(car.angle) * 40, y: car.y - Math.sin(car.angle) * 40,
        tx: car.x, ty: car.y, speed: 90, color: '#e8e4da', wait: 0, panic: 3,
      });
      car.driver = null;
    }
    car.driver = 'player';
    car.parked = false;
    player.inCar = car;
    player.x = car.x;
    player.y = car.y;
    return car.driver === 'player';
  }

  function exitCar() {
    const car = player.inCar;
    if (!car) return;
    car.driver = null;
    car.parked = true;
    car.speed = 0;
    const side = { x: car.x + Math.cos(car.angle + Math.PI / 2) * 34, y: car.y + Math.sin(car.angle + Math.PI / 2) * 34 };
    player.x = side.x;
    player.y = side.y;
    player.angle = car.angle;
    player.inCar = null;
  }

  function stepPlayer(dt, move, running, city) {
    if (player.inCar) return;
    const speed = running ? PLAYER.runSpeed : PLAYER.walkSpeed;
    let dx = move.x;
    let dy = move.y;
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      dx /= len;
      dy /= len;
      player.x += dx * speed * dt;
      player.y += dy * speed * dt;
      player.angle = Math.atan2(dy, dx);
      player.speed = speed;
    } else {
      player.speed = 0;
    }
    // Stay out of the water; the docks are walkable.
    if (player.y > WORLD.waterY - 8) {
      let onDock = false;
      for (const d of city.docks) {
        if (player.x > d.x - 6 && player.x < d.x + d.w + 6 && player.y > d.y - 6 && player.y < d.y + d.h) onDock = true;
      }
      if (!onDock) player.y = WORLD.waterY - 8;
    }
    resolveCollision(city, player, PLAYER.radius);
  }

  function stepCarPhysics(car, dt, throttle, steer, city) {
    if (car.hitCd > 0) car.hitCd -= dt;
    const moving = Math.abs(car.speed) > 4;
    if (moving) car.angle += steer * CAR.turnRate * dt * clamp(Math.abs(car.speed) / 200, 0.35, 1) * Math.sign(car.speed);
    if (throttle > 0) car.speed += CAR.accel * dt;
    else if (throttle < 0) car.speed -= (car.speed > 8 ? CAR.brake : CAR.accel * 0.55) * dt;
    else car.speed -= car.speed * 1.4 * dt;
    car.speed = clamp(car.speed, -CAR.reverseMax, CAR.maxSpeed);
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    const probe = { x: nx, y: ny };
    const hit = hitsBuilding(city, nx, ny, CAR.length / 2 - 6);
    if (hit) {
      // A wall impact hurts once per hit, not once per frame of grinding.
      if (car.hitCd <= 0) {
        car.hp = Math.max(0, car.hp - Math.abs(car.speed) * 0.008);
        car.hitCd = 0.4;
      }
      // Slide along the wall instead of stopping dead.
      const px = { x: nx, y: car.y };
      const py = { x: car.x, y: ny };
      if (!hitsBuilding(city, px.x, px.y, CAR.length / 2 - 6)) {
        car.x = px.x;
      } else if (!hitsBuilding(city, py.x, py.y, CAR.length / 2 - 6)) {
        car.y = py.y;
      } else {
        car.speed *= -0.25;
      }
      car.skid = 0.25;
      return true;
    }
    car.x = nx;
    car.y = ny;
    // Water is a wall for cars.
    if (car.y > WORLD.waterY - 20) {
      car.y = WORLD.waterY - 20;
      car.speed *= 0.4;
    }
    if (car.skid > 0) car.skid -= dt;
    return false;
  }

  function stepTrafficCar(car, dt, city, time) {
    if (car.driver !== 'ai') return;
    // Stop for red lights at the next intersection.
    let target = car.cruise;
    const ahead = 90;
    const fx = car.x + Math.cos(car.angle) * ahead;
    const fy = car.y + Math.sin(car.angle) * ahead;
    for (const rx of WORLD.roadsX) {
      for (const ry of WORLD.roadsY) {
        if (Math.abs(fx - rx) < 46 && Math.abs(fy - ry) < 46) {
          const green = lightState(time, rx, ry);
          const nsGreen = green === 'ns';
          const goingNs = car.axis === 'y';
          if (nsGreen !== goingNs) target = 0;
        }
      }
    }
    // Slow for the car ahead.
    for (const other of cars) {
      if (other === car || other.parked) continue;
      const dx = other.x - car.x;
      const dy = other.y - car.y;
      const along = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
      const across = Math.abs(-dx * Math.sin(car.angle) + dy * Math.cos(car.angle));
      if (along > 0 && along < 110 && across < 34) target = Math.min(target, other.speed * 0.8);
    }
    const throttle = car.speed < target - 4 ? 1 : 0;
    if (target === 0 && car.speed > 4) {
      car.speed = Math.max(0, car.speed - CAR.brake * dt);
    }
    stepCarPhysics(car, dt, throttle, 0, city);
    // Keep traffic on its road: nudge back onto the lane.
    if (car.axis === 'x') {
      const laneY = car.y;
      const road = nearestRoadPoint(car.x, car.y);
      const wantY = road.y + (car.dir > 0 ? 26 : -26);
      car.y += clamp(wantY - laneY, -40 * dt, 40 * dt);
      car.angle += angleDiff(car.angle, car.dir > 0 ? 0 : Math.PI) * 1.2 * dt;
    } else {
      const laneX = car.x;
      const road = nearestRoadPoint(car.x, car.y);
      const wantX = road.x + (car.dir > 0 ? 26 : -26);
      car.x += clamp(wantX - laneX, -40 * dt, 40 * dt);
      car.angle += angleDiff(car.angle, car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) * 1.2 * dt;
    }
    // Wrap around the city edge so traffic never runs out.
    if (car.x < 60) { car.x = WORLD.width - 70; }
    if (car.x > WORLD.width - 60) { car.x = 70; }
    if (car.y < 60) { car.y = WORLD.waterY - 70; }
    if (car.y > WORLD.waterY - 60) { car.y = 70; }
  }

  function stepPed(ped, dt, city, danger) {
    if (ped.wait > 0) {
      ped.wait -= dt;
      return;
    }
    const d = Math.hypot(ped.tx - ped.x, ped.ty - ped.y);
    if (d < 8) {
      // Pick a new stroll target along the nearest road.
      const p = nearestRoadPoint(ped.x + range(rng, -500, 500), ped.y + range(rng, -500, 500));
      ped.tx = clamp(p.x + range(rng, -30, 30), 60, WORLD.width - 60);
      ped.ty = clamp(p.y + range(rng, -30, 30), 60, WORLD.waterY - 40);
      ped.wait = range(rng, 0.5, 3);
      return;
    }
    let speed = ped.speed;
    if (danger && dist2(ped.x, ped.y, danger.x, danger.y) < 260 * 260) {
      speed = 150;
      ped.panic = 1;
      // Flee away from the danger.
      ped.tx = ped.x + (ped.x - danger.x);
      ped.ty = ped.y + (ped.y - danger.y);
    }
    ped.x += ((ped.tx - ped.x) / d) * speed * dt;
    ped.y += ((ped.ty - ped.y) / d) * speed * dt;
    resolveCollision(city, ped, PED.radius);
  }

  function spawnPoliceCar() {
    // Spawn a cruiser on a road, not right on top of the player.
    let spot = randomRoadSpot();
    for (let tries = 0; tries < 6 && Math.hypot(spot.x - player.x, spot.y - player.y) < 700; tries += 1) {
      spot = randomRoadSpot();
    }
    const angle = spot.axis === 'x' ? (spot.dir > 0 ? 0 : Math.PI) : (spot.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    const car = makeCar(spot.x, spot.y, angle, '#20242c', {
      driver: 'ai', police: true, axis: spot.axis, dir: spot.dir, cruise: POLICE.chaseSpeed, id: carId,
    });
    carId += 1;
    cars.push(car);
    police.push(car);
    return car;
  }

  function nearestIntersection(x, y) {
    let bx = WORLD.roadsX[0];
    let bd = Infinity;
    for (const rx of WORLD.roadsX) {
      const d = Math.abs(x - rx);
      if (d < bd) { bd = d; bx = rx; }
    }
    let by = WORLD.roadsY[0];
    bd = Infinity;
    for (const ry of WORLD.roadsY) {
      const d = Math.abs(y - ry);
      if (d < bd) { bd = d; by = ry; }
    }
    return { x: bx, y: by };
  }

  function stepPolice(car, dt, city, wanted) {
    if (wanted === 0) {
      // No heat: cruise off and despawn at the edge.
      stepTrafficCar(car, dt, city, 0);
      return;
    }
    const tx = player.x;
    const ty = player.y;
    // A cruiser wedged nose-first against a wall (or the player's parked
    // car) backs straight out before it tries to chase again.
    if ((car.reverseT || 0) > 0) {
      car.reverseT -= dt;
      stepCarPhysics(car, dt, -1, 0, city);
      return;
    }
    // Chase along the roads: a direct line gets a cruiser stuck on the
    // building between it and the player, so follow a Manhattan route via
    // intersections and only cut straight at the player on the last leg.
    // The route persists across frames (only its last point tracks the
    // player); rebuilding it from scratch each time would make the cruiser
    // turn back toward the intersection it just left.
    car.routeTimer = (car.routeTimer || 0) - dt;
    if (Math.abs(car.speed) < 40) car.stuckT = (car.stuckT || 0) + dt;
    else car.stuckT = 0;
    if ((car.stuckT || 0) > 1.2) {
      car.stuckT = 0;
      car.reverseT = 1.0;
      car.route = null;
    }
    const dist = Math.hypot(tx - car.x, ty - car.y);
    // Close in, chase the player directly: the route would send a cruiser
    // that is already on the player's tail back to an intersection first.
    // Far off, follow the Manhattan route instead of cutting across blocks.
    let target;
    if (dist < 450) {
      target = { x: tx, y: ty };
      car.route = null;
    } else {
      if (!car.route || car.route.length === 0) {
        car.routeTimer = 0.8;
        const ci = nearestIntersection(car.x, car.y);
        const pi = nearestIntersection(tx, ty);
        car.route = [ci, { x: pi.x, y: ci.y }, pi, { x: tx, y: ty }];
      } else if (car.routeTimer <= 0) {
        car.routeTimer = 0.8;
        car.route[car.route.length - 1] = { x: tx, y: ty };
      }
      const wp = car.route[0];
      const wd = Math.hypot(wp.x - car.x, wp.y - car.y);
      if (wd < 80) car.route.shift();
      target = car.route[0] || { x: tx, y: ty };
    }
    const wantAngle = Math.atan2(target.y - car.y, target.x - car.x);
    const steer = clamp(angleDiff(car.angle, wantAngle) * 1.6, -1, 1);
    // Coast in close so the cruiser does not overshoot the player at 470.
    const throttle = dist > 150 ? 1 : dist > 60 ? 0.2 : 0;
    stepCarPhysics(car, dt, throttle, steer, city);
    // Ram the player's car: slow it and hurt it (per second, not per step).
    if (player.inCar && dist < 74) {
      player.inCar.speed *= (1 - 0.6 * dt);
      player.inCar.hp = Math.max(0, player.inCar.hp - 8 * dt);
    }
  }

  function step(dt, input, city, time, wanted) {
    stepPlayer(dt, input.move(), input.run(), city);
    // Driving input.
    if (player.inCar) {
      const move = input.move();
      const throttle = move.y < 0 ? 1 : move.y > 0 ? -1 : 0;
      const steer = move.x;
      stepCarPhysics(player.inCar, dt, throttle, steer, city);
      player.x = player.inCar.x;
      player.y = player.inCar.y;
      player.angle = player.inCar.angle;
    }
    for (const car of cars) {
      if (car.driver === 'ai' && !car.police) stepTrafficCar(car, dt, city, time);
      else if (car.police) stepPolice(car, dt, city, wanted);
    }
    const danger = wanted > 0 ? { x: player.x, y: player.y } : null;
    for (const ped of peds) stepPed(ped, dt, city, danger);
    // Car-car bumps: push apart, lose a little speed.
    for (let i = 0; i < cars.length; i += 1) {
      for (let j = i + 1; j < cars.length; j += 1) {
        const a = cars[i];
        const b = cars[j];
        const d2 = dist2(a.x, a.y, b.x, b.y);
        if (d2 < 58 * 58 && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const push = (58 - d) / 2;
          const nx = (b.x - a.x) / d;
          const ny = (b.y - a.y) / d;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
          // Damp speed per second of contact, not per step.
          const damp = Math.max(0, 1 - 1.2 * dt);
          a.speed *= damp;
          b.speed *= damp;
        }
      }
    }
    // Prune police cars that have drifted far off when there is no heat.
    if (wanted === 0) {
      for (let i = police.length - 1; i >= 0; i -= 1) {
        const car = police[i];
        if (Math.hypot(car.x - player.x, car.y - player.y) > 1400) {
          cars.splice(cars.indexOf(car), 1);
          police.splice(i, 1);
        }
      }
    }
  }

  reset();
  return {
    player, cars, peds, police,
    reset, step, nearestCar, enterCar, exitCar, spawnPoliceCar,
  };
}
