/*
 * Pixel Surf 64 — chiptune sound effects, synthesised with WebAudio (no audio files).
 * Browsers only allow audio after a user gesture, so call Sfx.unlock() from a key/click handler.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- used by game.js (classic script global)
var Sfx = (function () {
  'use strict';

  var ctx = null;
  var master = null;
  var muted = false;

  function unlock() {
    try {
      if (!ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.18;
        master.connect(ctx.destination);
      }
      if (ctx.state === 'suspended') ctx.resume();
    } catch {
      ctx = null;
    }
  }

  function tone(freq, dur, type, vol, slideTo, delay) {
    if (!ctx || muted) return;
    var start = ctx.currentTime + (delay || 0);
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
    gain.gain.setValueAtTime(vol, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  function noise(dur, vol) {
    if (!ctx || muted) return;
    var len = Math.floor(ctx.sampleRate * dur);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = ctx.createBufferSource();
    var gain = ctx.createGain();
    gain.gain.value = vol;
    src.buffer = buf;
    src.connect(gain);
    gain.connect(master);
    src.start();
  }

  var sounds = {
    jump: function () {
      tone(300, 0.18, 'square', 0.35, 900);
    },
    land: function () {
      tone(180, 0.08, 'triangle', 0.5, 90);
    },
    coin: function () {
      tone(988, 0.07, 'square', 0.3);
      tone(1319, 0.14, 'square', 0.3, null, 0.07);
    },
    trick: function () {
      tone(660, 0.1, 'triangle', 0.4);
      tone(990, 0.16, 'triangle', 0.4, null, 0.09);
    },
    star: function () {
      [523, 659, 784, 1047].forEach(function (f, i) {
        tone(f, 0.16, 'square', 0.3, null, i * 0.08);
      });
    },
    wipeout: function () {
      tone(440, 0.6, 'sawtooth', 0.25, 60);
      noise(0.5, 0.25);
    },
    splash: function () {
      noise(0.25, 0.18);
    },
    spray: function () {
      noise(0.05, 0.03);
    },
  };

  function play(name) {
    if (sounds[name]) sounds[name]();
  }

  function setMuted(m) {
    muted = !!m;
    if (master) master.gain.value = muted ? 0 : 0.18;
  }

  return { unlock: unlock, play: play, setMuted: setMuted };
})();
