/* 立体绽放花束 v4 —— 俯视平铺（flat-lay）花环
   花种：银莲花 / 洋牡丹 / 虞美人 / 波斯菊 / 铃兰 / 小浆果 / 满天星，配尤加利叶
   画法：透视投影 + 逐瓣光照 + 同色系墨线，由中心向外依次绽放
   用法：window.mountBloom(canvasEl) */
(function () {
  'use strict';

  var CAM_F = 1700;
  var LIGHT = norm([-0.40, -0.62, 0.68]);

  /* ---------- 基础 ---------- */
  function norm(v) { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function rotX(p, a) { var c = Math.cos(a), s = Math.sin(a); return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c]; }
  function rotY(p, a) { var c = Math.cos(a), s = Math.sin(a); return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]; }
  function rotZ(p, a) { var c = Math.cos(a), s = Math.sin(a); return [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hsl(h, s, l, a) {
    h = ((h % 360) + 360) % 360;
    var S = clamp(s, 0, 100).toFixed(1), L = clamp(l, 0, 100).toFixed(1);
    return a == null ? 'hsl(' + h.toFixed(1) + ',' + S + '%,' + L + '%)'
      : 'hsla(' + h.toFixed(1) + ',' + S + '%,' + L + '%,' + a.toFixed(3) + ')';
  }

  /* ---------- 花瓣轮廓 ---------- */
  function petalShape(kind, W, L, cup, curl, skew) {
    var h = W / 2, pts = [], i, t;
    function zOf(x, y) {
      var tt = clamp(Math.abs(y) / L, 0, 1);
      return -cup * L * Math.pow(tt, 1.55) + curl * h * tt * tt;
    }
    if (kind === 'round') {
      function bez(p0, c1, c2, p3, u) {
        var m = 1 - u;
        return [
          m * m * m * p0[0] + 3 * m * m * u * c1[0] + 3 * m * u * u * c2[0] + u * u * u * p3[0],
          m * m * m * p0[1] + 3 * m * m * u * c1[1] + 3 * m * u * u * c2[1] + u * u * u * p3[1]
        ];
      }
      for (i = 0; i <= 8; i++) {
        t = i / 8;
        var q1 = bez([0, 0], [h * 0.46, -L * 0.05], [h * 0.96, -L * 0.28], [h * 0.80 + skew, -L * 0.58], t);
        pts.push([q1[0], q1[1], zOf(q1[0], q1[1])]);
      }
      for (i = 1; i <= 8; i++) {
        t = i / 8;
        var q2 = bez([h * 0.80 + skew, -L * 0.58], [h * 0.58, -L * 0.94], [-h * 0.58, -L * 0.94], [-h * 0.80 + skew, -L * 0.58], t);
        pts.push([q2[0], q2[1], zOf(q2[0], q2[1])]);
      }
      for (i = 8; i >= 0; i--) {
        t = i / 8;
        var q3 = bez([0, 0], [-h * 0.46, -L * 0.05], [-h * 0.96, -L * 0.28], [-h * 0.80 + skew, -L * 0.58], t);
        pts.push([q3[0], q3[1], zOf(q3[0], q3[1])]);
      }
    } else if (kind === 'leaf') {
      var M = 10;
      for (i = 0; i <= M; i++) {
        t = i / M;
        var xx = h * Math.pow(Math.sin(Math.PI * t), 0.72) * (t < 0.5 ? 1 : 1 - 0.20 * (t - 0.5));
        pts.push([xx, -L * t, 0.10 * L * Math.sin(Math.PI * t)]);
      }
      for (i = M - 1; i >= 1; i--) {
        t = i / M;
        var xl = -h * Math.pow(Math.sin(Math.PI * t), 0.72) * (t < 0.5 ? 1 : 1 - 0.20 * (t - 0.5));
        pts.push([xl, -L * t, 0.10 * L * Math.sin(Math.PI * t)]);
      }
    } else {
      var N = 12;
      function prof(u) {
        if (kind === 'slim') return Math.pow(Math.sin(Math.PI * Math.pow(u, 0.92)), 0.50);
        return Math.pow(Math.sin(Math.PI * Math.pow(u, 0.80)), 0.38);
      }
      for (i = 0; i <= N; i++) { t = i / N; var xr = h * prof(t) + skew * L * t; pts.push([xr, -L * t, zOf(xr, -L * t)]); }
      for (i = N - 1; i >= 1; i--) { t = i / N; var xlp = -h * prof(t) + skew * L * t; pts.push([xlp, -L * t, zOf(xlp, -L * t)]); }
    }
    return pts;
  }

  /* ---------- 花型 ---------- */
  var SPECIES = {
    ranunculus: {
      rings: [
        [7, 0.10, 0.46, 0.46, 0.10, 0, 0.93, 'round'],
        [6, 0.045, 0.34, 0.38, 0.34, 26, 1.00, 'round'],
        [5, 0.014, 0.23, 0.28, 0.56, 54, 1.06, 'round'],
        [3, 0.004, 0.14, 0.18, 0.74, 20, 1.10, 'round']
      ],
      cup: 0.24, curl: 0.05, center: null
    },
    anemone: {
      rings: [[9, 0.055, 0.48, 0.42, -0.12, 0, 0.99, 'round']],
      cup: 0.13, curl: 0.04, center: 'anemone'
    },
    cosmos: {
      rings: [[8, 0.035, 0.42, 0.26, 0.04, 0, 0.99, 'slim']],
      cup: 0.09, curl: 0.07, center: 'disc'
    },
    poppy: {
      rings: [
        [4, 0.025, 0.48, 0.58, 0.04, 0, 0.97, 'round'],
        [1, 0.006, 0.38, 0.46, 0.24, 45, 1.05, 'round']
      ],
      cup: 0.14, curl: 0.06, center: 'poppy'
    },
    bell: {
      rings: [[5, 0.02, 0.24, 0.19, 0.80, 0, 1.00, 'round']],
      cup: 0.50, curl: 0.02, center: null
    }
  };

  function buildFlower(sp) {
    var sd = SPECIES[sp.type], petals = [];
    sd.rings.forEach(function (r, ri) {
      var n = r[0];
      for (var i = 0; i < n; i++) {
        var j = ((i * 53) % 7 - 3) * 0.05;
        petals.push({
          ang: i * 360 / n + r[5] + (((i * 37) % 7) - 3) * 1.6,
          tilt: r[4], rBase: r[1],
          len: r[2] * (1 + j), wid: r[3] * (1 + j * 0.5),
          shade: r[6], shape: r[7],
          cup: sd.cup * (1 + ri * 0.05), curl: sd.curl,
          skew: (((i * 29) % 7) - 3) * 0.018,
          delay: ri * 0.11 + (i % 3) * 0.03
        });
      }
    });
    var out = {};
    for (var k in sp) out[k] = sp[k];
    out.petals = petals;
    out.spec = sd;
    return out;
  }

  /* ---------- 构图：俯视平铺花环 ----------
     a = 角度（度，0=右，顺时针），r = 半径（U 比例），s = 花径 */
  var BLOOMS = [
    { type: 'anemone',     a: 270, r: 0.000, s: 0.300, yaw: 0.10, pitch: 0.08, hue: 40, sat: 0.42, lit: 95, z: 0.02 },
    { type: 'ranunculus',  a: 325, r: 0.215, s: 0.240, yaw: 0.55, pitch: 0.14, hue: 354, sat: 0.48, lit: 66, z: -0.02 },
    { type: 'poppy',       a: 232, r: 0.215, s: 0.230, yaw: -0.45, pitch: 0.12, hue: 9, sat: 0.70, lit: 61, z: -0.03 },
    { type: 'ranunculus',  a: 128, r: 0.220, s: 0.195, yaw: -0.80, pitch: 0.16, hue: 341, sat: 0.34, lit: 43, z: 0.01 },
    { type: 'cosmos',      a: 25,  r: 0.190, s: 0.125, yaw: 0.30, pitch: 0.14, hue: 282, sat: 0.28, lit: 71, z: 0.00 },
    { type: 'cosmos',      a: 178, r: 0.248, s: 0.120, yaw: -0.25, pitch: 0.14, hue: 42, sat: 0.44, lit: 92, z: 0.02 },
    { type: 'cosmos',      a: 76,  r: 0.255, s: 0.112, yaw: 0.70, pitch: 0.16, hue: 5, sat: 0.46, lit: 78, z: 0.03 },
    { type: 'cosmos',      a: 212, r: 0.300, s: 0.108, yaw: -0.60, pitch: 0.16, hue: 351, sat: 0.36, lit: 80, z: 0.04 },
    { type: 'cosmos',      a: 108, r: 0.250, s: 0.104, yaw: 0.42, pitch: 0.14, hue: 42, sat: 0.44, lit: 92, z: 0.03 }
  ];

  var BELLS = [];

  var BUDS = [];

  var GYPS = [];

  var BERRIES = [];

  /* 叶丛：成组藏在花间，向外探出 */
  var LEAVES = [
    { a: 8,   r: 0.215, len: 0.170, wid: 0.070, rot: 0.12, lit: 34 },
    { a: 24,  r: 0.230, len: 0.140, wid: 0.058, rot: -0.16, lit: 38 },
    { a: 42,  r: 0.205, len: 0.155, wid: 0.064, rot: 0.02, lit: 32 },
    { a: 96,  r: 0.225, len: 0.150, wid: 0.060, rot: -0.10, lit: 36 },
    { a: 116, r: 0.200, len: 0.130, wid: 0.054, rot: 0.16, lit: 33 },
    { a: 152, r: 0.222, len: 0.165, wid: 0.066, rot: 0.06, lit: 37 },
    { a: 174, r: 0.205, len: 0.135, wid: 0.056, rot: -0.14, lit: 31 },
    { a: 236, r: 0.215, len: 0.160, wid: 0.062, rot: 0.10, lit: 35 },
    { a: 258, r: 0.200, len: 0.130, wid: 0.052, rot: -0.08, lit: 39 },
    { a: 296, r: 0.228, len: 0.158, wid: 0.064, rot: 0.04, lit: 33 },
    { a: 316, r: 0.205, len: 0.135, wid: 0.056, rot: -0.12, lit: 37 },
    { a: 344, r: 0.220, len: 0.162, wid: 0.062, rot: 0.08, lit: 35 }
  ];

  function mount(canvas) {
    if (!canvas || canvas.__bloom) return;
    canvas.__bloom = true;
    var ctx = canvas.getContext('2d');

    var ALL = BLOOMS.concat(BELLS).map(function (sp) { return buildFlower(sp); });

    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var t0 = 0, raf = 0, running = false, settled = false;
    var sway = { x: 0, y: 0, tx: 0, ty: 0 };

    function easeOut(p) { p = clamp(p, 0, 1); return 1 - Math.pow(1 - p, 2.4); }

    function pathOf(c, pts) {
      c.beginPath();
      c.moveTo(pts[0][0], pts[0][1]);
      for (var i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
      c.closePath();
    }

    function draw(t, now) {
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      var W = canvas.clientWidth || 1, H = canvas.clientHeight || 1;
      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
        canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      var U = Math.min(W, H) * 1.16;
      var cx = W * 0.5, cy = H * 0.435;
      var ease = easeOut(t);
      var yawS = settled ? Math.sin(now / 5200) * 0.03 + sway.x : 0;
      var pitchS = settled ? Math.sin(now / 6900) * 0.010 + sway.y : 0;

      function cam(v) { return rotX(rotY(v, yawS), pitchS); }
      function world(x, y, z) { return cam([x * U, y * U, z * U]); }
      function proj(p) {
        var k = CAM_F / (CAM_F + p[2]);
        return [cx + p[0] * k, cy + p[1] * k];
      }
      function at(a, r) {
        var rad = a * Math.PI / 180;
        return [Math.cos(rad) * r, Math.sin(rad) * r];
      }

      /* 整体软投影：让花束像摆在纸上 */
      var gc = proj(world(0.012, 0.035, 0.10));
      ctx.save();
      ctx.translate(gc[0], gc[1]); ctx.scale(1, 0.94);
      var gr = ctx.createRadialGradient(0, 0, U * 0.10, 0, 0, U * 0.50);
      gr.addColorStop(0, 'rgba(122,84,72,' + (0.10 * ease).toFixed(3) + ')');
      gr.addColorStop(0.62, 'rgba(122,84,72,' + (0.05 * ease).toFixed(3) + ')');
      gr.addColorStop(1, 'rgba(122,84,72,0)');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(0, 0, U * 0.50, 0, 7); ctx.fill();
      ctx.restore();

      var list = [];

      /* 叶片（最底层） */
      LEAVES.forEach(function (l, li) {
        var lp = clamp((ease - 0.08 - (li % 5) * 0.03) / 0.55, 0, 1);
        if (lp <= 0) return;
        list.push({ kind: 'leaf', l: l, lp: easeOut(lp), z: 0.42 + (li % 3) * 0.004 });
      });

      /* 浆果与满天星的细枝（次底层） */
      /* 满天星 / 浆果枝条 */
      GYPS.forEach(function (g) {
        var lp = clamp((ease - 0.30) / 0.45, 0, 1);
        if (lp <= 0) return;
        list.push({ kind: 'gyps', g: g, lp: easeOut(lp), z: 0.38 });
      });
      BUDS.forEach(function (b) {
        var lp = clamp((ease - 0.44) / 0.38, 0, 1);
        if (lp <= 0) return;
        list.push({ kind: 'bud', b: b, lp: easeOut(lp), z: 0.30 });
      });
      BERRIES.forEach(function (g) {
        var lp = clamp((ease - 0.34) / 0.45, 0, 1);
        if (lp <= 0) return;
        list.push({ kind: 'berry', g: g, lp: easeOut(lp), z: 0.36 });
      });

      /* 花朵：从中心向外依次绽放 */
      ALL.forEach(function (sp) {
        var delay = 0.10 + sp.r * 1.45;
        var local = easeOut((ease - delay) / Math.max(0.001, 1 - delay));
        if (local <= 0) return;
        var off = at(sp.a, sp.r);
        var grow = 0.56 + 0.44 * local;
        var base = world(off[0] * grow, off[1] * grow, sp.z);
        var s = sp.s * U * (0.58 + 0.42 * local);
        var yaw = sp.yaw * (0.5 + 0.5 * local) + yawS;
        var pitch = sp.pitch + pitchS;

        var maxZ = -1e9;
        sp.petals.forEach(function (p) {
          var ang = p.ang * Math.PI / 180;
          var tilt = p.tilt + (1 - local) * 1.25;
          var rBase = p.rBase * s * (0.35 + 0.65 * local);
          var len = p.len * s * (0.45 + 0.55 * local);
          var wid = p.wid * s * (0.60 + 0.40 * local);
          var shape = petalShape(p.shape, wid, len, p.cup, p.curl, p.skew);
          var out = shape.map(function (q) {
            var v = rotX(q, tilt);
            v = add(v, [0, -rBase, 0]);
            v = rotZ(v, ang);
            v = rotY(v, yaw);
            v = rotX(v, pitch);
            return add(v, base);
          });
          var nrm = rotZ(rotX([0, 0, 1], tilt), ang);
          nrm = rotY(nrm, yaw); nrm = rotX(nrm, pitch);
          var lam = Math.max(0, nrm[0] * LIGHT[0] + nrm[1] * LIGHT[1] + nrm[2] * LIGHT[2]);
          var zs = 0; for (var i = 0; i < out.length; i++) zs += out[i][2];
          list.push({ kind: 'petal', pts: out, sp: sp, p: p, lam: lam, local: local, z: zs / out.length });
          if (maxZ < zs / out.length) maxZ = zs / out.length;
        });

        list.push({
          kind: 'fshadow', c: base, r: s * 0.46, local: local, z: maxZ + 0.5
        });

        if (sp.spec.center) {
          list.push({
            kind: 'center', core: sp.spec.center, sp: sp, local: local,
            c: add(base, rotX(rotY([0, 0, -s * 0.05], yaw), pitch)),
            s: s, z: base[2] - s * 0.5
          });
        }
      });

      list.sort(function (a, b) { return b.z - a.z; });

      /* ---------- 绘制 ---------- */
      list.forEach(function (it) {
        if (it.kind === 'fshadow') {
          var sc2 = proj(it.c), rr4 = it.r;
          var gs = ctx.createRadialGradient(sc2[0] + 3, sc2[1] + 6, rr4 * 0.25, sc2[0] + 3, sc2[1] + 6, rr4);
          gs.addColorStop(0, 'rgba(112,76,64,' + (0.16 * it.local).toFixed(3) + ')');
          gs.addColorStop(0.65, 'rgba(112,76,64,' + (0.07 * it.local).toFixed(3) + ')');
          gs.addColorStop(1, 'rgba(112,76,64,0)');
          ctx.fillStyle = gs;
          ctx.beginPath(); ctx.arc(sc2[0] + 3, sc2[1] + 6, rr4, 0, 7); ctx.fill();
          return;
        }

        if (it.kind === 'leaf') {
          var l = it.l, lp = it.lp;
          var rad = l.a * Math.PI / 180;
          var offl = at(l.a, l.r);
          var base = world(offl[0], offl[1], 0.06);
          var grow = 0.45 + 0.55 * lp;
          var pts = petalShape('leaf', l.wid * U * grow, l.len * U * grow, 0.30, 0, 0).map(function (q) {
            var v = rotZ(rotX(q, l.rot - 0.35), rad + Math.PI / 2);
            v = cam(v);
            return add(v, base);
          });
          var pr = pts.map(proj);
          ctx.globalAlpha = lp;
          pathOf(ctx, pr);
          var g = ctx.createLinearGradient(pr[0][0], pr[0][1], pr[pr.length >> 1][0], pr[pr.length >> 1][1]);
          g.addColorStop(0, hsl(98, 22, l.lit * 0.82));
          g.addColorStop(0.55, hsl(102, 24, l.lit));
          g.addColorStop(1, hsl(108, 26, l.lit * 1.22));
          ctx.fillStyle = g; ctx.fill();
          ctx.strokeStyle = 'rgba(40,52,32,0.55)'; ctx.lineWidth = 1.25; ctx.stroke();
          var tipp = pr[Math.round(pr.length * 0.30)];
          ctx.beginPath(); ctx.moveTo(pr[0][0], pr[0][1]); ctx.lineTo(tipp[0], tipp[1]);
          ctx.strokeStyle = 'rgba(70,88,52,0.35)'; ctx.lineWidth = 0.8; ctx.stroke();
          ctx.globalAlpha = 1;
          return;
        }

        if (it.kind === 'bud') {
          var bd = it.b, bl3 = it.lp;
          var offb2 = at(bd.a, bd.r);
          var bp = proj(world(offb2[0], offb2[1], 0.03));
          var w3 = bd.s * U * 1.15 * bl3, h3 = w3 * 1.9;
          var dir3 = bd.a * Math.PI / 180;
          // 细茎
          ctx.beginPath();
          ctx.moveTo(bp[0] - Math.cos(dir3) * w3 * 0.6, bp[1] - Math.sin(dir3) * w3 * 0.6);
          ctx.lineTo(bp[0] - Math.cos(dir3) * w3 * 3.2 * bl3, bp[1] - Math.sin(dir3) * w3 * 3.2 * bl3);
          ctx.strokeStyle = 'rgba(122,140,100,0.85)'; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
          ctx.stroke();
          ctx.save();
          ctx.translate(bp[0], bp[1]);
          ctx.rotate(bd.ang);
          var gbud = ctx.createLinearGradient(-w3, -h3, w3, h3);
          gbud.addColorStop(0, hsl(bd.hue, bd.sat * 100 * 1.05, bd.lit * 1.14));
          gbud.addColorStop(1, hsl(bd.hue, bd.sat * 100, bd.lit * 0.86));
          ctx.beginPath();
          ctx.moveTo(0, -h3 * 0.95);
          ctx.bezierCurveTo(w3 * 0.92, -h3 * 0.42, w3 * 0.86, h3 * 0.62, 0, h3 * 0.72);
          ctx.bezierCurveTo(-w3 * 0.86, h3 * 0.62, -w3 * 0.92, -h3 * 0.42, 0, -h3 * 0.95);
          ctx.closePath();
          ctx.fillStyle = gbud; ctx.fill();
          ctx.strokeStyle = 'rgba(48,42,38,0.45)'; ctx.lineWidth = 1.1; ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(0, -h3 * 0.9);
          ctx.quadraticCurveTo(w3 * 0.16, 0, 0, h3 * 0.7);
          ctx.strokeStyle = hsl(bd.hue, bd.sat * 100 * 0.8, bd.lit * 0.62, 0.5);
          ctx.lineWidth = 1; ctx.stroke();
          ctx.restore();
          return;
        }

        if (it.kind === 'gyps') {
          var g2 = it.g, lp3 = it.lp;
          var offg = at(g2.a, g2.r);
          var bg = world(offg[0], offg[1], 0.06);
          var seed = g2.seed;
          for (var i3 = 0; i3 < g2.n; i3++) {
            seed = (seed * 1103515245 + 12345) % 2147483647;
            var ang2 = (seed % 1000) / 1000 * Math.PI * 2;
            var rr = Math.pow(((seed >> 10) % 1000) / 1000, 0.6) * g2.s * U * 1.9 * lp3;
            ctx.beginPath();
            ctx.arc(bg[0] + Math.cos(ang2) * rr, bg[1] + Math.sin(ang2) * rr, 2.0 + ((seed >> 5) % 6) * 0.3, 0, 7);
            ctx.fillStyle = 'rgba(255,252,244,' + (0.92 * lp3).toFixed(3) + ')';
            ctx.fill();
          }
          return;
        }

        if (it.kind === 'berry') {
          var g3 = it.g, lp4 = it.lp;
          var offr = at(g3.a, g3.r);
          var bb = world(offr[0], offr[1], 0.05);
          var sd2 = g3.seed;
          for (var i4 = 0; i4 < g3.n; i4++) {
            sd2 = (sd2 * 1103515245 + 12345) % 2147483647;
            var a3 = (sd2 % 1000) / 1000 * Math.PI * 2;
            var r3 = Math.pow(((sd2 >> 10) % 1000) / 1000, 0.55) * g3.s * U * 1.5 * lp4;
            var bx = bb[0] + Math.cos(a3) * r3, by = bb[1] + Math.sin(a3) * r3;
            var br = (3.0 + ((sd2 >> 7) % 5) * 0.5) * (0.6 + 0.4 * lp4);
            var gg = ctx.createRadialGradient(bx - br * 0.35, by - br * 0.4, br * 0.1, bx, by, br);
            gg.addColorStop(0, '#a3555f'); gg.addColorStop(0.6, '#7c3a46'); gg.addColorStop(1, '#54222c');
            ctx.beginPath(); ctx.arc(bx, by, br, 0, 7); ctx.fillStyle = gg; ctx.fill();
          }
          return;
        }

        if (it.kind === 'center') {
          var c = proj(it.c);
          var R = Math.max(1, it.s * (it.core === 'anemone' ? 0.150 : it.core === 'poppy' ? 0.105 : 0.100) * (0.4 + 0.6 * it.local));
          ctx.globalAlpha = Math.min(1, it.local * 1.5);
          if (it.core === 'anemone') {
            for (var q = 0; q < 26; q++) {
              var aa = q * 2.399 + 0.4, rr2 = R * (1.05 + 0.42 * ((q * 7) % 5) / 5);
              var ex = c[0] + Math.cos(aa) * rr2, ey = c[1] + Math.sin(aa) * rr2 * 0.9;
              ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.lineTo(ex, ey);
              ctx.strokeStyle = 'rgba(214,182,124,0.85)'; ctx.lineWidth = 0.9; ctx.stroke();
              ctx.beginPath(); ctx.arc(ex, ey, Math.max(1, R * 0.10), 0, 7);
              ctx.fillStyle = '#f0d59c'; ctx.fill();
            }
            var ga = ctx.createRadialGradient(c[0] - R * 0.3, c[1] - R * 0.34, R * 0.06, c[0], c[1], R);
            ga.addColorStop(0, '#5a4e64'); ga.addColorStop(0.6, '#3a3044'); ga.addColorStop(1, '#221b29');
            ctx.beginPath(); ctx.arc(c[0], c[1], R, 0, 7); ctx.fillStyle = ga; ctx.fill();
          } else if (it.core === 'poppy') {
            var gp = ctx.createLinearGradient(c[0] - R, c[1] - R, c[0] + R, c[1] + R);
            gp.addColorStop(0, '#8e9a78'); gp.addColorStop(0.6, '#6b7a58'); gp.addColorStop(1, '#4a5740');
            ctx.beginPath(); ctx.ellipse(c[0], c[1], R * 0.82, R, 0, 0, 7);
            ctx.fillStyle = gp; ctx.fill();
            ctx.strokeStyle = 'rgba(48,58,40,0.55)'; ctx.lineWidth = 0.9; ctx.stroke();
            ctx.beginPath(); ctx.ellipse(c[0], c[1] - R * 0.72, R * 0.62, R * 0.26, 0, 0, 7);
            ctx.fillStyle = '#7d8a68'; ctx.fill();
            ctx.strokeStyle = 'rgba(48,58,40,0.5)'; ctx.stroke();
          } else {
            var gd = ctx.createRadialGradient(c[0] - R * 0.3, c[1] - R * 0.35, R * 0.08, c[0], c[1], R);
            gd.addColorStop(0, '#f2d089'); gd.addColorStop(0.65, '#d3a24c'); gd.addColorStop(1, '#a97a2c');
            ctx.beginPath(); ctx.arc(c[0], c[1], R, 0, 7); ctx.fillStyle = gd; ctx.fill();
            ctx.beginPath(); ctx.arc(c[0], c[1], R * 0.58, 0, 7);
            ctx.fillStyle = 'rgba(150,102,32,0.30)'; ctx.fill();
          }
          ctx.globalAlpha = 1;
          return;
        }

        /* 花瓣 */
        var pr2 = it.pts.map(proj);
        var spp = it.sp, pp2 = it.p, lam2 = it.lam, lo = it.local;
        var alpha = Math.min(1, 0.12 + lo * 1.35);
        var L0 = spp.lit * (pp2.shade || 1) * (0.87 + 0.20 * lam2);
        var hueP = spp.hue + (pp2.shade - 1) * 9;

        ctx.globalAlpha = alpha * 0.18;
        ctx.beginPath();
        ctx.moveTo(pr2[0][0] + 2, pr2[0][1] + 3);
        for (var k6 = 1; k6 < pr2.length; k6++) ctx.lineTo(pr2[k6][0] + 2, pr2[k6][1] + 3);
        ctx.closePath();
        ctx.fillStyle = hsl(hueP, spp.sat * 100 * 0.85, L0 * 0.52);
        ctx.fill();

        var b0 = pr2[0], tip = pr2[10] || pr2[pr2.length >> 1];
        var grad = ctx.createLinearGradient(b0[0], b0[1], tip[0], tip[1]);
        grad.addColorStop(0, hsl(hueP, spp.sat * 100 * 0.98, L0 * 0.92));
        grad.addColorStop(1, hsl(hueP, spp.sat * 100 * 1.02, L0 * 1.04));
        ctx.globalAlpha = alpha;
        pathOf(ctx, pr2);
        ctx.fillStyle = grad; ctx.fill();

        ctx.strokeStyle = 'rgba(48,42,38,0.62)';
        ctx.lineWidth = 1.35; ctx.stroke();

        if (spp.type === 'ranunculus' || spp.type === 'anemone' || spp.type === 'poppy') {
          ctx.beginPath();
          ctx.moveTo(b0[0], b0[1]);
          ctx.lineTo(tip[0], tip[1]);
          ctx.strokeStyle = hsl(hueP, spp.sat * 100 * 0.8, L0 * 0.66, 0.15);
          ctx.lineWidth = 0.9; ctx.stroke();
        }
        ctx.globalAlpha = 1;
      });
    }

    function tick(now) {
      if (!canvas.isConnected) { running = false; return; }
      var t = reduce ? 1 : Math.min(1, (now - t0) / 2800);
      draw(t, now);
      if (t >= 1) settled = true;
      raf = requestAnimationFrame(tick);
    }
    function start() {
      if (running) return;
      running = true;
      t0 = performance.now();
      raf = requestAnimationFrame(tick);
    }
    function stop() { running = false; cancelAnimationFrame(raf); }

    function onMove(e) {
      var r = canvas.getBoundingClientRect();
      var dx = ((e.clientX - r.left) / Math.max(1, r.width) - 0.5) * 2;
      var dy = ((e.clientY - r.top) / Math.max(1, r.height) - 0.5) * 2;
      sway.tx = clamp(dx, -1, 1) * 0.05;
      sway.ty = clamp(dy, -1, 1) * 0.03;
    }
    function smooth() { sway.x += (sway.tx - sway.x) * 0.06; sway.y += (sway.ty - sway.y) * 0.06; }
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
      var ro = new ResizeObserver(function () {
        draw(settled ? 1 : Math.min(1, (performance.now() - t0) / 2800));
      });
      ro.observe(canvas);
    }
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { cancelAnimationFrame(raf); running = false; }
      else if (settled) start();
    });
    window.addEventListener('pagehide', function () { stop(); clearInterval(smoothId); });

    canvas.__drawAt = function (v) { draw(v, 0); };
  }

  window.mountBloom = mount;
})();
