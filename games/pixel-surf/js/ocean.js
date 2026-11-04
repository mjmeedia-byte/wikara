/*
 * Pixel Surf 64 — ocean model.
 *
 * Pure math (no DOM, no three.js) so the surf physics can be unit-tested in Node.
 *
 * The swell is a 1-D Gerstner (trochoidal) wave travelling along +z, with its
 * height and sharpness varying slowly along x so the crest has sections and
 * curves. 1 world unit is roughly one metre.
 *
 *   rest point (x, z0)  ->  surface point (x, z0 - shove * sin(theta), amp * cos(theta))
 *   theta = K * z0 - OMEGA * t + warp(x)
 *
 * Because STEEPNESS < 1 the mapping z0 -> z is monotone, so the surface is a
 * proper height field and can be inverted to query height at a world position.
 */
var Ocean = (function () {
  'use strict';

  var WAVELENGTH = 60; // distance between crests
  var K = (2 * Math.PI) / WAVELENGTH; // wave number
  var SPEED = 9; // crest travel speed along +z
  var OMEGA = K * SPEED; // angular frequency (K * SPEED)
  var A_MAX = 2.6; // crest height above mean water on the biggest sets
  var STEEPNESS = 0.93; // K * shove never exceeds this, so the crest never folds

  // Sets: swell builds and fades on a 40 s cycle, never quite flat.
  function setFactor(t) {
    var s = 0.5 + 0.5 * Math.sin((2 * Math.PI * t) / 40);
    return 0.18 + 0.82 * s * s;
  }

  // Peak height changes slowly along the crest (0.6 .. 1.0).
  function sectionFactor(x) {
    return 0.8 + 0.2 * Math.sin(0.031 * x + 1.3);
  }

  function amp(x, t) {
    return A_MAX * setFactor(t) * sectionFactor(x);
  }

  // Bends the crest line so peaks are not perfectly straight.
  function warp(x) {
    return 0.35 * Math.sin(0.043 * x + 0.4);
  }

  function theta(z0, x, t) {
    return K * z0 - OMEGA * t + warp(x);
  }

  // Horizontal shove that sharpens the crest. K * shove <= STEEPNESS always.
  function shove(x, t) {
    return (STEEPNESS * amp(x, t)) / (K * A_MAX);
  }

  // Surface point for a rest coordinate z0. Used directly by the renderer.
  function surfaceAtRest(x, z0, t) {
    var th = theta(z0, x, t);
    return {
      x: x,
      y: amp(x, t) * Math.cos(th),
      z: z0 - shove(x, t) * Math.sin(th),
      theta: th,
    };
  }

  // Invert z = z0 - shove * sin(theta(z0)) by bisection (monotone, so it always converges).
  function restZ(x, z, t) {
    var d = shove(x, t);
    var lo = z - d - 1;
    var hi = z + d + 1;
    for (var i = 0; i < 44; i++) {
      var mid = 0.5 * (lo + hi);
      if (mid - d * Math.sin(theta(mid, x, t)) - z > 0) {
        hi = mid;
      } else {
        lo = mid;
      }
    }
    return 0.5 * (lo + hi);
  }

  // Height of the water surface above mean sea level at a world position.
  function height(x, z, t) {
    var z0 = restZ(x, z, t);
    return amp(x, t) * Math.cos(theta(z0, x, t));
  }

  // Height, slopes and unit normal of the surface at a world position.
  function surface(x, z, t) {
    var e = 0.05;
    var sx = (height(x + e, z, t) - height(x - e, z, t)) / (2 * e);
    var sz = (height(x, z + e, t) - height(x, z - e, t)) / (2 * e);
    var inv = 1 / Math.sqrt(1 + sx * sx + sz * sz);
    return {
      h: height(x, z, t),
      sx: sx,
      sz: sz,
      nx: -sx * inv,
      ny: inv,
      nz: -sz * inv,
    };
  }

  // A point that rides with the swell: fixed wave phase `phase` (radians) at lateral x.
  // Front face of a crest is phase in (0, PI); lip is near 0.
  function ridingPoint(x, phase, t, lift) {
    var z0 = (phase + OMEGA * t - warp(x)) / K;
    var s = surfaceAtRest(x, z0, t);
    return { x: x, y: s.y + (lift || 0), z: s.z };
  }

  // Phase of the first crest that lies beyond world z (plus margin), at lateral x.
  function nextCrestPhase(x, z, t, margin) {
    var zTarget = z + (margin || 0);
    var n = Math.ceil((zTarget * K - OMEGA * t + warp(x)) / (2 * Math.PI));
    return 2 * Math.PI * n;
  }

  // Phase of the nearest crest at or behind world z (the swell a surfer at z is riding).
  function prevCrestPhase(x, z, t) {
    var n = Math.floor((z * K - OMEGA * t + warp(x)) / (2 * Math.PI));
    return 2 * Math.PI * n;
  }

  return {
    WAVELENGTH: WAVELENGTH,
    K: K,
    SPEED: SPEED,
    A_MAX: A_MAX,
    setFactor: setFactor,
    amp: amp,
    warp: warp,
    theta: theta,
    shove: shove,
    surfaceAtRest: surfaceAtRest,
    height: height,
    surface: surface,
    ridingPoint: ridingPoint,
    nextCrestPhase: nextCrestPhase,
    prevCrestPhase: prevCrestPhase,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Ocean;
}
