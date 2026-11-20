/* CINE — moteur de cinématiques de llmms ia (canvas 2D, plein écran, musique générée).
   Utilisation :
   CINE.play({
     music: "synthwave" | "epic" | "tension" | "chill" | "none",
     grade: "#ff6a3d",            // teinte globale (facultatif)
     shots: [
       { dur: 5, scene: { sky: "sunset", sun: true, ocean: true, city: true, palms: true, neon: "#ff2d95" },
         cam: { from: [0, 0, 1], to: [120, -20, 1.25] }, title: "VICE BEACH", sub: "Chapitre 1", text: "Il était une fois…", fx: "flash" },
       { dur: 4, draw: (ctx, t, W, H, p) => { ... } }   // plan dessiné à la main (p = progression 0→1)
     ]
   });
   Décors : sky ("day"|"sunset"|"night"|"storm"|"dawn"), sun, moon, stars, clouds, mountains, city, neon, palms, ocean, road, cars,
            rain, snow, fireflies, fog, sea:"#..." etc.  cam = [x, y, zoom] au début et à la fin du plan (x,y en pixels du décor 1600×900).
   fx : "flash" | "fade" | "cut" | "shake" | "glitch" (transition au début du plan). */
(function () {
  const W0 = 1600, H0 = 900;
  const cv = document.createElement("canvas"); cv.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;display:block;background:#000";
  const ctx = cv.getContext("2d");
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const rnd = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(1234567);
  const R = (a, b) => a + rnd() * (b - a);
  let W = 0, H = 0, dpr = 1;
  function size() { dpr = Math.min(2, window.devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; }
  // ---- éléments générés une fois (positions stables)
  const BUILD = [[], [], []], PALMS = [], CLOUDS = [], STARS = [], DROPS = [], FLIES = [];
  for (let l = 0; l < 3; l++) { let x = -300; while (x < W0 + 600) { const w = R(50, 130) * (1 + l * .25), h = R(120, 380) * (1 - l * .22) + (l === 0 ? 80 : 0); BUILD[l].push({ x, w, h, win: [] }); x += w + R(4, 18); } }
  BUILD.forEach(L => L.forEach(b => { for (let i = 0; i < 40; i++) b.win.push([rnd(), rnd(), rnd() < .45]); }));
  for (let i = 0; i < 9; i++) PALMS.push({ x: R(-200, W0 + 200), h: R(160, 320), lean: R(-.35, .35), s: R(.7, 1.25) });
  for (let i = 0; i < 14; i++) CLOUDS.push({ x: R(-300, W0 + 300), y: R(40, 330), w: R(180, 420), s: R(.2, .8) });
  for (let i = 0; i < 260; i++) STARS.push([R(-200, W0 + 200), R(0, H0 * .6), R(.4, 1.8), R(0, 6.28)]);
  for (let i = 0; i < 380; i++) DROPS.push([R(0, 1), R(0, 1), R(.6, 1.4)]);
  for (let i = 0; i < 60; i++) FLIES.push([R(0, W0), R(H0 * .4, H0), R(0, 6.28)]);
  const SKY = {
    day: ["#2f80ed", "#8ec5ff", "#dff1ff"], sunset: ["#1a1446", "#b23a6f", "#ff8a3d", "#ffd27a"], night: ["#02030a", "#0b1238", "#1d2a63"],
    storm: ["#0d1117", "#2a323e", "#4b5563"], dawn: ["#203a72", "#e17a9b", "#ffcf9f"]
  };
  function sky(c, s, t) {
    const cols = SKY[s.sky] || SKY.sunset, g = c.createLinearGradient(0, 0, 0, H0 * .75);
    cols.forEach((col, i) => g.addColorStop(i / (cols.length - 1), col)); c.fillStyle = g; c.fillRect(-W0, -H0, W0 * 3, H0 * 3);
    if (s.stars || s.sky === "night") STARS.forEach(([x, y, r, ph]) => { c.globalAlpha = .4 + .6 * Math.abs(Math.sin(t * 1.3 + ph)); c.fillStyle = "#fff"; c.fillRect(x, y, r, r); });
    c.globalAlpha = 1;
    if (s.sun || (s.sun !== false && (s.sky === "sunset" || s.sky === "dawn"))) {
      const sx = s.sunX ?? W0 * .5, sy = s.sunY ?? H0 * .52, rr = s.sky === "day" ? 70 : 150;
      const hg = c.createRadialGradient(sx, sy, 0, sx, sy, rr * 3.2); hg.addColorStop(0, "rgba(255,220,150,.55)"); hg.addColorStop(1, "rgba(255,120,80,0)"); c.fillStyle = hg; c.fillRect(sx - rr * 4, sy - rr * 4, rr * 8, rr * 8);
      const sg = c.createLinearGradient(0, sy - rr, 0, sy + rr); sg.addColorStop(0, "#fff3b0"); sg.addColorStop(1, s.sky === "day" ? "#fff6c9" : "#ff4f7b"); c.fillStyle = sg; c.beginPath(); c.arc(sx, sy, rr, 0, 7); c.fill();
      if (s.sky === "sunset") { c.fillStyle = SKY.sunset[1]; for (let i = 0; i < 7; i++) c.fillRect(sx - rr, sy + i * 18 + 8, rr * 2, 3 + i * 1.6); }
    }
    if (s.moon || (s.moon !== false && s.sky === "night")) { const mx = W0 * .78, my = 160; c.fillStyle = "rgba(200,220,255,.18)"; c.beginPath(); c.arc(mx, my, 110, 0, 7); c.fill(); c.fillStyle = "#e9efff"; c.beginPath(); c.arc(mx, my, 55, 0, 7); c.fill(); }
    if (s.clouds || s.sky === "storm") CLOUDS.forEach(cl => { const x = ((cl.x + t * 12 * cl.s) % (W0 + 800)) - 400; c.fillStyle = s.sky === "storm" ? "rgba(30,36,46,.85)" : s.sky === "day" ? "rgba(255,255,255,.85)" : "rgba(255,170,190,.35)"; for (let k = 0; k < 5; k++) { c.beginPath(); c.ellipse(x + k * cl.w / 5, cl.y + Math.sin(k) * 12, cl.w / 3.4, 26 + k % 2 * 10, 0, 0, 7); c.fill(); } });
    if (s.sky === "storm" && Math.sin(t * 2.3) > .985) { c.fillStyle = "rgba(220,230,255,.6)"; c.fillRect(-W0, -H0, W0 * 3, H0 * 3); }
  }
  function mountains(c, s) { [["#2b1d4a", .62, 160], ["#1a1233", .7, 120]].forEach(([col, base, amp], k) => { c.fillStyle = s.sky === "day" ? ["#5b7fa6", "#3f5f86"][k] : col; c.beginPath(); c.moveTo(-400, H0); for (let x = -400; x <= W0 + 400; x += 60) c.lineTo(x, H0 * base - Math.abs(Math.sin(x * .004 + k)) * amp - Math.sin(x * .013) * 30); c.lineTo(W0 + 400, H0); c.fill(); }); }
  function city(c, s, t) {
    const night = s.sky !== "day", neon = s.neon || "#ff2d95";
    BUILD.forEach((L, l) => { const base = H0 * (.74 - l * .03) + l * 6; L.slice().forEach(b => {
      const x = b.x, y = base - b.h; c.fillStyle = night ? ["#0b0820", "#140d33", "#1f1647"][2 - l] : ["#5a6b85", "#6f819b", "#8798b2"][2 - l]; c.fillRect(x, y, b.w, b.h + 200);
      if (night && l > 0) b.win.forEach(([u, v, on]) => { if (!on) return; c.fillStyle = v > .7 ? neon : "rgba(255,214,140,.85)"; c.globalAlpha = .55 + .45 * Math.sin(t * 2 + u * 40); c.fillRect(x + 6 + u * (b.w - 16), y + 10 + v * (b.h - 20), 5, 7); });
      c.globalAlpha = 1;
      if (night && l === 2 && b.h > 260) { c.shadowColor = neon; c.shadowBlur = 18; c.fillStyle = neon; c.fillRect(x + 6, y + 14, b.w - 12, 4); c.shadowBlur = 0; }
    }); });
  }
  function ocean(c, s, t) {
    const y0 = H0 * .74, g = c.createLinearGradient(0, y0, 0, H0); const col = s.sea || (s.sky === "day" ? "#1f7fd1" : s.sky === "night" ? "#060b26" : "#3a1d55");
    g.addColorStop(0, col); g.addColorStop(1, "#05040d"); c.fillStyle = g; c.fillRect(-W0, y0, W0 * 3, H0);
    c.strokeStyle = s.sky === "sunset" ? "rgba(255,170,120,.55)" : "rgba(200,220,255,.35)"; c.lineWidth = 2;
    for (let i = 0; i < 26; i++) { const y = y0 + 6 + i * i * .55, w = 80 + i * 18, x = W0 * .5 + Math.sin(t * 1.5 + i) * 30; c.globalAlpha = 1 - i / 28; c.beginPath(); c.moveTo(x - w, y); c.lineTo(x + w, y); c.stroke(); }
    c.globalAlpha = 1;
  }
  function road(c, s, t) {
    const hz = H0 * .7, cx = W0 / 2; c.fillStyle = "#0d0d14"; c.beginPath(); c.moveTo(cx - 40, hz); c.lineTo(cx + 40, hz); c.lineTo(cx + 900, H0); c.lineTo(cx - 900, H0); c.fill();
    c.strokeStyle = s.neon || "#ff2d95"; c.lineWidth = 3; c.shadowColor = c.strokeStyle; c.shadowBlur = 12; c.beginPath(); c.moveTo(cx - 40, hz); c.lineTo(cx - 900, H0); c.moveTo(cx + 40, hz); c.lineTo(cx + 900, H0); c.stroke(); c.shadowBlur = 0;
    c.fillStyle = "#ffd76a"; for (let i = 0; i < 12; i++) { const k = ((i / 12 + t * .6) % 1), y = hz + (H0 - hz) * k * k, w = 4 + k * 22, h = 6 + k * 50; c.fillRect(cx - w / 2, y, w, h); }
    if (s.cars !== false) for (let i = 0; i < 4; i++) { const k = ((i / 4 + t * .25) % 1), y = hz + (H0 - hz) * k * k, x = cx + (i % 2 ? 1 : -1) * (60 + k * 380); c.fillStyle = i % 2 ? "rgba(255,60,60,.9)" : "rgba(255,250,220,.95)"; c.shadowColor = c.fillStyle; c.shadowBlur = 20; c.fillRect(x - 8 - k * 20, y, 6 + k * 10, 3 + k * 6); c.fillRect(x + 4 + k * 10, y, 6 + k * 10, 3 + k * 6); c.shadowBlur = 0; }
  }
  function palm(c, p, t, col) {
    const bx = p.x, by = H0 * .86, top = [bx + p.lean * p.h, by - p.h]; c.strokeStyle = col; c.lineWidth = 12 * p.s; c.lineCap = "round";
    c.beginPath(); c.moveTo(bx, by); c.quadraticCurveTo(bx + p.lean * p.h * .3, by - p.h * .6, top[0], top[1]); c.stroke();
    c.fillStyle = col; for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + (i - 3) * .55 + Math.sin(t * 1.2 + i) * .06, L = 120 * p.s; c.beginPath(); c.moveTo(top[0], top[1]);
      c.quadraticCurveTo(top[0] + Math.cos(a) * L * .6, top[1] + Math.sin(a) * L * .6 - 30, top[0] + Math.cos(a) * L, top[1] + Math.sin(a) * L + 40); c.quadraticCurveTo(top[0] + Math.cos(a) * L * .5, top[1] + Math.sin(a) * L * .5 - 4, top[0], top[1]); c.fill(); }
  }
  function weather(c, s, t) {
    if (s.rain || s.sky === "storm") { c.strokeStyle = "rgba(190,210,255,.35)"; c.lineWidth = 1.5; c.beginPath(); DROPS.forEach(([u, v, sp]) => { const y = ((v + t * sp * 1.4) % 1) * H0, x = u * W0 + (y * .15); c.moveTo(x, y); c.lineTo(x - 6, y + 22); }); c.stroke(); }
    if (s.snow) { c.fillStyle = "rgba(255,255,255,.85)"; DROPS.forEach(([u, v, sp]) => { const y = ((v + t * sp * .15) % 1) * H0, x = u * W0 + Math.sin(t + v * 9) * 20; c.fillRect(x, y, 3, 3); }); }
    if (s.fireflies) FLIES.forEach(([x, y, ph]) => { c.fillStyle = `rgba(255,240,150,${.4 + .6 * Math.abs(Math.sin(t * 2 + ph))})`; c.beginPath(); c.arc(x + Math.sin(t + ph) * 20, y + Math.cos(t * .8 + ph) * 15, 2.5, 0, 7); c.fill(); });
    if (s.fog) { const g = c.createLinearGradient(0, H0 * .5, 0, H0); g.addColorStop(0, "rgba(200,210,230,0)"); g.addColorStop(1, "rgba(200,210,230,.45)"); c.fillStyle = g; c.fillRect(-W0, 0, W0 * 3, H0 * 2); }
  }
  function scene(c, s, t, camx) {
    const layer = (k, fn) => { c.save(); c.translate(-camx * k, 0); fn(); c.restore(); };
    layer(.1, () => sky(c, s, t));
    if (s.mountains) layer(.3, () => mountains(c, s));
    if (s.city) layer(.55, () => city(c, s, t));
    if (s.ocean) layer(.7, () => ocean(c, s, t));
    if (s.road) layer(.85, () => road(c, s, t));
    if (s.palms) layer(1.15, () => PALMS.forEach(p => palm(c, p, t, s.sky === "day" ? "#123a2a" : "#07050f")));
    layer(1, () => weather(c, s, t));
  }
  // ---- musique générée
  let AC = null;
  function music(kind, total) {
    if (!kind || kind === "none") return;
    try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
    const now = AC.currentTime + .05, bpm = { synthwave: 100, epic: 84, tension: 70, chill: 80 }[kind] || 96, beat = 60 / bpm;
    const master = AC.createGain(); master.gain.value = .5; master.connect(AC.destination);
    const prog = { synthwave: [45, 41, 43, 40], epic: [38, 41, 36, 43], tension: [40, 41, 40, 39], chill: [48, 45, 41, 43] }[kind] || [45, 41, 43, 40];
    const note = (f, t0, d, type, v, dest = master) => { const o = AC.createOscillator(), g = AC.createGain(); o.type = type; o.frequency.value = f; g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(v, t0 + .02); g.gain.exponentialRampToValueAtTime(.0001, t0 + d); o.connect(g).connect(dest); o.start(t0); o.stop(t0 + d + .05); };
    const hz = m => 440 * Math.pow(2, (m - 69) / 12);
    const bars = Math.ceil(total / (beat * 4));
    for (let b = 0; b < bars; b++) {
      const root = prog[b % prog.length], t0 = now + b * beat * 4;
      [0, 7, 12, 16].forEach(iv => note(hz(root + 12 + iv), t0, beat * 4, "sawtooth", kind === "tension" ? .018 : .03));
      for (let i = 0; i < 8; i++) note(hz(root), t0 + i * beat / 2, beat / 2.2, "square", .05);
      if (kind !== "chill") for (let i = 0; i < 4; i++) { const k = t0 + i * beat; note(55, k, .25, "sine", i % 2 ? .0 : .5); if (i % 2) note(180, k, .12, "triangle", .12); }
    }
  }
  // ---- lecture
  function play(cfg) {
    const shots = (cfg.shots || []).filter(Boolean); if (!shots.length) return;
    document.body.style.margin = "0"; document.body.style.background = "#000"; document.body.appendChild(cv); size(); addEventListener("resize", size);
    const total = shots.reduce((a, s) => a + (s.dur || 4), 0);
    const btn = document.createElement("button"); btn.textContent = "▶ Lancer la cinématique"; btn.style.cssText = "position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:3;font:700 20px system-ui;padding:16px 28px;border-radius:14px;border:0;background:#fff;color:#000;cursor:pointer";
    document.body.appendChild(btn);
    let t0 = null;
    const start = () => { btn.remove(); t0 = performance.now(); music(cfg.music || "synthwave", total + 2); };
    btn.onclick = start; setTimeout(() => { if (!t0) start(); }, 2500);
    function frame(now) {
      requestAnimationFrame(frame);
      try {
        const T = t0 ? (now - t0) / 1000 : 0; let acc = 0, i = 0; while (i < shots.length - 1 && T > acc + (shots[i].dur || 4)) { acc += shots[i].dur || 4; i++; }
        const sh = shots[i], d = sh.dur || 4, p = Math.min(1, Math.max(0, (T - acc) / d)), e = ease(p), lt = T - acc;
        const cam = sh.cam || { from: [0, 0, 1], to: [60, 0, 1.08] }, [x0, y0, z0] = cam.from || [0, 0, 1], [x1, y1, z1] = cam.to || cam.from || [0, 0, 1];
        const cx = x0 + (x1 - x0) * e, cy = y0 + (y1 - y0) * e, z = z0 + (z1 - z0) * e;
        let shake = sh.fx === "shake" ? Math.max(0, 1 - lt / 1.2) * 14 : 0;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
        const k = Math.max(W / W0, H / H0) * z;
        ctx.save(); ctx.translate(W / 2 + R(-shake, shake), H / 2 + R(-shake, shake)); ctx.scale(k, k); ctx.translate(-W0 / 2, -H0 / 2 - cy);
        if (sh.scene) scene(ctx, sh.scene, T, cx);
        if (sh.draw) { ctx.save(); sh.draw(ctx, lt, W0, H0, p); ctx.restore(); }
        ctx.restore();
        // étalonnage + vignette + grain
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (cfg.grade) { ctx.globalCompositeOperation = "soft-light"; ctx.globalAlpha = .35; ctx.fillStyle = cfg.grade; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1; }
        const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .35, W / 2, H / 2, Math.max(W, H) * .75); vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,.6)"); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = .06; for (let g = 0; g < 70; g++) { ctx.fillStyle = rnd() < .5 ? "#fff" : "#000"; ctx.fillRect(rnd() * W, rnd() * H, 2, 2); } ctx.globalAlpha = 1;
        if (sh.fx === "glitch" && lt < .6) { for (let g = 0; g < 6; g++) { const y = rnd() * H, h = R(4, 30); ctx.drawImage(cv, 0, y * dpr, W * dpr, h * dpr, R(-40, 40), y, W, h); } }
        // bandes noires 2.39:1
        const bar = Math.max(0, (H - W / 2.39) / 2); ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, bar); ctx.fillRect(0, H - bar, W, bar);
        // textes
        const fade = Math.min(1, lt / .6, (d - lt) / .5);
        if (sh.title) { ctx.globalAlpha = Math.max(0, fade); ctx.textAlign = "center"; ctx.textBaseline = "middle"; const fs = Math.min(W / 9, 120); ctx.font = `900 ${fs}px Impact, "Arial Black", system-ui`; ctx.shadowColor = (sh.scene && sh.scene.neon) || "#ff2d95"; ctx.shadowBlur = 30; ctx.fillStyle = "#fff"; ctx.fillText(sh.title, W / 2, H / 2 - (sh.sub ? fs * .25 : 0)); ctx.shadowBlur = 0;
          if (sh.sub) { ctx.font = `600 ${fs * .28}px system-ui`; ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.fillText(sh.sub.toUpperCase().split("").join(" "), W / 2, H / 2 + fs * .55); } ctx.globalAlpha = 1; }
        if (sh.text) { ctx.globalAlpha = Math.max(0, fade); ctx.textAlign = "center"; ctx.font = `500 ${Math.min(W / 32, 26)}px system-ui`; ctx.fillStyle = "#fff"; ctx.shadowColor = "#000"; ctx.shadowBlur = 8; ctx.fillText(sh.text, W / 2, H - bar - 34); ctx.shadowBlur = 0; ctx.globalAlpha = 1; }
        // transitions
        if (sh.fx === "flash" && lt < .45) { ctx.fillStyle = `rgba(255,255,255,${1 - lt / .45})`; ctx.fillRect(0, 0, W, H); }
        if ((sh.fx === "fade" || i === 0) && lt < .8) { ctx.fillStyle = `rgba(0,0,0,${1 - lt / .8})`; ctx.fillRect(0, 0, W, H); }
        if (i === shots.length - 1 && d - lt < 1) { ctx.fillStyle = `rgba(0,0,0,${1 - (d - lt)})`; ctx.fillRect(0, 0, W, H); }
        if (!t0) { ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(0, 0, W, H); }
      } catch (err) { console.error(err); }
    }
    requestAnimationFrame(frame);
  }
  window.CINE = { play };
})();
