/*
 * Pixel Surf 64 — three.js scene: pixel-res renderer, ocean mesh, sky, islands, surfer model,
 * coins, stars, particles and the camera rig. Visual only; all gameplay lives in surfer.js/game.js.
 * Requires: three.js r128 (global THREE) and ocean.js (global Ocean).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- used by game.js (classic script global)
var Scene3D = (function () {
  'use strict';

  var PIXEL_ROWS = 240; // internal render height, N64-ish; the canvas is scaled up with no smoothing
  var SKY = 0x86d6ff;
  var GRID = 160; // ocean vertices per side
  var SPACING = 1.5; // distance between ocean vertices
  var HALF = ((GRID - 1) * SPACING) / 2;
  var ISLAND_PERIOD = 800;
  var PAL = [0x0a3d73, 0x0f5f9a, 0x1686bf, 0x33b0d8, 0x8fe3ee, 0xf6feff]; // deep .. foam
  var PAL_RGB = PAL.map(function (c) {
    var col = new THREE.Color(c);
    return [col.r, col.g, col.b];
  });

  var renderer = null;
  var scene = null;
  var camera = null;
  var sun = null;
  var ocean = null; // {geo, pos, col, mesh}
  var clouds = [];
  var islands = [];
  var surfer = null;
  var particles = null;
  var mats = {};
  var geos = {};
  var coinTemplate = null;
  var starTemplate = null;
  var stars = [];

  function wrapAround(v, centre, period) {
    var d = v - centre;
    d -= period * Math.round(d / period);
    return centre + d;
  }

  function smooth(a, b, x) {
    var t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  function box(w, h, d, colour) {
    var key = w + 'x' + h + 'x' + d;
    if (!geos[key]) geos[key] = new THREE.BoxGeometry(w, h, d);
    var mat = mats[colour] || (mats[colour] = new THREE.MeshLambertMaterial({ color: colour }));
    return new THREE.Mesh(geos[key], mat);
  }

  function at(mesh, x, y, z) {
    mesh.position.set(x, y, z);
    return mesh;
  }

  // ---------- ocean ----------
  function buildOcean() {
    var n = GRID * GRID;
    var pos = new Float32Array(n * 3);
    var col = new Float32Array(n * 3);
    var idx = new Uint32Array((GRID - 1) * (GRID - 1) * 6);
    var k = 0;
    for (var j = 0; j < GRID - 1; j++) {
      for (var i = 0; i < GRID - 1; i++) {
        var a = j * GRID + i;
        var b = a + 1;
        var c = a + GRID;
        var d = c + 1;
        idx[k++] = a;
        idx[k++] = c;
        idx[k++] = b;
        idx[k++] = b;
        idx[k++] = c;
        idx[k++] = d;
      }
    }
    var geo = new THREE.BufferGeometry();
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    var mesh = new THREE.Mesh(
      geo,
      new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    );
    mesh.frustumCulled = false;
    scene.add(mesh);
    ocean = { geo: geo, pos: pos, col: col, mesh: mesh };
  }

  // Re-centre the grid on the surfer and re-evaluate the swell at every vertex.
  // Vertices are placed by the same closed-form mapping the physics uses, so the
  // board sits exactly on the rendered surface.
  function updateOcean(cx, cz, t) {
    var ox = Math.round(cx / SPACING) * SPACING - HALF;
    var oz = Math.round(cz / SPACING) * SPACING - HALF;
    var pos = ocean.pos;
    var col = ocean.col;
    var amp = Ocean.A_MAX;
    for (var j = 0; j < GRID; j++) {
      for (var i = 0; i < GRID; i++) {
        var x = ox + i * SPACING;
        var z0 = oz + j * SPACING;
        var s = Ocean.surfaceAtRest(x, z0, t);
        // Calm the swell toward the edge of the grid so it blends into the far water.
        var dist = Math.max(Math.abs(x - cx), Math.abs(z0 - cz)) / HALF;
        var f = 1 - smooth(0.55, 1.0, dist);
        var y = s.y * f;
        var zz = z0 + (s.z - z0) * f;
        var p = (j * GRID + i) * 3;
        pos[p] = x;
        pos[p + 1] = y;
        pos[p + 2] = zz;

        // Palette band: low and steep water is dark, lifted face is light, crest foams.
        var lift = (y + amp) / (2 * amp);
        var steep = Math.abs(Math.sin(s.theta));
        var band = Math.min(4, Math.floor((0.6 * lift + 0.5 * steep) * 5));
        if (Math.cos(s.theta) > 0.955 && Math.abs(s.y) > 0.45 * amp) band = 5;
        if (f < 1) band = Math.min(band, Math.floor(f * 4));
        var rgb = PAL_RGB[Math.max(0, band)];
        col[p] = rgb[0];
        col[p + 1] = rgb[1];
        col[p + 2] = rgb[2];
      }
    }
    ocean.geo.attributes.position.needsUpdate = true;
    ocean.geo.attributes.color.needsUpdate = true;
    ocean.geo.computeVertexNormals();
  }

  // ---------- sky, sun, clouds ----------
  function buildSky() {
    scene.background = new THREE.Color(SKY);
    scene.fog = new THREE.Fog(SKY, 60, 280);

    var c = document.createElement('canvas');
    c.width = c.height = 16;
    var g = c.getContext('2d');
    g.fillStyle = '#fff3a6';
    for (var y = 0; y < 16; y++) {
      for (var x = 0; x < 16; x++) {
        var dx = x - 7.5;
        var dy = y - 7.5;
        if (dx * dx + dy * dy < 56) g.fillRect(x, y, 1, 1);
      }
    }
    var tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, fog: false, depthWrite: false }));
    sun.scale.set(60, 60, 1);
    scene.add(sun);
  }

  function buildClouds() {
    var seed = 7;
    function rnd() {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    }
    for (var n = 0; n < 16; n++) {
      var group = new THREE.Group();
      var puffs = 4 + Math.floor(rnd() * 3);
      for (var p = 0; p < puffs; p++) {
        var w = 5 + rnd() * 7;
        var h = 2.5 + rnd() * 2;
        var m = box(w, h, w * 0.8, p % 2 ? 0xdfeffb : 0xffffff);
        m.position.set((p - puffs / 2) * 4 + rnd() * 2, rnd() * 1.5, rnd() * 3 - 1.5);
        group.add(m);
      }
      group.userData.baseX = rnd() * 800 - 400;
      group.userData.baseZ = rnd() * 800 - 400;
      group.userData.y = 55 + rnd() * 30;
      scene.add(group);
      clouds.push(group);
    }
  }

  // ---------- islands with palm trees (static decoration, wrapped around the surfer) ----------
  function buildIslands() {
    var seed = 99;
    function rnd() {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    }
    for (var n = 0; n < 12; n++) {
      var g = new THREE.Group();
      var r = 16 + rnd() * 10;
      var sand = new THREE.Mesh(
        new THREE.CylinderGeometry(r, r + 2, 4.5, 10),
        new THREE.MeshLambertMaterial({ color: 0xf2d38b }),
      );
      sand.position.y = 0.5;
      g.add(sand);
      var palms = 2 + Math.floor(rnd() * 3);
      for (var p = 0; p < palms; p++) {
        var px = (rnd() - 0.5) * r;
        var pz = (rnd() - 0.5) * r;
        var trunk = box(0.8, 9, 0.8, 0x9b6a3c);
        trunk.position.set(px, 5, pz);
        trunk.rotation.z = (rnd() - 0.5) * 0.3;
        g.add(trunk);
        for (var l = 0; l < 6; l++) {
          var leaf = box(4.5, 0.25, 1.4, 0x2fae5a);
          leaf.position.set(px, 9.5, pz);
          leaf.rotation.set(0.5, (l / 6) * Math.PI * 2, 0.25);
          leaf.translateX(2.1);
          g.add(leaf);
        }
      }
      var side = n % 2 ? 1 : -1;
      g.userData.x = side * (170 + rnd() * 160);
      g.userData.baseZ = rnd() * ISLAND_PERIOD;
      scene.add(g);
      islands.push(g);
    }
  }

  // ---------- surfer: a blocky, Mario-cap surfer on a yellow board ----------
  function buildSurfer() {
    var root = new THREE.Group();
    var body = new THREE.Group();
    root.add(body);

    var board = box(1.0, 0.12, 2.5, 0xffd23f);
    body.add(board);
    body.add(at(box(0.2, 0.14, 2.2, 0xe8413a), 0, 0.12, 0));
    body.add(at(box(0.24, 0.12, 0.5, 0x222222), 0, -0.12, -0.9));

    var legL = at(box(0.3, 0.8, 0.3, 0x2b4fc7), -0.22, 0.46, 0);
    var legR = at(box(0.3, 0.8, 0.3, 0x2b4fc7), 0.22, 0.46, 0);
    body.add(legL, legR);

    var torso = new THREE.Group();
    torso.position.y = 1.26;
    torso.add(box(0.7, 0.8, 0.42, 0xe8413a));
    torso.add(at(box(0.72, 0.12, 0.44, 0xffffff), 0, 0.05, 0));
    body.add(torso);

    var head = at(box(0.5, 0.5, 0.5, 0xf5c09a), 0, 1.91, 0);
    body.add(head);
    body.add(at(box(0.52, 0.3, 0.14, 0x5a3a1e), 0, 1.97, -0.26)); // hair at the back
    body.add(at(box(0.06, 0.08, 0.02, 0x111111), -0.12, 1.95, 0.26));
    body.add(at(box(0.06, 0.08, 0.02, 0x111111), 0.12, 1.95, 0.26));
    body.add(at(box(0.54, 0.14, 0.54, 0xe8413a), 0, 2.2, 0));
    body.add(at(box(0.3, 0.06, 0.24, 0xe8413a), 0, 2.16, 0.36));

    function arm(x) {
      var pivot = new THREE.Group();
      pivot.position.set(x, 1.5, 0);
      pivot.add(at(box(0.22, 0.7, 0.22, 0xf5c09a), 0, -0.35, 0));
      body.add(pivot);
      return pivot;
    }
    var armL = arm(-0.5);
    var armR = arm(0.5);

    surfer = {
      root: root,
      body: body,
      torso: torso,
      legL: legL,
      legR: legR,
      armL: armL,
      armR: armR,
    };
    scene.add(root);
  }

  // Orient the surfer so the board lies on the surface, nose along the travel direction.
  function setSurferBasis(nx, ny, nz, fx, fz) {
    var up = new THREE.Vector3(nx, ny, nz).normalize();
    var fwd = new THREE.Vector3(fx, 0, fz);
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, 1);
    fwd.normalize();
    var right = new THREE.Vector3().crossVectors(up, fwd).normalize();
    fwd.crossVectors(right, up).normalize();
    surfer.root.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, fwd));
  }

  function poseSurfer(v, t) {
    var root = surfer.root;
    var body = surfer.body;
    var lean = v.lean || 0;
    body.rotation.set(0, 0, 0);
    body.position.y = 0;
    if (v.mode === 'air') {
      // Spin and flip with the physics accumulators; arms up.
      root.quaternion.identity();
      root.rotation.set(v.flip || 0, v.yaw + (v.spin || 0), 0, 'YXZ');
      surfer.armL.rotation.set(0, 0, -2.4);
      surfer.armR.rotation.set(0, 0, 2.4);
      surfer.legL.position.y = 0.66;
      surfer.legR.position.y = 0.66;
    } else if (v.mode === 'wipeout') {
      root.rotation.set(t * 5, t * 3.5, t * 4);
      surfer.armL.rotation.set(0, 0, -1.9 + Math.sin(t * 20) * 0.6);
      surfer.armR.rotation.set(0, 0, 1.9 + Math.cos(t * 19) * 0.6);
      surfer.legL.position.y = 0.46;
      surfer.legR.position.y = 0.46;
    } else {
      setSurferBasis(v.nx, v.ny, v.nz, v.dirX, v.dirZ);
      // Carving lean, a little bob, arms out for balance.
      body.rotation.z = -lean * 0.3;
      var bob = Math.sin(t * 7) * 0.03;
      body.position.y = bob + (v.riding ? -0.05 : 0);
      surfer.armL.rotation.set(0, 0, -1.0 - lean * 0.3);
      surfer.armR.rotation.set(0, 0, 1.0 - lean * 0.3);
      surfer.legL.position.y = 0.46;
      surfer.legR.position.y = 0.46;
    }
    surfer.torso.rotation.z = (v.mode === 'air' ? 0.15 : 0) - lean * 0.1;
    root.position.set(v.x, v.y, v.z);
  }

  // ---------- coins, stars, particles ----------
  function buildCoinTemplate() {
    var geo = new THREE.CylinderGeometry(0.55, 0.55, 0.14, 10);
    geo.rotateX(Math.PI / 2);
    coinTemplate = {
      geo: geo,
      mat: new THREE.MeshLambertMaterial({ color: 0xffd23f, emissive: 0x6b4a00 }),
    };
  }

  function buildStarTemplate() {
    var shape = new THREE.Shape();
    for (var i = 0; i < 10; i++) {
      var r = i % 2 ? 0.45 : 1.1;
      var a = Math.PI / 2 + (i * Math.PI) / 5;
      if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    var geo = new THREE.ExtrudeGeometry(shape, { depth: 0.35, bevelEnabled: false });
    geo.center();
    starTemplate = {
      geo: geo,
      mat: new THREE.MeshLambertMaterial({ color: 0xfff04a, emissive: 0x7a6a00 }),
    };
  }

  function buildParticles() {
    var max = 320;
    var geo = new THREE.BufferGeometry();
    var pos = new Float32Array(max * 3);
    var col = new Float32Array(max * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    var mat = new THREE.PointsMaterial({
      vertexColors: true,
      size: 2.5,
      sizeAttenuation: false,
    });
    var points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    scene.add(points);
    particles = {
      points: points,
      pos: pos,
      col: col,
      vel: new Float32Array(max * 3),
      life: new Float32Array(max),
      max: max,
      next: 0,
    };
  }

  var BURST_COLOURS = {
    spray: [1, 1, 1],
    sparkle: [1, 0.85, 0.2],
    splash: [0.7, 0.95, 1],
  };

  function burst(x, y, z, kind, count, speed) {
    var pt = particles;
    var c = BURST_COLOURS[kind] || [1, 1, 1];
    for (var n = 0; n < count; n++) {
      var i = pt.next;
      pt.next = (pt.next + 1) % pt.max;
      var p = i * 3;
      pt.pos[p] = x;
      pt.pos[p + 1] = y;
      pt.pos[p + 2] = z;
      var a = Math.random() * Math.PI * 2;
      var s = speed * (0.4 + Math.random() * 0.8);
      pt.vel[p] = Math.cos(a) * s;
      pt.vel[p + 1] = (0.6 + Math.random()) * s;
      pt.vel[p + 2] = Math.sin(a) * s;
      pt.col[p] = c[0];
      pt.col[p + 1] = c[1];
      pt.col[p + 2] = c[2];
      pt.life[i] = 0.5 + Math.random() * 0.4;
    }
  }

  function updateParticles(dt) {
    var pt = particles;
    for (var i = 0; i < pt.max; i++) {
      var p = i * 3;
      if (pt.life[i] > 0) {
        pt.life[i] -= dt;
        pt.vel[p + 1] -= 14 * dt;
        pt.pos[p] += pt.vel[p] * dt;
        pt.pos[p + 1] += pt.vel[p + 1] * dt;
        pt.pos[p + 2] += pt.vel[p + 2] * dt;
        if (pt.life[i] <= 0) pt.pos[p + 1] = -9999;
      }
    }
    pt.points.geometry.attributes.position.needsUpdate = true;
    pt.points.geometry.attributes.color.needsUpdate = true;
  }

  // Coins and stars are created by the game and handed to the scene.
  function makeCoin() {
    return new THREE.Mesh(coinTemplate.geo, coinTemplate.mat);
  }

  function addObject(obj) {
    scene.add(obj);
    return obj;
  }

  function removeObject(obj) {
    scene.remove(obj);
  }

  function spawnStar(x, y, z) {
    var mesh = new THREE.Mesh(starTemplate.geo, starTemplate.mat);
    mesh.position.set(x, y, z);
    mesh.scale.set(1.5, 1.5, 1.5);
    scene.add(mesh);
    stars.push({ mesh: mesh, age: 0, x: x, y: y, z: z });
    return mesh;
  }

  function updateStars(dt) {
    for (var i = stars.length - 1; i >= 0; i--) {
      var st = stars[i];
      st.age += dt;
      st.mesh.rotation.y += dt * 4;
      st.mesh.position.y = st.y + Math.min(st.age, 3) * 4;
      if (st.age > 3) {
        scene.remove(st.mesh);
        stars.splice(i, 1);
      }
    }
  }

  // ---------- setup ----------
  function init(canvas) {
    renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: false,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(1);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.3, 600);

    // Total light stays near 1.0 so the palette does not clip to white.
    scene.add(new THREE.HemisphereLight(0xdff6ff, 0x3a6f8a, 0.55));
    var sunLight = new THREE.DirectionalLight(0xfff4d6, 0.45);
    sunLight.position.set(0.4, 1, 0.6);
    scene.add(sunLight);
    var fill = new THREE.DirectionalLight(0xbfe6ff, 0.25); // soft light from the camera side
    fill.position.set(-0.3, 0.6, -1);
    scene.add(fill);

    buildSky();
    buildOcean();
    buildClouds();
    buildIslands();
    buildSurfer();
    buildCoinTemplate();
    buildStarTemplate();
    buildParticles();
  }

  function resize(width, height) {
    var rows = PIXEL_ROWS;
    var cols = Math.max(320, Math.round((rows * width) / Math.max(1, height)));
    renderer.setSize(cols, rows, false);
    camera.aspect = cols / rows;
    camera.updateProjectionMatrix();
  }

  return {
    init: init,
    resize: resize,
    // Per-frame update. v = {x,y,z,nx,ny,nz,dirX,dirZ,yaw,spin,flip,mode,lean,riding,speed}
    // cam = {yaw, pitch, dist, fov}; t = game time (s); dt = frame time (s)
    frame: function (v, cam, t, dt) {
      updateOcean(v.x, v.z, t);
      poseSurfer(v, t);
      updateParticles(dt);
      updateStars(dt);

      for (var c = 0; c < clouds.length; c++) {
        var cl = clouds[c];
        cl.userData.baseX += dt * 2;
        cl.position.set(
          wrapAround(cl.userData.baseX, v.x, 800),
          cl.userData.y,
          wrapAround(cl.userData.baseZ, v.z, 800),
        );
      }
      for (var k = 0; k < islands.length; k++) {
        var isl = islands[k];
        isl.position.set(isl.userData.x, 0, wrapAround(isl.userData.baseZ, v.z, ISLAND_PERIOD));
      }
      sun.position.set(v.x + 150, 130, v.z + 260);

      // Camera: Mario 64 style follow with orbit.
      var target = { x: v.x, y: v.y + 1.8, z: v.z };
      var cp = Math.cos(cam.pitch);
      camera.position.set(
        target.x - Math.sin(cam.yaw) * cp * cam.dist,
        target.y + Math.sin(cam.pitch) * cam.dist,
        target.z - Math.cos(cam.yaw) * cp * cam.dist,
      );
      if (camera.position.y < 2) camera.position.y = 2;
      camera.lookAt(target.x, target.y, target.z);
      if (camera.fov !== cam.fov) {
        camera.fov = cam.fov;
        camera.updateProjectionMatrix();
      }

      renderer.render(scene, camera);
    },
    // World-space helpers for the game
    makeCoin: makeCoin,
    addObject: addObject,
    removeObject: removeObject,
    spawnStar: spawnStar,
    burst: burst,
    PIXEL_ROWS: PIXEL_ROWS,
  };
})();
