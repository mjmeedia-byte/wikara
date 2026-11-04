/*
 * Pixel Surf 64 — game loop, input, scoring, stars, coins, camera and HUD.
 * Requires: THREE (vendor), Ocean (ocean.js), Surfer (surfer.js), Sfx (sfx.js), Scene3D (scene.js).
 */
(function () {
  'use strict';

  var STEP = 1 / 120; // physics step (s)
  var BEST_KEY = 'pixel-surf-64:best';
  var PREVENT = { Space: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, ShiftLeft: 1 };

  // Mario 64-style stars: one per milestone.
  var STAR_DEFS = [
    {
      id: 'first',
      name: 'FIRST RIDE',
      ok: function (g) {
        return g.maxStreak >= 5;
      },
    },
    {
      id: 'coins',
      name: 'COIN HUNTER',
      ok: function (g) {
        return g.coins >= 10;
      },
    },
    {
      id: 'sky',
      name: 'SKY HIGH',
      ok: function (g) {
        return !!g.flags.sky;
      },
    },
    {
      id: 'double',
      name: 'DOUBLE SPIN',
      ok: function (g) {
        return !!g.flags.double;
      },
    },
    {
      id: 'long',
      name: 'LONG LINE',
      ok: function (g) {
        return g.distance >= 300;
      },
    },
    {
      id: 'big',
      name: 'BIG WAVE',
      ok: function (g) {
        return g.bigRide >= 3;
      },
    },
  ];

  function $(id) {
    return document.getElementById(id);
  }
  var el = {
    score: $('score'),
    best: $('best'),
    coins: $('coins'),
    stars: $('stars'),
    combo: $('combo'),
    speed: $('speed'),
    wave: $('wave'),
    msg: $('msg'),
    banner: $('banner'),
    title: $('title'),
    pause: $('pause'),
    hint: $('hint'),
    bestTitle: $('best-title'),
    mute: $('mute'),
  };

  function clampN(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }
  function wrapAngle(a) {
    return Math.atan2(Math.sin(a), Math.cos(a));
  }
  function pad(n, width) {
    var s = String(Math.max(0, Math.round(n)));
    while (s.length < width) s = '0' + s;
    return s;
  }
  function loadBest() {
    try {
      return parseInt(window.localStorage.getItem(BEST_KEY), 10) || 0;
    } catch {
      return 0;
    }
  }
  function saveBest(v) {
    try {
      window.localStorage.setItem(BEST_KEY, String(v));
    } catch {
      /* storage can be unavailable (private mode); the best score just won't persist */
    }
  }

  // ---------- state ----------
  var keys = {};
  var jumpQueued = false;
  var padPrevA = false;
  var padPrevStart = false;
  var padCamX = 0;
  var dragging = false;
  var muted = false;

  var game = {
    mode: 'title', // 'title' (demo ride behind the menu) | 'play' | 'paused'
    t: 0,
    acc: 0,
    surfer: null,
    score: 0,
    best: loadBest(),
    coins: 0,
    streak: 0, // seconds of unbroken riding right now
    maxStreak: 0,
    combo: 1,
    distance: 0,
    bigRide: 0,
    flags: {},
    stars: {},
    starCount: 0,
    coinList: [],
    nextCoinAt: 0,
    msgTimer: 0,
    bannerTimer: 0,
    frame: 0,
  };

  var cam = { yaw: 0, yawReady: false, orbit: 0, pitch: 0.2, zoom: 0, dist: 10, fov: 60 };

  // ---------- world helpers ----------
  function spawnPoint(t) {
    var ph = Ocean.nextCrestPhase(0, 0, t, 0) + 0.6; // steep part of the front face of the next swell
    return Ocean.ridingPoint(0, ph, t, 0);
  }

  function clearCoins() {
    for (var i = 0; i < game.coinList.length; i++) {
      if (game.coinList[i].mesh) Scene3D.removeObject(game.coinList[i].mesh);
    }
    game.coinList = [];
  }

  function resetGame(t) {
    clearCoins();
    var p = spawnPoint(t);
    game.surfer = Surfer.create(p.x, p.z, t);
    game.surfer.vz = Ocean.SPEED;
    game.score = 0;
    game.coins = 0;
    game.streak = 0;
    game.maxStreak = 0;
    game.combo = 1;
    game.distance = 0;
    game.bigRide = 0;
    game.flags = {};
    game.stars = {};
    game.starCount = 0;
    game.nextCoinAt = t + 0.5;
  }

  function startGame() {
    resetGame(game.t);
    game.mode = 'play';
    el.title.classList.remove('show');
    el.pause.classList.remove('show');
    el.hint.classList.add('show');
    setTimeout(function () {
      el.hint.classList.remove('show');
    }, 9000);
  }

  function togglePause() {
    if (game.mode === 'play') {
      game.mode = 'paused';
      el.pause.classList.add('show');
      saveBest(Math.max(game.best, game.score));
    } else if (game.mode === 'paused') {
      game.mode = 'play';
      el.pause.classList.remove('show');
    }
  }

  function addScore(n) {
    game.score += n;
    if (game.score > game.best) game.best = game.score;
  }

  function flash(text) {
    el.msg.textContent = text;
    el.msg.classList.remove('show');
    void el.msg.offsetWidth; // restart the CSS animation
    el.msg.classList.add('show');
    game.msgTimer = 1.6;
  }

  function banner(text) {
    el.banner.textContent = text;
    el.banner.classList.remove('show');
    void el.banner.offsetWidth;
    el.banner.classList.add('show');
    game.bannerTimer = 2.8;
  }

  // ---------- coins: lines that ride the swell, like Mario's coin trails ----------
  function spawnCoinLine(t) {
    var s = game.surfer;
    var x = s.x + (Math.random() * 12 - 6);
    // Coins go on the swell the surfer is riding now, so they can actually be reached.
    var crest = Ocean.prevCrestPhase(x, s.z, t);
    var list = [];
    if (Math.random() < 0.35) {
      // an arc over the lip: climb to the lip (brake) and jump for these
      for (var j = 0; j < 4; j++) list.push({ phase: crest - 0.3 + j * 0.1, lift: 2.6 });
    } else {
      // a line along the face: ride for these
      for (var i = 0; i < 6; i++) list.push({ phase: crest + 0.3 + i * 0.2, lift: 0.9 });
    }
    for (var k = 0; k < list.length; k++) {
      var c = {
        x: x,
        phase: list[k].phase,
        lift: list[k].lift,
        seed: Math.random() * 6,
        dead: false,
      };
      c.mesh = Scene3D.addObject(Scene3D.makeCoin());
      game.coinList.push(c);
    }
  }

  function updateCoins(t) {
    var s = game.surfer;
    var alive = 0;
    for (var i = 0; i < game.coinList.length; i++) {
      var c = game.coinList[i];
      if (c.dead) continue;
      alive++;
      var p = Ocean.ridingPoint(c.x, c.phase, t, c.lift);
      var dx = p.x - s.x;
      var dy = p.y - (s.y + 0.4);
      var dz = p.z - s.z;
      if (game.mode === 'play' && s.mode !== 'wipeout' && dx * dx + dy * dy + dz * dz < 1.8) {
        c.dead = true;
        alive--;
        game.coins++;
        addScore(100);
        Scene3D.burst(p.x, p.y, p.z, 'sparkle', 12, 4);
        Sfx.play('coin');
        Scene3D.removeObject(c.mesh);
        c.mesh = null;
      } else if (p.z < s.z - 90) {
        c.dead = true;
        Scene3D.removeObject(c.mesh);
        c.mesh = null;
      }
    }
    if (game.mode === 'play' && game.t >= game.nextCoinAt && alive < 36) {
      spawnCoinLine(t);
      game.nextCoinAt = t + 2.2 + Math.random() * 1.5;
    }
    if (game.coinList.length > 120) {
      game.coinList = game.coinList.filter(function (c) {
        return !c.dead;
      });
    }
  }

  function placeCoinMeshes(t) {
    for (var i = 0; i < game.coinList.length; i++) {
      var c = game.coinList[i];
      if (c.dead || !c.mesh) continue;
      var p = Ocean.ridingPoint(c.x, c.phase, t, c.lift);
      c.mesh.position.set(p.x, p.y, p.z);
      c.mesh.rotation.y = t * 3 + c.seed;
    }
  }

  // ---------- events from the surfer physics ----------
  function handleEvents(ev) {
    var s = game.surfer;
    for (var i = 0; i < ev.length; i++) {
      var e = ev[i];
      if (e.type === 'jump') {
        Sfx.play('jump');
        Scene3D.burst(s.x, s.y - 0.2, s.z, 'spray', 14, 3);
      } else if (e.type === 'spin') {
        addScore(300 * game.combo);
        flash(e.count * 360 + '!  +' + 300 * game.combo);
        Sfx.play('trick');
      } else if (e.type === 'flip') {
        addScore(400 * game.combo);
        flash('BACKFLIP!  +' + 400 * game.combo);
        Sfx.play('trick');
      } else if (e.type === 'land') {
        if (e.clean) {
          Sfx.play('land');
          Scene3D.burst(s.x, s.y - 0.2, s.z, 'spray', 18, 4);
          if (e.air >= 1.6) game.flags.sky = true;
          if (e.spins >= 2) game.flags.double = true;
          if (e.spins + e.flips === 0) {
            addScore(50);
            flash('NICE LANDING');
          }
        } else {
          flash('BAD LANDING');
        }
      } else if (e.type === 'wipeout') {
        game.streak = 0;
        game.combo = 1;
        flash('WIPEOUT!  ' + e.reason.toUpperCase());
        Sfx.play('wipeout');
        Scene3D.burst(s.x, s.y, s.z, 'splash', 36, 6);
        saveBest(game.best);
      } else if (e.type === 'resurface') {
        Scene3D.burst(s.x, s.y, s.z, 'splash', 10, 3);
        Sfx.play('splash');
      }
    }
  }

  // ---------- per-step scoring ----------
  function updateScoring(dt) {
    var s = game.surfer;
    var speed = Math.hypot(s.vx, s.vz);
    if (s.mode === 'surface' && s.riding) {
      game.streak += dt;
      game.maxStreak = Math.max(game.maxStreak, game.streak);
      game.combo = Math.min(5, 1 + Math.floor(game.streak / 4));
      game.distance += speed * dt;
      addScore(dt * speed * 2 * game.combo);
      if (s.h > 0.7 * Ocean.A_MAX) game.bigRide += dt;
    } else {
      game.streak = Math.max(0, game.streak - dt * 0.5);
      game.combo = Math.min(5, 1 + Math.floor(game.streak / 4));
    }
    // spray off the tail when going fast on the wave
    if (s.mode === 'surface' && speed > 6 && game.frame % 3 === 0) {
      var dirX = Math.sin(s.heading);
      var dirZ = Math.cos(s.heading);
      Scene3D.burst(s.x - dirX * 1.2, s.y + 0.1, s.z - dirZ * 1.2, 'spray', 2, 2.5);
    }
  }

  function checkStars() {
    var s = game.surfer;
    for (var i = 0; i < STAR_DEFS.length; i++) {
      var d = STAR_DEFS[i];
      if (!game.stars[d.id] && d.ok(game)) {
        game.stars[d.id] = true;
        game.starCount++;
        banner('STAR GET!  ' + d.name);
        Sfx.play('star');
        Scene3D.spawnStar(s.x, s.y + 2, s.z);
      }
    }
  }

  // ---------- input ----------
  function pollGamepad() {
    var out = { steer: 0, throttle: 0, jumpHeld: false, jumpPressed: false, trick: false, camX: 0 };
    var pads = navigator.getGamepads ? navigator.getGamepads() : [];
    var pad = null;
    for (var i = 0; i < pads.length; i++) {
      if (pads[i]) {
        pad = pads[i];
        break;
      }
    }
    if (!pad) return out;
    var dz = function (v) {
      return Math.abs(v) < 0.2 ? 0 : v;
    };
    out.steer = -dz(pad.axes[0] || 0); // stick left = turn left
    out.throttle = -dz(pad.axes[1] || 0); // stick up = forward
    out.camX = dz(pad.axes[2] || 0);
    var a = !!(pad.buttons[0] && pad.buttons[0].pressed);
    out.jumpHeld = a;
    out.jumpPressed = a && !padPrevA;
    padPrevA = a;
    out.trick = !!(pad.buttons[5] && pad.buttons[5].pressed);
    var start = !!(pad.buttons[9] && pad.buttons[9].pressed);
    if (start && !padPrevStart) onStartPressed();
    padPrevStart = start;
    padCamX = out.camX;
    return out;
  }

  function onStartPressed() {
    if (game.mode === 'title') startGame();
    else togglePause();
  }

  function readInput() {
    var gp = pollGamepad();
    var steer = (keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0);
    var throttle = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    var jump = jumpQueued || gp.jumpPressed;
    jumpQueued = false;
    return {
      steer: clampN(steer + gp.steer, -1, 1),
      throttle: clampN(throttle + gp.throttle, -1, 1),
      jump: jump,
      jumpHeld: !!keys.Space || gp.jumpHeld,
      trick: !!(keys.ShiftLeft || keys.ShiftRight) || gp.trick,
    };
  }

  var IDLE = { steer: 0, throttle: 0, jump: false, jumpHeld: false, trick: false };

  window.addEventListener('keydown', function (e) {
    if (PREVENT[e.code]) e.preventDefault();
    if (e.repeat) return;
    keys[e.code] = true;
    Sfx.unlock();
    switch (e.code) {
      case 'Space':
      case 'Enter':
        if (game.mode === 'title') startGame();
        else if (game.mode === 'paused') togglePause();
        else jumpQueued = true;
        break;
      case 'KeyP':
      case 'Escape':
        togglePause();
        break;
      case 'KeyR':
        if (game.mode !== 'title') startGame();
        break;
      case 'KeyM':
        muted = !muted;
        Sfx.setMuted(muted);
        el.mute.textContent = muted ? 'SOUND OFF' : 'SOUND ON';
        break;
      case 'KeyC':
        cam.orbit = 0;
        cam.zoom = 0;
        break;
    }
  });

  window.addEventListener('keyup', function (e) {
    keys[e.code] = false;
  });

  window.addEventListener('blur', function () {
    keys = {};
    jumpQueued = false;
    dragging = false;
  });

  var canvas = $('view');
  canvas.addEventListener('pointerdown', function (e) {
    dragging = true;
    Sfx.unlock();
    if (e.target.setPointerCapture) e.target.setPointerCapture(e.pointerId);
  });
  window.addEventListener('pointerup', function () {
    dragging = false;
  });
  window.addEventListener('pointermove', function (e) {
    if (dragging) cam.orbit -= e.movementX * 0.006;
  });
  canvas.addEventListener(
    'wheel',
    function (e) {
      cam.zoom = clampN(cam.zoom + e.deltaY * 0.01, -4, 8);
      e.preventDefault();
    },
    { passive: false },
  );

  el.mute.addEventListener('click', function () {
    muted = !muted;
    Sfx.setMuted(muted);
    el.mute.textContent = muted ? 'SOUND OFF' : 'SOUND ON';
  });

  // ---------- simulation ----------
  function simStep(dt) {
    // Always poll input so a gamepad Start press can begin a game from the title screen.
    var inp = readInput();
    if (game.mode === 'title') inp = IDLE;
    game.t += dt;
    var ev = Surfer.step(game.surfer, inp, dt, game.t);
    if (game.mode === 'play') {
      handleEvents(ev);
      updateScoring(dt);
      checkStars();
    } else if (game.mode === 'title') {
      // demo ride behind the title screen: no scoring, wipeouts just reset the demo
      for (var i = 0; i < ev.length; i++) {
        if (ev[i].type === 'wipeout') Sfx.play('wipeout');
      }
    }
    updateCoins(game.t);
  }

  // ---------- camera ----------
  function updateCamera(dt) {
    var s = game.surfer;
    var speed = Math.hypot(s.vx, s.vz);
    var orbitIn = (keys.KeyQ ? 1 : 0) - (keys.KeyE ? 1 : 0) + padCamX;
    cam.orbit += orbitIn * dt * 2.4;

    var target = s.heading + cam.orbit;
    if (!cam.yawReady) {
      cam.yaw = target;
      cam.yawReady = true;
    }
    cam.yaw += wrapAngle(target - cam.yaw) * (1 - Math.exp(-3.5 * dt));

    var wantDist = clampN(10 + speed * 0.12 + cam.zoom, 7, 16);
    cam.dist += (wantDist - cam.dist) * (1 - Math.exp(-4 * dt));
    var wantFov = 60 + clampN(speed - 8, 0, 8) * 0.8;
    cam.fov += (wantFov - cam.fov) * (1 - Math.exp(-3 * dt));
  }

  function buildView() {
    var s = game.surfer;
    var g = Ocean.surface(s.x, s.z, game.t);
    return {
      x: s.x,
      y: s.y,
      z: s.z,
      nx: g.nx,
      ny: g.ny,
      nz: g.nz,
      dirX: Math.sin(s.heading),
      dirZ: Math.cos(s.heading),
      yaw: s.heading,
      spin: s.spin,
      flip: s.flip,
      mode: s.mode,
      lean: s.lean || 0,
      riding: s.riding,
      speed: Math.hypot(s.vx, s.vz),
    };
  }

  // ---------- HUD ----------
  function updateHud(dt) {
    var s = game.surfer;
    var speed = Math.hypot(s.vx, s.vz);
    el.score.textContent = pad(game.score, 6);
    el.best.textContent = pad(Math.max(game.best, game.score), 6);
    el.coins.textContent = pad(game.coins, 3);
    el.stars.textContent = game.starCount + '/' + STAR_DEFS.length;
    el.combo.textContent = 'x' + game.combo;
    el.speed.textContent = Math.round(speed * 3.6) + ' KM/H';
    el.wave.textContent = Math.round(2 * Ocean.amp(s.x, game.t) * 3.28) + ' FT';
    el.bestTitle.textContent = 'BEST ' + pad(game.best, 6);
    game.msgTimer = Math.max(0, game.msgTimer - dt);
    if (game.msgTimer === 0) el.msg.classList.remove('show');
    game.bannerTimer = Math.max(0, game.bannerTimer - dt);
    if (game.bannerTimer === 0) el.banner.classList.remove('show');
  }

  // ---------- main loop ----------
  var last = 0;
  function loop(now) {
    var dt = Math.min(0.1, (now - last) / 1000 || 0);
    last = now;
    game.frame++;

    if (game.mode !== 'paused') {
      game.acc += dt;
      while (game.acc >= STEP) {
        simStep(STEP);
        game.acc -= STEP;
      }
    }

    updateCamera(dt);
    placeCoinMeshes(game.t);
    Scene3D.frame(
      buildView(),
      { yaw: cam.yaw, pitch: cam.pitch, dist: cam.dist, fov: cam.fov },
      game.t,
      dt,
    );
    updateHud(dt);
    window.requestAnimationFrame(loop);
  }

  // ---------- boot ----------
  function boot() {
    Scene3D.init(canvas);
    Scene3D.resize(window.innerWidth, window.innerHeight);
    window.addEventListener('resize', function () {
      Scene3D.resize(window.innerWidth, window.innerHeight);
    });
    resetGame(0);
    game.mode = 'title';
    el.title.classList.add('show');
    el.bestTitle.textContent = 'BEST ' + pad(game.best, 6);
    el.mute.textContent = 'SOUND ON';
    window.requestAnimationFrame(function (now) {
      last = now;
      loop(now);
    });
  }

  boot();

  // Test hook: lets automated checks read the game state without touching the DOM.
  window.PixelSurf = {
    state: game,
    cam: cam,
    startGame: startGame,
    togglePause: togglePause,
  };
})();
