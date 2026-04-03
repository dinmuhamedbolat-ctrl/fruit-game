/**
 * Cheerful procedural BGM + SFX via Web Audio API (no external files).
 */
(function (global) {
  "use strict";

  var ctx = null;
  var master = null;
  var bgmGain = null;
  var sfxGain = null;
  var bgmOsc = [];
  var bgmInterval = null;
  var enabled = true;

  function getCtx() {
    if (!ctx) {
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      bgmGain = ctx.createGain();
      bgmGain.gain.value = 0.12;
      bgmGain.connect(master);
      sfxGain = ctx.createGain();
      sfxGain.gain.value = 0.45;
      sfxGain.connect(master);
    }
    return ctx;
  }

  function resume() {
    var c = getCtx();
    if (c && c.state === "suspended") c.resume();
  }

  function stopBgm() {
    if (bgmInterval) {
      clearInterval(bgmInterval);
      bgmInterval = null;
    }
    bgmOsc.forEach(function (o) {
      try {
        o.stop();
      } catch (e) {}
    });
    bgmOsc = [];
  }

  /** Simple happy arpeggio + soft pad */
  function startBgm() {
    if (!enabled) return;
    var c = getCtx();
    if (!c) return;
    resume();
    stopBgm();

    var pad = c.createOscillator();
    var padG = c.createGain();
    pad.type = "sine";
    pad.frequency.value = 196;
    pad.connect(padG);
    padG.gain.value = 0.04;
    padG.connect(bgmGain);
    pad.start();
    bgmOsc.push(pad);

    var pad2 = c.createOscillator();
    var padG2 = c.createGain();
    pad2.type = "triangle";
    pad2.frequency.value = 246.94;
    pad2.connect(padG2);
    padG2.gain.value = 0.03;
    padG2.connect(bgmGain);
    pad2.start();
    bgmOsc.push(pad2);

    var notes = [261.63, 293.66, 329.63, 349.23, 392, 349.23, 329.63, 293.66];
    var i = 0;
    bgmInterval = setInterval(function () {
      if (!enabled) return;
      playTone(notes[i % notes.length], 0.08, 0.15, "sine", bgmGain);
      i++;
    }, 280);
  }

  function playTone(freq, vol, dur, type, destGain) {
    var c = getCtx();
    if (!c || !enabled) return;
    var g = destGain || sfxGain;
    var o = c.createOscillator();
    var gn = c.createGain();
    o.type = type || "sine";
    o.frequency.value = freq;
    o.connect(gn);
    gn.connect(g);
    var t = c.currentTime;
    gn.gain.setValueAtTime(0, t);
    gn.gain.linearRampToValueAtTime(vol, t + 0.02);
    gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** Different catch sounds per fruit index 0..3 */
  function playCatch(fruitIndex) {
    if (!enabled) return;
    resume();
    var base = [330, 392, 440, 523][fruitIndex % 4];
    playTone(base, 0.2, 0.12, "triangle");
    playTone(base * 1.5, 0.08, 0.08, "sine");
  }

  function playBonus(type) {
    if (!enabled) return;
    resume();
    if (type === "gold") {
      playTone(523, 0.15, 0.2, "sine");
      setTimeout(function () {
        playTone(659, 0.12, 0.2, "sine");
      }, 80);
    } else if (type === "heart") {
      playTone(440, 0.18, 0.15, "triangle");
      playTone(554, 0.15, 0.2, "triangle");
    } else if (type === "magnet") {
      playTone(220, 0.12, 0.1, "square");
      playTone(330, 0.15, 0.15, "square");
    }
  }

  function playHit() {
    if (!enabled) return;
    resume();
    playTone(150, 0.25, 0.2, "sawtooth");
    playTone(100, 0.15, 0.25, "sine");
  }

  function playGameOver() {
    if (!enabled) return;
    resume();
    [196, 174.61, 155.56].forEach(function (f, j) {
      setTimeout(function () {
        playTone(f, 0.2, 0.35, "triangle");
      }, j * 120);
    });
  }

  function setEnabled(on) {
    enabled = !!on;
    if (!enabled) stopBgm();
  }

  global.GameAudio = {
    startBgm: startBgm,
    stopBgm: stopBgm,
    playCatch: playCatch,
    playBonus: playBonus,
    playHit: playHit,
    playGameOver: playGameOver,
    setEnabled: setEnabled,
    resume: resume,
  };
})(typeof window !== "undefined" ? window : globalThis);
