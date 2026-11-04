// Run with: node --test games/pixel-surf/tests/
'use strict';
/* eslint-disable @typescript-eslint/no-require-imports -- plain Node CommonJS test file */

const test = require('node:test');
const assert = require('node:assert/strict');
const Ocean = require('../js/ocean.js');
const Surfer = require('../js/surfer.js');

const DT = 1 / 120;

// Put a surfer on the steep front face of the next crest, moving with the swell.
function spawnOnFace(t0, phase = 1.0, vz = 9) {
  const ph = Ocean.nextCrestPhase(0, 0, t0, 0) + phase;
  const p = Ocean.ridingPoint(0, ph, t0, 0);
  const s = Surfer.create(p.x, p.z, t0);
  s.vz = vz;
  return s;
}

// Run the surfer for `seconds`, feeding inputFn(elapsed, surfer) each physics step.
function simulate(s, t0, seconds, inputFn) {
  const out = { events: [], wipeouts: 0, resurfaces: 0, ridingSec: 0, maxSpeed: 0, airTime: 0 };
  let t = t0;
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    const inp = inputFn(i * DT, s);
    for (const e of Surfer.step(s, inp, DT, t)) {
      out.events.push(e);
      if (e.type === 'wipeout') out.wipeouts++;
      if (e.type === 'resurface') out.resurfaces++;
    }
    if (s.mode === 'surface' && s.riding) out.ridingSec += DT;
    out.maxSpeed = Math.max(out.maxSpeed, Math.hypot(s.vx, s.vz));
    t += DT;
  }
  return { out, t };
}

const IDLE = () => ({ throttle: 0, steer: 0, jump: false, jumpHeld: false, trick: false });
const FORWARD = () => ({ throttle: 1, steer: 0, jump: false, jumpHeld: false, trick: false });

test('surface height stays within the swell amplitude', () => {
  let lo = Infinity;
  let hi = -Infinity;
  for (let x = -60; x <= 60; x += 4) {
    for (let z = -120; z <= 120; z += 0.9) {
      const h = Ocean.height(x, z, 17);
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
    }
  }
  assert.ok(lo > -Ocean.A_MAX - 1e-6 && hi < Ocean.A_MAX + 1e-6, `range ${lo}..${hi}`);
  assert.ok(hi > 1, 'crests should be clearly visible');
});

test('inverse mapping recovers the rest height exactly', () => {
  for (let i = 0; i < 500; i++) {
    const x = Math.random() * 100 - 50;
    const z0 = Math.random() * 200 - 100;
    const t = Math.random() * 60;
    const p = Ocean.surfaceAtRest(x, z0, t);
    assert.ok(Math.abs(Ocean.height(x, p.z, t) - p.y) < 1e-9);
  }
});

test('crests travel at the wave speed', () => {
  const t = 10;
  const z0 = Ocean.nextCrestPhase(3, 0, t, 0);
  const a = Ocean.ridingPoint(3, z0, t, 0);
  const b = Ocean.ridingPoint(3, z0, t + 1, 0);
  assert.ok(Math.abs(b.z - a.z - Ocean.SPEED) < 1e-6);
});

test('the front face slopes downhill toward +z, the back uphill', () => {
  const t = 10;
  const ph = Ocean.nextCrestPhase(0, 0, t, 0);
  const front = Ocean.surface(0, Ocean.ridingPoint(0, ph + 0.6, t, 0).z, t);
  const back = Ocean.surface(0, Ocean.ridingPoint(0, ph - 0.6, t, 0).z, t);
  assert.ok(front.sz < -0.2);
  assert.ok(back.sz > 0.2);
});

test('idle surfer on a big set rides the swell for several seconds', () => {
  const t0 = 10; // near the top of a set
  const { out } = simulate(spawnOnFace(t0), t0, 8, IDLE);
  assert.equal(out.wipeouts, 0);
  assert.ok(out.ridingSec > 4, `riding ${out.ridingSec.toFixed(1)}s`);
});

test('idle surfer on a small set loses the wave and stops riding', () => {
  const s = spawnOnFace(20);
  const { out } = simulate(s, 20, 8, IDLE);
  assert.ok(out.ridingSec < 6, `riding ${out.ridingSec.toFixed(1)}s`);
  assert.equal(s.riding, false, 'no longer riding at the end');
  assert.ok(s.h < 0.3, `left on flat water (h=${s.h.toFixed(2)})`);
});

test('pumping keeps a surfer on a small set', () => {
  const { out } = simulate(spawnOnFace(20, 1.0, 6), 20, 15, FORWARD);
  assert.equal(out.wipeouts, 0);
  assert.ok(out.ridingSec > 5, `riding ${out.ridingSec.toFixed(1)}s`);
});

