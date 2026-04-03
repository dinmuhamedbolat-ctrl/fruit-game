(function () {
  "use strict";

  var FRUITS = ["apple", "banana", "raspberry", "strawberry"];
  var FRUIT_LABEL = { apple: "Apple", banana: "Banana", raspberry: "Raspberry", strawberry: "Strawberry" };

  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d");

  var hud = document.getElementById("hud");
  var menu = document.getElementById("menu");
  var gameover = document.getElementById("gameover");
  var pauseOverlay = document.getElementById("pauseOverlay");
  var scoreVal = document.getElementById("scoreVal");
  var finalScore = document.getElementById("finalScore");
  var heartsEl = document.getElementById("hearts");
  var comboBadge = document.getElementById("comboBadge");
  var adNote = document.getElementById("adNote");
  var hudHint = document.getElementById("hudHint");

  var btnPlay = document.getElementById("btnPlay");
  var btnSound = document.getElementById("btnSound");
  var btnRetry = document.getElementById("btnRetry");
  var btnMenu = document.getElementById("btnMenu");
  var btnResume = document.getElementById("btnResume");

  var W = 800;
  var H = 600;
  var dpr = 1;

  var state = "menu";
  var score = 0;
  var lives = 5;
  var streak = 0;

  var basketLeft = [0, 0, 0, 0];
  var dragBasketIndex = -1;
  var dragPointerOffset = 0;
  var selectedBasket = 0;
  var railW = 0;
  var slotW = 0;
  var basketY = 0;
  var catchY = 0;
  var missY = 0;

  var items = [];
  var particles = [];
  var shake = 0;
  var shakeTime = 0;

  var slowUntil = 0;
  var magnetUntil = 0;

  var spawnAcc = 0;
  var spawnInterval = 1.1;
  var fallMult = 1;
  var difficultyTimer = 0;
  var DIFFICULTY_MS = 5000;

  var lastT = 0;
  var raf = 0;

  var pointerDown = false;

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function resize() {
    var rect = canvas.getBoundingClientRect();
    W = Math.max(320, rect.width);
    H = Math.max(480, rect.height);
    dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    railW = W * 0.72;
    slotW = railW / 4;
    basketY = H - H * 0.14;
    catchY = basketY - 18;
    missY = H - 24;
    if (state === "playing") {
      for (var bi = 0; bi < 4; bi++) {
        basketLeft[bi] = clamp(basketLeft[bi], minBasketLeft(), maxBasketLeft());
      }
    } else {
      layoutBasketDefaults();
    }
    // #region agent log
    fetch("http://127.0.0.1:7350/ingest/5fb3d396-8933-445b-bea4-5d9ef4df32d5", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e95090" },
      body: JSON.stringify({
        sessionId: "e95090",
        location: "game.js:resize",
        message: "basketLeft after resize",
        data: { basketLeft: basketLeft.slice(), W: W, slotW: slotW, state: state },
        timestamp: Date.now(),
        hypothesisId: "H1",
      }),
    }).catch(function () {});
    // #endregion
  }

  function minBasketLeft() {
    return 16;
  }
  function maxBasketLeft() {
    return W - slotW - 16;
  }

  function layoutBasketDefaults() {
    var gap = 8;
    var total = 4 * slotW + 3 * gap;
    var start = (W - total) / 2;
    for (var i = 0; i < 4; i++) {
      basketLeft[i] = clamp(start + i * (slotW + gap), minBasketLeft(), maxBasketLeft());
    }
  }

  function initHeartsDom() {
    heartsEl.innerHTML = "";
    for (var i = 0; i < 5; i++) {
      var s = document.createElement("span");
      s.className = "heart" + (i < lives ? " on" : "");
      s.textContent = "♥";
      s.setAttribute("aria-hidden", "true");
      heartsEl.appendChild(s);
    }
  }

  function updateHeartsDom() {
    var nodes = heartsEl.querySelectorAll(".heart");
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].classList.toggle("on", i < lives);
    }
  }

  function resetGame() {
    score = 0;
    lives = 5;
    streak = 0;
    items = [];
    particles = [];
    shake = 0;
    slowUntil = 0;
    magnetUntil = 0;
    spawnAcc = 0;
    spawnInterval = 1.15;
    fallMult = 1;
    difficultyTimer = 0;
    layoutBasketDefaults();
    scoreVal.textContent = "0";
    comboBadge.classList.add("hidden");
    initHeartsDom();
  }

  function startPlaying() {
    resetGame();
    state = "playing";
    menu.classList.add("hidden");
    gameover.classList.add("hidden");
    pauseOverlay.classList.add("hidden");
    hud.classList.remove("hidden");
    if (GameAudio) GameAudio.startBgm();
    lastT = performance.now();
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }

  function endGame() {
    state = "gameover";
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    if (GameAudio) {
      GameAudio.stopBgm();
      GameAudio.playGameOver();
    }
    hud.classList.add("hidden");
    gameover.classList.remove("hidden");
    finalScore.textContent = String(score);
    adNote.textContent = "Loading ad…";

    if (globalThis.GameAds && GameAds.showGameOverAd) {
      GameAds.showGameOverAd(function () {
        adNote.textContent = "Thanks for watching!";
      });
    } else {
      adNote.textContent = "Ad SDK not loaded — placeholder.";
    }
  }

  function spawnItem(now) {
    var roll = Math.random();
    var kind = "fruit";
    var bonus = null;

    if (roll < 0.045) {
      kind = "bonus";
      var r2 = Math.random();
      if (r2 < 0.42) bonus = "gold";
      else if (r2 < 0.88) bonus = "magnet";
      else bonus = "heart";
    }

    var x = 40 + Math.random() * (W - 80);
    var fruitType = Math.floor(Math.random() * 4);

    if (kind === "bonus") {
      items.push({
        kind: "bonus",
        bonus: bonus,
        x: x,
        y: -40,
        vy: 120 * fallMult * (0.85 + Math.random() * 0.25),
        r: bonus === "gold" ? 22 : 18,
        caught: false,
        rot: Math.random() * Math.PI * 2,
      });
    } else {
      items.push({
        kind: "fruit",
        fruit: fruitType,
        x: x,
        y: -36,
        vy: 130 * fallMult * (0.9 + Math.random() * 0.3),
        r: 20,
        caught: false,
        rot: Math.random() * Math.PI * 2,
      });
    }
  }

  function basketCenterX(index) {
    return basketLeft[index] + slotW * 0.5;
  }

  function applyMagnet(dt) {
    if (performance.now() > magnetUntil) return;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.caught || it.kind !== "fruit") continue;
      var tx = basketCenterX(it.fruit);
      var k = 2.8 * dt;
      it.x += (tx - it.x) * k;
    }
  }

  function tryCatch(it, now) {
    if (it.caught) return;
    var cy = it.y + it.r;
    if (cy < catchY - 4 || cy > catchY + 36) return;

    if (it.kind === "bonus") {
      var bx = it.x;
      var hitB = -1;
      for (var hb = 0; hb < 4; hb++) {
        if (bx >= basketLeft[hb] && bx <= basketLeft[hb] + slotW) {
          hitB = hb;
          break;
        }
      }
      if (hitB >= 0) {
        var bcx = basketCenterX(hitB);
        if (Math.abs(bx - bcx) < slotW * 0.42) {
          it.caught = true;
          applyBonus(it.bonus);
          splashParticles(bcx, catchY + 8, "#ffd56a");
          if (GameAudio) GameAudio.playBonus(it.bonus);
          // #region agent log
          fetch("http://127.0.0.1:7350/ingest/5fb3d396-8933-445b-bea4-5d9ef4df32d5", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e95090" },
            body: JSON.stringify({
              sessionId: "e95090",
              location: "game.js:tryCatch:bonus",
              message: "bonus caught",
              data: { bx: bx, hitB: hitB, basketLeft: basketLeft.slice() },
              timestamp: Date.now(),
              hypothesisId: "H5",
            }),
          }).catch(function () {});
          // #endregion
        }
      }
      return;
    }

    var idx = it.fruit;
    var cx = basketCenterX(idx);
    if (Math.abs(it.x - cx) < slotW * 0.4) {
      it.caught = true;
      streak++;
      if (streak >= 10) comboBadge.classList.remove("hidden");
      /* Double points after 10 consecutive catches (from 11th fruit onward) */
      var add = 10 * (streak > 10 ? 2 : 1);
      score += add;
      scoreVal.textContent = String(score);
      var colors = ["#e84c3d", "#f4d03f", "#c0399f", "#ff6b8a"];
      splashParticles(cx, catchY + 6, colors[idx]);
      if (GameAudio) GameAudio.playCatch(idx);
      // #region agent log
      fetch("http://127.0.0.1:7350/ingest/5fb3d396-8933-445b-bea4-5d9ef4df32d5", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e95090" },
        body: JSON.stringify({
          sessionId: "e95090",
          location: "game.js:tryCatch:fruit",
          message: "fruit caught",
          data: { idx: idx, cx: cx, itx: it.x, basketLeft: basketLeft.slice() },
          timestamp: Date.now(),
          hypothesisId: "H2",
        }),
      }).catch(function () {});
      // #endregion
    }
  }

  function applyBonus(b) {
    var now = performance.now();
    if (b === "gold") {
      slowUntil = now + 5000;
    } else if (b === "magnet") {
      magnetUntil = now + 3000;
    } else if (b === "heart") {
      if (lives < 5) {
        lives++;
        updateHeartsDom();
      } else {
        score += 25;
        scoreVal.textContent = String(score);
      }
    }
  }

  function missItem(it) {
    if (it.caught) return;
    if (it.kind === "bonus") {
      it.dead = true;
      return;
    }
    it.dead = true;
    lives--;
    streak = 0;
    comboBadge.classList.add("hidden");
    updateHeartsDom();
    shakeTime = 0.45;
    shake = 14;
    if (GameAudio) GameAudio.playHit();
    if (lives <= 0) endGame();
  }

  function splashParticles(x, y, color) {
    var n = 10 + Math.floor(Math.random() * 6);
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = 60 + Math.random() * 120;
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(a) * sp * 0.4,
        vy: Math.sin(a) * sp * 0.35 - 40,
        life: 0.5 + Math.random() * 0.35,
        age: 0,
        color: color,
        size: 2 + Math.random() * 3,
      });
    }
  }

  function updateParticles(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.age += dt;
      p.vy += 420 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.age >= p.life) particles.splice(i, 1);
    }
  }

  function updateItems(dt, now) {
    var slow = now < slowUntil;
    var spd = slow ? 0.38 : 1;

    for (var i = items.length - 1; i >= 0; i--) {
      var it = items[i];
      if (it.caught) {
        items.splice(i, 1);
        continue;
      }
      it.y += it.vy * dt * spd;
      it.rot += dt * 1.2;
      tryCatch(it, now);
      if (it.y > missY) missItem(it);
      if (it.dead) items.splice(i, 1);
    }
  }

  function updateDifficulty(dt) {
    difficultyTimer += dt * 1000;
    if (difficultyTimer >= DIFFICULTY_MS) {
      difficultyTimer -= DIFFICULTY_MS;
      spawnInterval = Math.max(0.35, spawnInterval * 0.92);
      fallMult *= 1.06;
    }
  }

  function updateShake(dt) {
    if (shakeTime > 0) {
      shakeTime -= dt;
      shake = 10 + Math.random() * 8;
      if (shakeTime <= 0) shake = 0;
    } else {
      shake *= Math.pow(0.15, dt * 60);
      if (shake < 0.5) shake = 0;
    }
  }

  function loop(t) {
    if (state !== "playing") return;
    var now = performance.now();
    var dt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t;

    applyMagnet(dt);
    updateItems(dt, now);
    updateParticles(dt);
    updateDifficulty(dt);
    updateShake(dt);

    spawnAcc += dt;
    while (spawnAcc >= spawnInterval) {
      spawnAcc -= spawnInterval;
      spawnItem(now);
    }

    draw(t);
    raf = requestAnimationFrame(loop);
  }

  /* ---------- Drawing — textured procedural art ---------- */

  function drawSky() {
    var g = ctx.createLinearGradient(0, 0, 0, H * 0.55);
    g.addColorStop(0, "#87ceeb");
    g.addColorStop(0.5, "#b8e0f0");
    g.addColorStop(1, "#d4f0e8");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H * 0.55);

    g = ctx.createLinearGradient(0, H * 0.45, 0, H);
    g.addColorStop(0, "#9fd4a8");
    g.addColorStop(0.4, "#6ab06f");
    g.addColorStop(1, "#3d7a45");
    ctx.fillStyle = g;
    ctx.fillRect(0, H * 0.45, W, H * 0.55);
  }

  function drawBushes() {
    var bushY = H * 0.06;
    var w = W / 5;
    for (var i = 0; i < 6; i++) {
      var bx = -w * 0.3 + i * w * 0.95;
      drawBushCluster(bx, bushY, w * 0.9);
    }
  }

  function drawBushCluster(x, y, w) {
    ctx.save();
    for (var j = 0; j < 5; j++) {
      var px = x + (j / 5) * w * 0.7 + Math.sin(j * 1.2) * 8;
      var py = y + j * 3;
      var r = 22 + j * 4;
      var g = ctx.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, "#4a9f55");
      g.addColorStop(0.7, "#2d6b38");
      g.addColorStop(1, "#1a4522");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBasketRail() {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;

    var y0 = basketY;
    var h = 52;
    var labels = ["🍎", "🍌", "🫐", "🍓"];
    var stickerColors = ["#ff6b6b", "#ffe066", "#d896ff", "#ff8fab"];

    for (var i = 0; i < 4; i++) {
      var x0 = basketLeft[i];
      var g = ctx.createLinearGradient(x0, y0, x0 + slotW, y0 + h);
      g.addColorStop(0, "#c4a574");
      g.addColorStop(0.4, "#8b6914");
      g.addColorStop(1, "#5c4510");
      ctx.fillStyle = g;
      ctx.strokeStyle = "#3d2e0a";
      ctx.lineWidth = 2;
      roundRect(ctx, x0 + 4, y0, slotW - 8, h, 10);
      ctx.fill();
      ctx.stroke();

      /* Wicker texture lines */
      ctx.strokeStyle = "rgba(0,0,0,0.15)";
      ctx.lineWidth = 1;
      for (var k = 0; k < 5; k++) {
        ctx.beginPath();
        ctx.moveTo(x0 + 8, y0 + 10 + k * 9);
        ctx.lineTo(x0 + slotW - 8, y0 + 10 + k * 9);
        ctx.stroke();
      }

      /* Sticker */
      var sx = x0 + slotW / 2;
      var sy = y0 + 14;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(-0.08);
      var sg = ctx.createRadialGradient(0, 0, 0, 0, 0, 22);
      sg.addColorStop(0, "#ffffff");
      sg.addColorStop(1, stickerColors[i]);
      ctx.fillStyle = sg;
      roundRect(ctx, -20, -18, 40, 36, 8);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.2)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.font = "22px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(labels[i], 0, 0);
      ctx.restore();

      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.font = "10px Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(FRUIT_LABEL[FRUITS[i]].slice(0, 3), x0 + slotW / 2, y0 + h - 10);

      if (i === selectedBasket) {
        ctx.save();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "rgba(124, 255, 154, 0.95)";
        ctx.lineWidth = 3;
        roundRect(ctx, x0 - 2, y0 - 2, slotW + 4, h + 4, 12);
        ctx.stroke();
        ctx.restore();
      }
    }

    ctx.shadowBlur = 0;
    ctx.restore();
  }

  function roundRect(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      roundRect(this, x, y, w, h, r);
    };
  }

  function drawFruit(it) {
    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.rotate(it.rot);
    var idx = it.fruit;
    if (idx === 0) drawAppleGraphic();
    else if (idx === 1) drawBananaGraphic();
    else if (idx === 2) drawRaspberryGraphic();
    else drawStrawberryGraphic();
    ctx.restore();
  }

  function drawAppleGraphic() {
    var r = 18;
    var g = ctx.createRadialGradient(-5, -5, 2, 0, 0, r);
    g.addColorStop(0, "#ff8a8a");
    g.addColorStop(0.5, "#e74c3c");
    g.addColorStop(1, "#922b21");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2d5016";
    ctx.beginPath();
    ctx.ellipse(-2, -r, 3, 6, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(-6, -6, 8, 0.5, 1.8);
    ctx.stroke();
  }

  function drawBananaGraphic() {
    ctx.strokeStyle = "#f4d03f";
    ctx.lineWidth = 14;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(0, 4, 16, -2.2, 0.5);
    ctx.stroke();
    var g = ctx.createLinearGradient(-10, -10, 10, 10);
    g.addColorStop(0, "#fff3a0");
    g.addColorStop(1, "#d4ac0d");
    ctx.strokeStyle = g;
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.arc(0, 4, 16, -2.2, 0.5);
    ctx.stroke();
  }

  function drawRaspberryGraphic() {
    for (var i = 0; i < 7; i++) {
      var a = (i / 7) * Math.PI * 2;
      var ox = Math.cos(a) * 8;
      var oy = Math.sin(a) * 6 - 2;
      var g = ctx.createRadialGradient(ox, oy, 0, ox, oy, 9);
      g.addColorStop(0, "#e8b0ff");
      g.addColorStop(1, "#8e44ad");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(ox, oy, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#5b2c6f";
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawStrawberryGraphic() {
    var g = ctx.createRadialGradient(-4, -4, 2, 0, 0, 20);
    g.addColorStop(0, "#ffb7c5");
    g.addColorStop(0.6, "#e91e63");
    g.addColorStop(1, "#880e4f");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -16);
    ctx.bezierCurveTo(18, -4, 18, 14, 0, 18);
    ctx.bezierCurveTo(-18, 14, -18, -4, 0, -16);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    for (var i = 0; i < 12; i++) {
      var sx = (i % 4) * 5 - 7;
      var sy = Math.floor(i / 4) * 5 - 4;
      ctx.beginPath();
      ctx.arc(sx, sy, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#2e7d32";
    ctx.beginPath();
    ctx.ellipse(0, -14, 8, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBonus(it) {
    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.rotate(it.rot);
    if (it.bonus === "gold") {
      var g = ctx.createRadialGradient(0, 0, 2, 0, 0, 24);
      g.addColorStop(0, "#fff9c4");
      g.addColorStop(0.4, "#ffd700");
      g.addColorStop(1, "#b8860b");
      ctx.fillStyle = g;
      ctx.shadowColor = "rgba(255,215,0,0.8)";
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.font = "22px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("🍎", 0, 0);
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = "9px sans-serif";
      ctx.fillText("SLOW", 0, 18);
    } else if (it.bonus === "heart") {
      ctx.fillStyle = "#ff5252";
      ctx.beginPath();
      ctx.moveTo(0, 6);
      ctx.bezierCurveTo(-14, -8, -14, -18, 0, -10);
      ctx.bezierCurveTo(14, -18, 14, -8, 0, 6);
      ctx.fill();
      ctx.strokeStyle = "#b71c1c";
      ctx.lineWidth = 1;
      ctx.stroke();
    } else {
      var mg = ctx.createLinearGradient(-16, -16, 16, 16);
      mg.addColorStop(0, "#90caf9");
      mg.addColorStop(1, "#1565c0");
      ctx.fillStyle = mg;
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#0d47a1";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 2;
      for (var i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(-12, i * 6);
        ctx.lineTo(12, i * 6);
        ctx.stroke();
      }
      ctx.fillStyle = "#fff";
      ctx.font = "9px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("MAGNET", 0, 22);
    }
    ctx.restore();
  }

  function drawParticles() {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      var t = p.age / p.life;
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1 - t * 0.5), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawHudOverlay() {
    var now = performance.now();
    if (now < slowUntil) {
      ctx.fillStyle = "rgba(100, 180, 255, 0.12)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 13px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("⏱ Slow time", 12, H - 52);
    }
    if (now < magnetUntil) {
      ctx.strokeStyle = "rgba(100, 200, 255, 0.35)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, Math.min(W, H) * 0.38, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 13px sans-serif";
      ctx.fillText("🧲 Magnet", 12, H - 34);
    }
  }

  function draw(now) {
    ctx.save();
    var sx = (Math.random() - 0.5) * 2 * shake;
    var sy = (Math.random() - 0.5) * 2 * shake;
    ctx.translate(sx, sy);

    drawSky();
    drawBushes();

    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.kind === "fruit") drawFruit(it);
      else drawBonus(it);
    }

    drawBasketRail();
    drawParticles();
    drawHudOverlay();

    ctx.restore();
  }

  /* ---------- Input ---------- */

  function clientToCanvas(clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * W,
      y: ((clientY - rect.top) / rect.height) * H,
    };
  }

  function hitTestBasket(nx, ny) {
    var bh = 52;
    if (ny < basketY || ny > basketY + bh) return -1;
    for (var i = 0; i < 4; i++) {
      if (nx >= basketLeft[i] && nx <= basketLeft[i] + slotW) return i;
    }
    return -1;
  }

  canvas.addEventListener(
    "pointerdown",
    function (e) {
      if (state !== "playing") return;
      var p = clientToCanvas(e.clientX, e.clientY);
      var hb = hitTestBasket(p.x, p.y);
      if (hb >= 0) {
        pointerDown = true;
        dragBasketIndex = hb;
        dragPointerOffset = p.x - basketLeft[hb];
        selectedBasket = hb;
        // #region agent log
        fetch("http://127.0.0.1:7350/ingest/5fb3d396-8933-445b-bea4-5d9ef4df32d5", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e95090" },
          body: JSON.stringify({
            sessionId: "e95090",
            location: "game.js:pointerdown",
            message: "basket drag start",
            data: {
              hb: hb,
              nx: p.x,
              ny: p.y,
              basketY: basketY,
              offset: dragPointerOffset,
              basketLeft: basketLeft.slice(),
            },
            timestamp: Date.now(),
            hypothesisId: "H3",
          }),
        }).catch(function () {});
        // #endregion
        canvas.setPointerCapture(e.pointerId);
      }
    },
    { passive: true }
  );

  canvas.addEventListener(
    "pointermove",
    function (e) {
      if (!pointerDown || dragBasketIndex < 0) return;
      var p = clientToCanvas(e.clientX, e.clientY);
      basketLeft[dragBasketIndex] = clamp(p.x - dragPointerOffset, minBasketLeft(), maxBasketLeft());
    },
    { passive: true }
  );

  canvas.addEventListener(
    "pointerup",
    function () {
      pointerDown = false;
      dragBasketIndex = -1;
    },
    { passive: true }
  );

  canvas.addEventListener(
    "pointercancel",
    function () {
      pointerDown = false;
      dragBasketIndex = -1;
    },
    { passive: true }
  );

  globalThis.addEventListener("keydown", function (e) {
    if (state !== "playing") return;
    var step = 22;
    if (e.key === "1" || e.key === "2" || e.key === "3" || e.key === "4") {
      selectedBasket = parseInt(e.key, 10) - 1;
      e.preventDefault();
      return;
    }
    if (e.key === "ArrowLeft") {
      basketLeft[selectedBasket] = clamp(basketLeft[selectedBasket] - step, minBasketLeft(), maxBasketLeft());
      e.preventDefault();
    } else if (e.key === "ArrowRight") {
      basketLeft[selectedBasket] = clamp(basketLeft[selectedBasket] + step, minBasketLeft(), maxBasketLeft());
      e.preventDefault();
    } else if (e.key === "Escape" || e.key === "p" || e.key === "P") {
      togglePause();
    }
  });

  function togglePause() {
    if (state !== "playing") return;
    if (pauseOverlay.classList.contains("hidden")) {
      pauseOverlay.classList.remove("hidden");
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (GameAudio) GameAudio.stopBgm();
    } else {
      pauseOverlay.classList.add("hidden");
      lastT = performance.now();
      if (GameAudio) GameAudio.startBgm();
      raf = requestAnimationFrame(loop);
    }
  }

  btnPlay.addEventListener("click", function () {
    if (GameAudio) GameAudio.resume();
    startPlaying();
  });

  btnSound.addEventListener("click", function () {
    var on = btnSound.getAttribute("data-on") === "1";
    on = !on;
    btnSound.setAttribute("data-on", on ? "1" : "0");
    btnSound.textContent = on ? "Sound: On" : "Sound: Off";
    if (GameAudio) GameAudio.setEnabled(on);
  });

  btnRetry.addEventListener("click", function () {
    if (GameAudio) GameAudio.resume();
    startPlaying();
  });

  btnMenu.addEventListener("click", function () {
    gameover.classList.add("hidden");
    menu.classList.remove("hidden");
    state = "menu";
    hud.classList.add("hidden");
    if (GameAudio) GameAudio.stopBgm();
    items = [];
    particles = [];
    shake = 0;
    layoutBasketDefaults();
    drawMenuBg();
  });

  btnResume.addEventListener("click", function () {
    pauseOverlay.classList.add("hidden");
    lastT = performance.now();
    if (GameAudio) GameAudio.startBgm();
    raf = requestAnimationFrame(loop);
  });

  resize();
  globalThis.addEventListener("resize", resize);

  /* Initial frame for menu background */
  function drawMenuBg() {
    state = "menu";
    draw(performance.now());
  }
  drawMenuBg();
})();
