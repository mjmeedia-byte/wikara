/*
 * Pixel Surf 64 — surfer physics.
 *
 * Pure state machine (no DOM, no three.js). The surfer is always in one of three modes:
 *   'surface'  riding or paddling on the water surface (snapped to the swell)
 *   'air'      after a jump, ballistic with spin/flip control
 *   'wipeout'  tumbling under the water for a moment, then resurfaces
 *
 * step() returns a list of events (jump, land, spin, flip, wipeout, resurface)
 * so the game can score and play sounds without the physics knowing about either.
 */
var Surfer = (function (Ocean) {
  'use strict';

  var GRAVITY = 9.8; // pull down the face
  var DRAG = 0.25; // water drag (1/s)
  var PADDLE = 3.0; // forward thrust along the board
  var BRAKE = 2.0; // backward thrust along the board
  var TURN_RATE = 2.2; // how fast the board turns (rad/s)
  var MAX_HEADING = 1.75; // the board can only turn about 100 degrees off the swell direction
  var GRIP = 2.5; // how quickly travel direction follows the board
  var BOARD_HEIGHT = 0.25; // board centre above the water
  var AIR_GRAVITY = 12;
  var MAX_SPEED = 16;
  var JUMP_SPEED = 12;
  var AIR_DRAG = 0.05;
  var SPIN_RATE = 7; // rad/s while steering in the air
  var FLIP_RATE = 6; // rad/s while pressing forward/back in the air
  var LAND_TOLERANCE = 0.9; // rad: how close to upright a landing must be
  var WASHOUT_TIME = 1.2; // seconds on the back of a swell before you are washed out
  var WIPEOUT_TIME = 2.2; // seconds spent tumbling before resurfacing
  var CAUGHT_TIME = 1.0; // seconds coasting on the flat bottom of the swell before you are caught inside
  var TWO_PI = 2 * Math.PI;

  function wrap(a) {
    var r = (a + Math.PI) % TWO_PI;
    if (r < 0) r += TWO_PI;
    return r - Math.PI;
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function create(x, z, t) {
    var h = Ocean.height(x, z, t);
    return {
      mode: 'surface',
      x: x,
      y: h + BOARD_HEIGHT,
      z: z,
      h: h, // water height under the board (above mean sea level)
      vx: 0,
      vy: 0,
      vz: 0,
      heading: 0, // direction the board points; 0 = +z (down the line)
      spin: 0, // air spin accumulator (rad)
      flip: 0, // air flip accumulator (rad)
      spinsDone: 0,
      flipsDone: 0,
      airTime: 0,
      jumpCut: false,
      washTimer: 0,
      troughTimer: 0,
      wipeTimer: 0,
      riding: false, // on the front face and moving with it
      lean: 0, // visual carve lean, -1..1
    };
  }

  function wipeout(s, ev, reason) {
    s.mode = 'wipeout';
    s.wipeTimer = 0;
    s.washTimer = 0;
    s.troughTimer = 0;
    s.riding = false;
    ev.push({ type: 'wipeout', reason: reason });
  }

  function jump(s, g, ev) {
    ev.push({ type: 'jump' });
    s.mode = 'air';
    s.airTime = 0;
    s.spin = 0;
    s.flip = 0;
    s.spinsDone = 0;
    s.flipsDone = 0;
    s.jumpCut = false;
    s.riding = false;
    // pop off the face along the surface normal: a lip hit flings you forward and up
    s.vx += g.nx * JUMP_SPEED;
    s.vz += g.nz * JUMP_SPEED;
    s.vy = g.ny * JUMP_SPEED;
  }

  function stepSurface(s, inp, dt, t, ev) {
    var g = Ocean.surface(s.x, s.z, t);

    if (inp.jump) {
      jump(s, g, ev);
      return;
    }

    // Carve: the board turns, and travel direction follows it with some grip.
    s.heading = clamp(s.heading + inp.steer * TURN_RATE * dt, -MAX_HEADING, MAX_HEADING);
    s.lean = clamp(inp.steer, -1, 1);
    var speed = Math.hypot(s.vx, s.vz);
    if (speed > 0.01) {
      var dir = Math.atan2(s.vx, s.vz);
      var nd = dir + wrap(s.heading - dir) * (1 - Math.exp(-GRIP * dt));
      s.vx = Math.sin(nd) * speed;
      s.vz = Math.cos(nd) * speed;
    }

    // Gravity along the face (exact horizontal part of sliding on a surface), paddle or brake.
    var slope2 = 1 + g.sx * g.sx + g.sz * g.sz;
    var ax = (-GRAVITY * g.sx) / slope2;
    var az = (-GRAVITY * g.sz) / slope2;
    var thrust = inp.throttle > 0 ? PADDLE * inp.throttle : BRAKE * inp.throttle;
    ax += Math.sin(s.heading) * thrust;
    az += Math.cos(s.heading) * thrust;

    s.vx += (ax - DRAG * s.vx) * dt;
    s.vz += (az - DRAG * s.vz) * dt;
    var sp2 = Math.hypot(s.vx, s.vz);
    if (sp2 > MAX_SPEED) {
      s.vx *= MAX_SPEED / sp2;
      s.vz *= MAX_SPEED / sp2;
    }
    s.x += s.vx * dt;
    s.z += s.vz * dt;

    // Stay on the water. Sit on the swell's surface at the new position.
    var h = Ocean.height(s.x, s.z, t);
    s.h = h;
    s.y = h + BOARD_HEIGHT;
    s.vy = 0;

    // Ride detection: moving fast while lifted by the swell (above mean water).
    s.riding = h > 0 && Math.hypot(s.vx, s.vz) > 4;

    // Washout: stuck on the back of a swell, being pushed backwards.
    var onBack = g.sz > 0.02 && s.vz < 1.0;
    s.washTimer = onBack ? s.washTimer + dt : 0;
    if (s.washTimer > WASHOUT_TIME) {
      wipeout(s, ev, 'washed out');
      return;
    }

    // Caught inside: coasting along the flat bottom of the swell instead of riding the face.
    var caught = h < -0.6 && Math.abs(g.sz) < 0.08 && Math.hypot(s.vx, s.vz) > 3;
    s.troughTimer = caught ? s.troughTimer + dt : 0;
    if (s.troughTimer > CAUGHT_TIME) {
      wipeout(s, ev, 'caught inside');
    }
  }

  function stepAir(s, inp, dt, t, ev) {
    s.airTime += dt;

    // Steer spins you in the air. Holding the trick button turns forward/back into flips.
    var prevSpins = s.spinsDone;
    var prevFlips = s.flipsDone;
    s.spin += SPIN_RATE * inp.steer * dt;
    s.flip += FLIP_RATE * (inp.trick ? inp.throttle : 0) * dt;
    s.spinsDone = Math.floor(Math.abs(s.spin) / TWO_PI + 1e-9);
    s.flipsDone = Math.floor(Math.abs(s.flip) / TWO_PI + 1e-9);
    if (s.spinsDone > prevSpins) ev.push({ type: 'spin', count: s.spinsDone });
    if (s.flipsDone > prevFlips) ev.push({ type: 'flip', count: s.flipsDone });

    // Let go early to hop lower (a tap still gets most of the height).
    if (!inp.jumpHeld && s.airTime > 0.1 && s.vy > 0 && !s.jumpCut) {
      s.vy *= 0.5;
      s.jumpCut = true;
    }

    s.vy -= AIR_GRAVITY * dt;
    var damp = 1 - AIR_DRAG * dt;
    s.vx *= damp;
    s.vz *= damp;
    s.x += s.vx * dt;
    s.z += s.vz * dt;
    s.y += s.vy * dt;

    // Land when the board reaches the water.
    var h = Ocean.height(s.x, s.z, t);
    if (s.vy < 0 && s.y - BOARD_HEIGHT <= h) {
      var clean =
        Math.abs(wrap(s.spin)) < LAND_TOLERANCE && Math.abs(wrap(s.flip)) < LAND_TOLERANCE;
      s.y = h + BOARD_HEIGHT;
      s.vy = 0;
      if (clean) {
        s.mode = 'surface';
        s.spin = 0;
        s.flip = 0;
        s.heading = clamp(s.heading, -MAX_HEADING, MAX_HEADING);
        ev.push({
          type: 'land',
          clean: true,
          air: s.airTime,
          spins: s.spinsDone,
          flips: s.flipsDone,
        });
      } else {
        ev.push({ type: 'land', clean: false, air: s.airTime });
        wipeout(s, ev, 'bad landing');
      }
    }
  }

  function stepWipeout(s, dt, t, ev) {
    s.wipeTimer += dt;
    var damp = Math.exp(-2 * dt);
    s.vx *= damp;
    s.vz *= damp;
    s.x += s.vx * dt;
    s.z += s.vz * dt;
    // Dip under the water and come back up.
    var f = clamp(s.wipeTimer / WIPEOUT_TIME, 0, 1);
    var h = Ocean.height(s.x, s.z, t);
    s.y = h + BOARD_HEIGHT - 1.6 * Math.sin(f * Math.PI);
    if (s.wipeTimer >= WIPEOUT_TIME) {
      s.mode = 'surface';
      s.vx = 0;
      s.vz = 0;
      s.vy = 0;
      s.y = h + BOARD_HEIGHT;
      s.wipeTimer = 0;
      s.washTimer = 0;
      ev.push({ type: 'resurface' });
    }
  }

  // Advance the surfer by dt seconds at game time t.
  //   input = {throttle, steer, jump, jumpHeld, trick}
  //   throttle: -1..1 (forward/back), steer: -1..1 (+1 turns left, as seen by the rider)
  //   jump: true only on the frame the jump key goes down, jumpHeld: key is held
  //   trick: trick modifier held (in the air, throttle then flips instead of pumping)
  // Returns an array of events.
  function step(s, inp, dt, t) {
    var ev = [];
    if (s.mode === 'air') {
      stepAir(s, inp, dt, t, ev);
    } else if (s.mode === 'wipeout') {
      stepWipeout(s, dt, t, ev);
    } else {
      stepSurface(s, inp, dt, t, ev);
    }
    return ev;
  }

  return {
    BOARD_HEIGHT: BOARD_HEIGHT,
    WASHOUT_TIME: WASHOUT_TIME,
    WIPEOUT_TIME: WIPEOUT_TIME,
    MAX_SPEED: MAX_SPEED,
    create: create,
    step: step,
    wrap: wrap,
  };
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Node test runs only; browsers use the global
})(typeof Ocean !== 'undefined' ? Ocean : require('./ocean.js'));

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Surfer;
}