test('speed is capped', () => {
  const { out } = simulate(spawnOnFace(10), 10, 15, FORWARD);
  assert.ok(out.maxSpeed <= Surfer.MAX_SPEED + 1e-6, `max ${out.maxSpeed}`);
});

test('jumping off the wave goes airborne and lands cleanly after a while', () => {
  const t0 = 10;
  let jumpedAt = null;
  const jumpOnce = (tt, s) => {
    if (jumpedAt === null && s.mode === 'surface' && tt > 1) jumpedAt = tt;
    const held = jumpedAt !== null && tt - jumpedAt < 0.25; // hold Space for a quarter second
    return {
      throttle: 0,
      steer: 0,
      jump: jumpedAt !== null && Math.abs(tt - jumpedAt) < DT / 2,
      jumpHeld: held,
      trick: false,
    };
  };
  const s = spawnOnFace(t0);
  const { out } = simulate(s, t0, 5, jumpOnce);
  const land = out.events.find((e) => e.type === 'land');
  assert.ok(land, 'expected a landing');
  assert.equal(land.clean, true);
  assert.ok(land.air > 0.9 && land.air < 2.2, `air time ${land.air}`);
  assert.equal(out.wipeouts, 0);
});

test('one full spin in the air counts as a spin and lands clean', () => {
  const t0 = 10;
  let phase = 'pre';
  let airAt = 0;
  const script = (tt, s) => {
    if (phase === 'pre' && tt > 2) {
      phase = 'jump';
      return { throttle: 1, steer: 0, jump: true, jumpHeld: true, trick: false };
    }
    if (phase === 'jump' && s.mode === 'air') {
      airAt = tt;
      phase = 'spin';
    }
    if (phase === 'spin') {
      const spinning = tt - airAt < 0.9;
      return { throttle: 0, steer: spinning ? 1 : 0, jump: false, jumpHeld: false, trick: false };
    }
    return IDLE();
  };
  const { out } = simulate(spawnOnFace(t0), t0, 5, script);
  const spins = out.events.filter((e) => e.type === 'spin');
  const land = out.events.find((e) => e.type === 'land');
  assert.equal(spins.length, 1);
  assert.ok(land && land.clean, 'should land clean after a full spin');
});

test('landing sideways is a wipeout', () => {
  const t0 = 10;
  let phase = 'pre';
  let airAt = 0;
  const script = (tt, s) => {
    if (phase === 'pre' && tt > 2) {
      phase = 'jump';
      return { throttle: 1, steer: 0, jump: true, jumpHeld: true, trick: false };
    }
    if (phase === 'jump' && s.mode === 'air') {
      airAt = tt;
      phase = 'spin';
    }
    if (phase === 'spin') {
      return {
        throttle: 0,
        steer: tt - airAt < 0.5 ? 1 : 0,
        jump: false,
        jumpHeld: false,
        trick: false,
      };
    }
    return IDLE();
  };
  const { out } = simulate(spawnOnFace(t0), t0, 5, script);
  const wipe = out.events.find((e) => e.type === 'wipeout');
  assert.ok(wipe && wipe.reason === 'bad landing');
});

test('coasting on the flat bottom of the swell catches you inside', () => {
  const t0 = 10;
  const ph = Ocean.nextCrestPhase(0, 0, t0, 0) + Math.PI; // trough
  const p = Ocean.ridingPoint(0, ph, t0, 0);
  const s = Surfer.create(p.x, p.z, t0);
  s.vz = Ocean.SPEED;
  const { out } = simulate(s, t0, 3, IDLE);
  const wipe = out.events.find((e) => e.type === 'wipeout');
  assert.ok(wipe && wipe.reason === 'caught inside', `got ${wipe && wipe.reason}`);
});

test('wipeout lasts a couple of seconds and then resurfaces', () => {
  const t0 = 10;
  let phase = 'pre';
  let airAt = 0;
  const crash = (tt, s) => {
    if (phase === 'pre' && tt > 2) {
      phase = 'jump';
      return { throttle: 1, steer: 0, jump: true, jumpHeld: true, trick: false };
    }
    if (phase === 'jump' && s.mode === 'air') {
      airAt = tt;
      phase = 'spin';
    }
    if (phase === 'spin') {
      return {
        throttle: 0,
        steer: tt - airAt < 0.5 ? 1 : 0,
        jump: false,
        jumpHeld: false,
        trick: false,
      };
    }
    return IDLE();
  };
  const s = spawnOnFace(t0);
  const { out } = simulate(s, t0, 6, crash);
  assert.ok(out.wipeouts === 1, 'one wipeout from the bad landing');
  assert.equal(out.resurfaces, 1, 'and it resurfaces');
  assert.equal(s.mode, 'surface');
});
