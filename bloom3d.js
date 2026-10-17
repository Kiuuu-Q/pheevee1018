/* 立体绽放花朵：Canvas 2.5D 渲染（透视投影 + 逐瓣光照 + 投影阴影）
   用法：window.mountBloom(canvasEl) ；在 .greeting.unfold 出现时自动绽放 */
(function () {
  var CAM_F = 900;
  var LIGHT = norm([-0.42, -0.55, 0.72]);

  function norm(v) { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function rotX(p, a) { var c = Math.cos(a), s = Math.sin(a); return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c]; }
  function rotY(p, a) { var c = Math.cos(a), s = Math.sin(a); return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]; }
  function rotZ(p, a) { var c = Math.cos(a), s = Math.sin(a); return [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }

  /* 圆头花瓣轮廓；cup = 沿花心方向的弯曲，curl = 侧向卷曲 */
  function petalPoints(W, L, cup, curl, skew) {
    var h = W / 2, pts = [];
    function bez(p0, c1, c2, p3, t) {
      var m = 1 - t;
      return [
        m * m * m * p0[0] + 3 * m * m * t * c1[0] + 3 * m * t * t * c2[0] + t * t * t * p3[0],
        m * m * m * p0[1] + 3 * m * m * t * c1[1] + 3 * m * t * t * c2[1] + t * t * t * p3[1]
      ];
    }
    function prof(q) {
      var t = Math.min(1, Math.abs(q[1]) / L);
      return [q[0], q[1], -cup * L * Math.pow(t, 1.6) + curl * h * t * t];
    }
    var i, t, q;
    for (i = 0; i <= 10; i++) { t = i / 10; q = bez([0, 0], [h * 0.42, -L * 0.06], [h * 1.02, -L * 0.30], [h * 0.86 + skew, -L * 0.60], t); pts.push(prof(q)); }
    for (i = 1; i <= 10; i++) { t = i / 10; q = bez([h * 0.86 + skew, -L * 0.60], [h * 0.60, -L * 0.97], [-h * 0.60, -L * 0.97], [-h * 0.86 + skew, -L * 0.60], t); pts.push(prof(q)); }
    for (i = 10; i >= 0; i--) { t = i / 10; q = bez([0, 0], [-h * 0.42, -L * 0.06], [-h * 1.02, -L * 0.30], [-h * 0.86 + skew, -L * 0.60], t); pts.push(prof(q)); }
    return pts;
  }

  function makeFlower(cfg) {
    var petals = [];
    cfg.rings.forEach(function (r, ri) {
      var n = r[0], rBase = r[1], len = r[2], wid = r[3], tilt = r[4], off = r[5], shade = r[6];
      for (var i = 0; i < n; i++) {
        var ang = i * 360 / n + off + (((i * 37) % 9) - 4) * 1.1;
        var j = ((i * 53) % 5 - 2) * 0.035;
        petals.push({
          ang: ang, tilt: tilt, rBase: rBase,
          len: len * (1 + j), wid: wid * (1 + j * 0.6),
          shade: shade, delay: (i % 3) * 0.05 + ri * 0.055,
          cup: 0.10 + ri * 0.03, curl: 0.05,
          skew: (((i * 29) % 7) - 3) * 0.006
        });
      }
    });
    var out = {};
    for (var k in cfg) out[k] = cfg[k];
    out.petals = petals;
    return out;
  }

  var BASE = {
    x: 0, y: 0, z: 0, pitch: 0.26, yaw: 0, scale: 1,
    hue: 347, sat: 0.46,
    rings: [
      [9, .13, .48, .52, 0.04, 0, 0.93],
      [8, .075, .40, .46, 0.22, 24, 1.00],
      [7, .035, .30, .40, 0.40, 48, 1.05],
      [5, .012, .19, .30, 0.56, 12, 1.10]
    ],
    core: .13
  };

  var FLOWERS = [
    { def: makeFlower(BASE), delay: 0 },
    { def: makeFlower(Object.assign({}, BASE, {
      x: -.52, y: .20, z: .10, yaw: -0.40, scale: .36, hue: 352, core: .07,
      rings: [[6, .14, .50, .50, 0.06, 0, 0.94], [5, .06, .38, .40, 0.34, 30, 1.02]]
    })), delay: .24 },
    { def: makeFlower(Object.assign({}, BASE, {
      x: .54, y: .15, z: .14, yaw: 0.36, scale: .32, hue: 18, sat: 0.38, core: .07,
      rings: [[6, .14, .50, .50, 0.06, 0, 0.94], [5, .06, .38, .40, 0.34, 30, 1.02]]
    })), delay: .32 },
    { def: makeFlower(Object.assign({}, BASE, {
      x: -.44, y: -.24, z: .08, yaw: -0.6, scale: .24, hue: 276, sat: 0.26, core: .06,
      rings: [[5, .14, .54, .52, 0.10, 0, 0.95]]
    })), delay: .40 },
    { def: makeFlower(Object.assign({}, BASE, {
      x: .42, y: -.30, z: .12, yaw: 0.55, scale: .21, hue: 352, core: .06,
      rings: [[5, .14, .54, .52, 0.10, 0, 0.95]]
    })), delay: .46 }
  ];

  var LEAVES = [
    { x: -.44, y: .30, z: .16, ang: -152, len: .34, wid: .20, rot: -0.55 },
    { x: .44, y: .31, z: .18, ang: -28, len: .33, wid: .19, rot: 0.55 },
    { x: -.10, y: .36, z: .22, ang: -96, len: .30, wid: .18, rot: 0 },
    { x: .30, y: .12, z: .12, ang: -32, len: .26, wid: .15, rot: 0.7 },
    { x: -.30, y: .08, z: .12, ang: -148, len: .26, wid: .15, rot: -0.7 }
  ];

  function hsl(h, s, l) {
    return 'hsl(' + h + ' ' + Math.max(0, Math.min(100, s)).toFixed(1) + '% ' + Math.max(0, Math.min(100, l)).toFixed(1) + '%)';
  }
  function petalFill(d, p, t, lam) {
    var h = d.hue + (p.shade - 1) * 4;
    var s = d.sat * 100 * (0.72 + 0.28 * (1 - t));
    var l = (68 + 22 * t) * (0.92 + 0.14 * lam) * p.shade;
    return hsl(h, s, l);
  }

  function mount(canvas) {
    if (!canvas || canvas.__bloom) return;
    canvas.__bloom = true;
    var ctx = canvas.getContext('2d');
    var items = [];
    FLOWERS.forEach(function (f) {
      f.def.petals.forEach(function (p) { items.push({ kind: 'petal', p: p, d: f.def, delay: f.delay }); });
      if (f.def.core) items.push({ kind: 'core', d: f.def, delay: f.delay });
    });
    LEAVES.forEach(function (l) { items.push({ kind: 'leaf', l: l, delay: 0.06 }); });

    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var t0 = 0, raf = 0, running = false, settled = false;
    var sway = { x: 0, y: 0, tx: 0, ty: 0 };

    function easeOut(p) { return 1 - Math.pow(1 - Math.min(1, Math.max(0, p)), 2.6); }

    function draw(t, now) {
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      var W = canvas.clientWidth || 1, H = canvas.clientHeight || 1;
      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
        canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      var cx = W / 2, cy = H * 0.435, S = Math.min(W, H) * 0.575;
      var ease = easeOut(t);
      var yawSway = settled ? Math.sin((now || 0) / 4600) * 0.055 + sway.x : 0;
      var pitchSway = settled ? Math.sin((now || 0) / 6100) * 0.022 + sway.y : 0;

      function proj(p) { var k = CAM_F / (CAM_F + p[2]); return [cx + p[0] * k, cy + p[1] * k]; }

      // 底部氛围投影
      ctx.save();
      var g0 = ctx.createRadialGradient(cx, cy + S * 0.30, 0, cx, cy + S * 0.30, S * 0.36);
      g0.addColorStop(0, 'rgba(126,78,66,' + (0.13 * ease).toFixed(3) + ')');
      g0.addColorStop(1, 'rgba(126,78,66,0)');
      ctx.fillStyle = g0;
      ctx.beginPath(); ctx.ellipse(cx, cy + S * 0.30, S * 0.36, S * 0.08, 0, 0, 7); ctx.fill();
      ctx.restore();

      var list = [];

      items.forEach(function (it) {
        var local = easeOut((ease - it.delay) / (1 - it.delay));
        if (local <= 0) return;
        var d = it.d;

        if (it.kind === 'leaf') {
          var l = it.l;
          var sc = S * (0.55 + 0.45 * local);
          var grow = 0.35 + 0.65 * local;
          var pts = petalPoints(l.wid * sc, l.len * sc, 0.20, 0.02, 0).map(function (q) {
            var v = rotX(q, l.rot);
            v = rotZ(v, l.ang * Math.PI / 180);
            v = rotY(v, yawSway * 0.8);
            v = rotX(v, 0.30 + pitchSway);
            return [v[0] + l.x * S * grow, v[1] + l.y * S * grow, v[2] + l.z * S];
          });
          var zl = 0; pts.forEach(function (q) { zl += q[2]; });
          list.push({ kind: 'leaf', pts: pts, z: zl / pts.length, local: local });
          return;
        }

        var scl = d.scale * S;
        var fl = {
          x: d.x * S * (0.35 + 0.65 * local),
          y: d.y * S * (0.35 + 0.65 * local),
          z: d.z * S,
          pitch: d.pitch + pitchSway,
          yaw: d.yaw * (0.35 + 0.65 * local) + yawSway,
          s: scl * (0.58 + 0.42 * local)
        };

        if (it.kind === 'core') { list.push({ kind: 'core', fl: fl, d: d, z: -4, local: local }); return; }

        var p = it.p;
        var ang = p.ang * Math.PI / 180;
        var tilt = p.tilt + (1 - local) * 1.15;
        var rBase = p.rBase * fl.s * (0.4 + 0.6 * local);
        var len = p.len * fl.s, wid = p.wid * fl.s * (0.62 + 0.38 * local);
        var pts2 = petalPoints(wid, len, p.cup, p.curl, p.skew * wid).map(function (q) {
          var v = rotX(q, tilt);
          v = add(v, [0, -rBase, 0]);
          v = rotZ(v, ang);
          v = rotY(v, fl.yaw);
          v = rotX(v, fl.pitch);
          return [v[0] + fl.x, v[1] + fl.y, v[2] + fl.z];
        });
        var nrm = rotX([0, 0, 1], tilt); nrm = rotZ(nrm, ang); nrm = rotY(nrm, fl.yaw); nrm = rotX(nrm, fl.pitch);
        var lam = Math.max(0, nrm[0] * LIGHT[0] + nrm[1] * LIGHT[1] + nrm[2] * LIGHT[2]);
        var zp = 0; pts2.forEach(function (q) { zp += q[2]; });
        list.push({ kind: 'petal', pts: pts2, d: d, p: p, lam: lam, local: local, z: zp / pts2.length });
      });

      list.sort(function (a, b) { return b.z - a.z; });

      list.forEach(function (it) {
        if (it.kind === 'leaf') {
          var pr = it.pts.map(proj);
          var gl = ctx.createLinearGradient(pr[0][0], pr[0][1], pr[pr.length >> 1][0], pr[pr.length >> 1][1]);
          gl.addColorStop(0, '#6d7d52'); gl.addColorStop(.55, '#8b9c6b'); gl.addColorStop(1, '#a7b787');
          ctx.globalAlpha = 0.25 + 0.75 * it.local;
          ctx.beginPath(); ctx.moveTo(pr[0][0], pr[0][1]);
          for (var i = 1; i < pr.length; i++) ctx.lineTo(pr[i][0], pr[i][1]);
          ctx.closePath();
          ctx.shadowColor = 'rgba(40,55,25,0.28)'; ctx.shadowBlur = 8 * it.local; ctx.shadowOffsetY = 4 * it.local;
          ctx.fillStyle = gl; ctx.fill();
          ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
          ctx.globalAlpha = 1;
          return;
        }
        if (it.kind === 'core') {
          var flc = it.fl, lc = it.local;
          var c = proj([flc.x, flc.y, flc.z]);
          var r = flc.s * it.d.core * 0.62 * (0.55 + 0.45 * lc);
          ctx.globalAlpha = lc;
          for (var s2 = 0; s2 < 14; s2++) {
            var aa = s2 * 2.399, rr = r * (0.55 + 0.45 * ((s2 * 37) % 10) / 10);
            ctx.beginPath(); ctx.arc(c[0] + Math.cos(aa) * rr, c[1] + Math.sin(aa) * rr * 0.8, r * 0.1, 0, 7);
            ctx.fillStyle = s2 % 2 ? '#e5b969' : '#f7dc9d'; ctx.fill();
          }
          var gc = ctx.createRadialGradient(c[0] - r * 0.3, c[1] - r * 0.35, r * 0.05, c[0], c[1], r * 1.02);
          gc.addColorStop(0, '#fff8e0'); gc.addColorStop(.42, '#f0d089'); gc.addColorStop(.8, '#cf9f4c'); gc.addColorStop(1, '#ab7c33');
          ctx.beginPath(); ctx.arc(c[0], c[1], r, 0, 7); ctx.fillStyle = gc; ctx.fill();
          ctx.globalAlpha = 1;
          return;
        }
        var pts3 = it.pts, dd = it.d, pp = it.p, lam2 = it.lam, lo = it.local;
        var pr2 = pts3.map(proj);
        var base = pr2[0], mid = pr2[6] || pr2[pr2.length >> 1];
        var gp = ctx.createLinearGradient(base[0], base[1], mid[0], mid[1]);
        gp.addColorStop(0, petalFill(dd, pp, 0.00, lam2 * 0.80));
        gp.addColorStop(0.30, petalFill(dd, pp, 0.30, lam2 * 0.94));
        gp.addColorStop(0.68, petalFill(dd, pp, 0.68, lam2));
        gp.addColorStop(0.90, petalFill(dd, pp, 0.90, lam2));
        gp.addColorStop(1, petalFill(dd, pp, 1, lam2 * 0.92));
        ctx.globalAlpha = 0.12 + 0.88 * Math.min(1, lo * 1.7);
        ctx.beginPath(); ctx.moveTo(pr2[0][0], pr2[0][1]);
        for (var k = 1; k < pr2.length; k++) ctx.lineTo(pr2[k][0], pr2[k][1]);
        ctx.closePath();
        ctx.shadowColor = 'rgba(126,58,80,0.24)'; ctx.shadowBlur = 9 * lo; ctx.shadowOffsetY = 5 * lo;
        ctx.fillStyle = gp; ctx.fill();
        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
        // 花瓣柔和高光（受光面）
        var hx = base[0] + (mid[0] - base[0]) * 0.52 - (mid[1] - base[1]) * 0.16;
        var hy = base[1] + (mid[1] - base[1]) * 0.52 + (mid[0] - base[0]) * 0.16;
        var hr = Math.max(10, Math.hypot(mid[0] - base[0], mid[1] - base[1]) * 0.62);
        var gh = ctx.createRadialGradient(hx, hy, 1, hx, hy, hr);
        gh.addColorStop(0, 'rgba(255,255,255,' + (0.26 * lo * (0.55 + 0.45 * lam2)).toFixed(3) + ')');
        gh.addColorStop(0.65, 'rgba(255,255,255,0.04)');
        gh.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.save(); ctx.clip(); ctx.fillStyle = gh; ctx.fill(); ctx.restore();
        ctx.strokeStyle = 'rgba(168,86,112,' + (0.16 + 0.16 * lo).toFixed(3) + ')';
        ctx.lineWidth = 0.9; ctx.stroke();
        ctx.globalAlpha = 1;
      });
    }

    function tick(now) {
      if (!canvas.isConnected) { running = false; return; }
      var t = reduce ? 1 : Math.min(1, (now - t0) / 2300);
      draw(t, now);
      if (t >= 1) { settled = true; }
      raf = requestAnimationFrame(tick);
    }
    function start() {
      if (running) return;
      running = true;
      t0 = performance.now();
      raf = requestAnimationFrame(tick);
    }
    function stop() { running = false; cancelAnimationFrame(raf); }

    // 指针视差
    function onMove(e) {
      var r = canvas.getBoundingClientRect();
      var dx = ((e.clientX - r.left) / Math.max(1, r.width) - 0.5) * 2;
      var dy = ((e.clientY - r.top) / Math.max(1, r.height) - 0.5) * 2;
      sway.tx = Math.max(-1, Math.min(1, dx)) * 0.07;
      sway.ty = Math.max(-1, Math.min(1, dy)) * 0.05;
    }
    function smooth() {
      sway.x += (sway.tx - sway.x) * 0.06;
      sway.y += (sway.ty - sway.y) * 0.06;
    }
    var smoothId = setInterval(smooth, 50);

    var greeting = canvas.closest ? canvas.closest('.greeting') : null;
    var unlocked = false;
    function check() {
      if (unlocked) return;
      if (!greeting || greeting.classList.contains('unfold')) { unlocked = true; start(); }
    }
    if (greeting) {
      var mo = new MutationObserver(check);
      mo.observe(greeting, { attributes: true, attributeFilter: ['class'] });
    }
    check();
    window.addEventListener('pointermove', onMove, { passive: true });

    if (window.ResizeObserver) {
      var ro = new ResizeObserver(function () { draw(settled ? 1 : Math.min(1, (performance.now() - t0) / 2300)); });
      ro.observe(canvas);
    }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { cancelAnimationFrame(raf); running = false; }
      else if (settled) start();
    });
    window.addEventListener('pagehide', function () { stop(); clearInterval(smoothId); });
  }

  window.mountBloom = mount;
})();
