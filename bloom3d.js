/* 手绘水彩花束渲染器 v5
   思路：每朵花/每根枝叶先用「水彩晕染 + 抖动手绘线 + 排线阴影」画到离屏画布，
   再在动画里逐个展开——既能画得很细，又能保持顺滑。
   用法：window.mountBloom(canvasEl) */
(function () {
  'use strict';

  var INK = [111, 58, 72];        // #6f3a48 深梅
  var INK_D = [86, 42, 54];
  var LEAF_INK = [74, 82, 54];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function hslA(c, a) { return 'hsla(' + c[0] + ',' + c[1] + '%,' + c[2] + '%,' + a + ')'; }
  function shift(c, dh, ds, dl) { return [c[0] + (dh || 0), clamp(c[1] + (ds || 0), 0, 100), clamp(c[2] + (dl || 0), 0, 100)]; }

  function rng(seed) {
    var s = (seed | 0) || 7;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  /* ---------- 曲线 ---------- */
  function trace(ctx, pts, closed, tension) {
    var n = pts.length, k = tension == null ? 1 : tension, i;
    if (n < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    if (closed) {
      for (i = 0; i < n; i++) {
        var p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
        ctx.bezierCurveTo(
          p1.x + (p2.x - p0.x) * k / 6, p1.y + (p2.y - p0.y) * k / 6,
          p2.x - (p3.x - p1.x) * k / 6, p2.y - (p3.y - p1.y) * k / 6,
          p2.x, p2.y
        );
      }
      ctx.closePath();
    } else {
      for (i = 0; i < n - 1; i++) {
        var a = pts[Math.max(0, i - 1)], b = pts[i], c = pts[i + 1], d = pts[Math.min(n - 1, i + 2)];
        ctx.bezierCurveTo(
          b.x + (c.x - a.x) * k / 6, b.y + (c.y - a.y) * k / 6,
          c.x - (d.x - b.x) * k / 6, c.y - (d.y - b.y) * k / 6,
          c.x, c.y
        );
      }
    }
  }

  function wobble(pts, amt, rnd) {
    return pts.map(function (p, i) {
      if (i === 0) return p;
      return { x: p.x + (rnd() - 0.5) * amt, y: p.y + (rnd() - 0.5) * amt };
    });
  }

  /* 手绘线：沿路径粗细渐变，靠近根部更重，尾端提笔 */
  function inkVar(ctx, pts, w, color, rnd, alpha, base, closed) {
    var n = pts.length, i;
    var a = alpha == null ? 0.55 : alpha;
    var w0 = w, prev = pts[0];
    var maxd = 1;
    if (base) {
      for (i = 0; i < n; i++) maxd = Math.max(maxd, Math.hypot(pts[i].x - base.x, pts[i].y - base.y));
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (i = 1; i < n; i++) {
      var p = pts[i];
      var d = base ? Math.hypot(p.x - base.x, p.y - base.y) / maxd : i / n;
      var ww = w0 * (1.0 - 0.45 * clamp(d, 0, 1));
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = rgba(color, a);
      ctx.lineWidth = ww;
      ctx.stroke();
      prev = p;
    }
    // 抖动重影，第二遍更淡更细
    var pts2 = wobble(pts, w0 * 0.42, rnd);
    ctx.strokeStyle = rgba(color, a * 0.38);
    ctx.lineWidth = Math.max(0.55, w0 * 0.5);
    trace(ctx, pts2, closed);
    ctx.stroke();
  }

  function hatch(ctx, x, y, ang, len, n, step, color, alpha) {
    ctx.strokeStyle = rgba(color, alpha);
    ctx.lineWidth = 0.9;
    ctx.lineCap = 'round';
    for (var i = 0; i < n; i++) {
      var o = (i - (n - 1) / 2) * step;
      var px = x + Math.cos(ang + Math.PI / 2) * o;
      var py = y + Math.sin(ang + Math.PI / 2) * o;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.quadraticCurveTo(
        px + Math.cos(ang) * len * 0.55 + Math.sin(ang) * len * 0.12,
        py + Math.sin(ang) * len * 0.55 - Math.cos(ang) * len * 0.12,
        px + Math.cos(ang) * len, py + Math.sin(ang) * len
      );
      ctx.stroke();
    }
  }

  /* ---------- 花瓣轮廓 ---------- */
  function petalOutline(o, local) {
    var rnd = o.rnd, i, t, pts = [];
    var len = o.len, wid = o.wid, bend = o.bend || 0, ruf = o.ruffle == null ? 0.06 : o.ruffle;
    var phase = rnd() * 6.28, freq = 2 + Math.floor(rnd() * 2);

    function W(t) {
      var w = Math.pow(Math.sin(Math.PI * Math.pow(t, 0.70)), o.round ? 0.40 : 0.66);
      w *= 1 + ruf * Math.sin(t * freq * 6.28 + phase);
      return w * (o.tipPinch || 1);
    }
    function X(t) { return bend * len * t * t * (o.tipPinch || 1); }
    function Y(t) { return -len * t; }

    var N = 11;
    for (i = 0; i <= N; i++) {
      t = (i / N) * (o.round ? 0.94 : 0.985);
      var w = W(t) * wid * 0.5;
      pts.push({ x: X(t) + w, y: Y(t) });
    }
    if (o.round) {
      var wt = W(0.94) * wid * 0.5;
      for (i = 1; i <= 4; i++) {
        var aa = -Math.PI / 2 + (i / 4) * Math.PI;
        pts.push({ x: X(0.94) + Math.cos(aa) * wt * 0.98, y: Y(0.94) - Math.abs(Math.sin(aa)) * wid * 0.09 });
      }
    }
    for (i = N; i >= 0; i--) {
      t = (i / N) * (o.round ? 0.94 : 0.985);
      var w2 = W(t) * wid * 0.5;
      pts.push({ x: X(t) - w2, y: Y(t) });
    }
    pts.push({ x: X(0) - wid * 0.05, y: 1 });

    if (local) return pts;
    var ca = Math.cos(o.ang), sa = Math.sin(o.ang);
    return pts.map(function (p) {
      return { x: o.x + p.x * ca - p.y * sa, y: o.y + p.x * sa + p.y * ca };
    });
  }

  /* ---------- 花瓣 ---------- */
  function drawPetal(ctx, o) {
    var rnd = o.rnd;
    var pts = petalOutline(o);
    var base = { x: o.x, y: o.y };
    var ca = Math.cos(o.ang), sa = Math.sin(o.ang);
    var tip = { x: o.x + (o.bend * o.len) * ca + o.len * sa, y: o.y + (o.bend * o.len) * sa - o.len * ca };

    var c0 = o.color;
    var deep = shift(c0, o.deepH || 0, 5, -18);
    var pale = shift(c0, o.paleH || 0, -3, 6);
    var A = o.alpha == null ? 1 : o.alpha;

    var minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
    pts.forEach(function (p) { minx = Math.min(minx, p.x); maxx = Math.max(maxx, p.x); miny = Math.min(miny, p.y); maxy = Math.max(maxy, p.y); });
    var bw = maxx - minx + 6, bh = maxy - miny + 6;

    ctx.save();
    trace(ctx, pts, true);
    ctx.clip();

    // 底色
    var g = ctx.createLinearGradient(base.x, base.y, tip.x, tip.y);
    g.addColorStop(0, hslA(shift(c0, 0, 4, -10), A));
    g.addColorStop(0.48, hslA(c0, A));
    g.addColorStop(1, hslA(shift(c0, 0, -2, 4), A));
    ctx.fillStyle = g;
    ctx.fillRect(minx - 3, miny - 3, bw, bh);

    // 根部积色
    var rg = ctx.createRadialGradient(base.x + (tip.x - base.x) * 0.05, base.y + (tip.y - base.y) * 0.05, 0,
      base.x, base.y, o.len * 0.62);
    rg.addColorStop(0, hslA(deep, 0.50));
    rg.addColorStop(0.55, hslA(deep, 0.16));
    rg.addColorStop(1, hslA(deep, 0));
    ctx.fillStyle = rg;
    ctx.fillRect(minx - 3, miny - 3, bw, bh);

    // 受光：靠近瓣尖的一道柔光，不落在花瓣中间
    var lx = base.x + (tip.x - base.x) * 0.74 - (tip.y - base.y) * 0.10;
    var ly = base.y + (tip.y - base.y) * 0.74 + (tip.x - base.x) * 0.10;
    var lg = ctx.createRadialGradient(lx, ly, 0, lx, ly, o.len * 0.42);
    lg.addColorStop(0, hslA(pale, 0.18));
    lg.addColorStop(1, hslA(pale, 0));
    ctx.fillStyle = lg;
    ctx.fillRect(minx - 3, miny - 3, bw, bh);

    // 水彩颗粒：随机几点深色沉淀
    var gn = o.grain == null ? 5 : o.grain;
    for (var gi = 0; gi < gn; gi++) {
      var gt = 0.12 + rnd() * 0.72;
      var gx = lerp(base.x, tip.x, gt) + (rnd() - 0.5) * o.wid * 0.55;
      var gy = lerp(base.y, tip.y, gt) + (rnd() - 0.5) * o.wid * 0.55;
      ctx.beginPath();
      ctx.arc(gx, gy, Math.max(0.5, o.len * (0.012 + rnd() * 0.02)), 0, 6.283);
      ctx.fillStyle = hslA(deep, 0.10 + rnd() * 0.10);
      ctx.fill();
    }

    // 边缘积色：几层细描边叠出柔和的边缘加深
    ctx.lineJoin = 'round';
    var edgeCol = shift(c0, 0, 6, -20);
    var layers = [[0.030, 0.16], [0.055, 0.09], [0.085, 0.045]];
    for (var ei = 0; ei < layers.length; ei++) {
      ctx.strokeStyle = hslA(edgeCol, layers[ei][1]);
      ctx.lineWidth = Math.max(1.1, o.len * layers[ei][0]);
      trace(ctx, pts, true);
      ctx.stroke();
    }
    ctx.restore();

    // 用同色把轮廓略向外补一圈，避免填充和墨线之间露出纸白
    ctx.strokeStyle = hslA(shift(c0, 0, 2, -1), A);
    ctx.lineWidth = Math.max(1.7, (o.lw || 1.2) * 1.9);
    ctx.lineJoin = 'round';
    trace(ctx, pts, true);
    ctx.stroke();

    if (o.line !== false) inkVar(ctx, pts, o.lw || 1.2, o.ink || INK, rnd, o.lineAlpha == null ? 0.66 : o.lineAlpha, base, true);

    if (o.veins) {
      var vn = o.veins === true ? 3 : o.veins;
      ctx.strokeStyle = hslA(deep, 0.20);
      ctx.lineWidth = 0.85;
      for (var v = 0; v < vn; v++) {
        var f = (v + 1) / (vn + 1);
        var ex = Xat(o, f), ey = Yat(o, f);
        ctx.beginPath();
        ctx.moveTo(base.x, base.y);
        ctx.quadraticCurveTo(
          base.x + (ex - base.x) * 0.55 + (v % 2 ? 2.5 : -2.5), base.y + (ey - base.y) * 0.60,
          base.x + (ex - base.x) * 0.92, base.y + (ey - base.y) * 0.92
        );
        ctx.stroke();
      }
    }
    if (o.hatch) {
      hatch(ctx, base.x + (tip.x - base.x) * 0.26, base.y + (tip.y - base.y) * 0.26,
        o.ang + 1.15, o.len * 0.30, 3, o.len * 0.06, deep, 0.11);
    }
  }

  function Xat(o, f) {
    var ca = Math.cos(o.ang), sa = Math.sin(o.ang);
    return o.x + (o.bend * o.len * f * f) * ca + (o.len * f) * sa;
  }
  function Yat(o, f) {
    var ca = Math.cos(o.ang), sa = Math.sin(o.ang);
    return o.y + (o.bend * o.len * f * f) * sa - (o.len * f) * ca;
  }

  /* ---------- 花心 ---------- */
  function centerDisc(ctx, x, y, r, col, rnd, o) {
    o = o || {};
    ctx.save();
    var g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
    g.addColorStop(0, hslA(shift(col, 0, 0, 9), 0.98));
    g.addColorStop(0.7, hslA(col, 0.98));
    g.addColorStop(1, hslA(shift(col, 0, 6, -10), 0.98));
    ctx.beginPath();
    for (var i = 0; i <= 22; i++) {
      var a = i / 22 * 6.283;
      var rr = r * (0.93 + 0.08 * Math.sin(a * 5 + 1));
      var px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = rgba(o.ink || INK_D, 0.40);
    ctx.lineWidth = Math.max(0.8, r * 0.08);
    ctx.stroke();
    ctx.fillStyle = rgba(INK_D, 0.20);
    for (var k = 0; k < (o.dots || 9); k++) {
      var aa = rnd() * 6.283, rr2 = rnd() * r * 0.72;
      ctx.beginPath();
      ctx.arc(x + Math.cos(aa) * rr2, y + Math.sin(aa) * rr2, Math.max(0.5, r * 0.05), 0, 6.283);
      ctx.fill();
    }
    ctx.restore();
  }

  function stamens(ctx, x, y, r0, r1, n, col, tipCol, rnd, w) {
    for (var i = 0; i < n; i++) {
      var a = i / n * 6.283 + rnd() * 0.2;
      var ex = x + Math.cos(a) * r1, ey = y + Math.sin(a) * r1;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
      ctx.quadraticCurveTo(
        x + Math.cos(a + 0.14) * (r0 + r1) * 0.5, y + Math.sin(a + 0.14) * (r0 + r1) * 0.5,
        ex, ey
      );
      ctx.strokeStyle = rgba(col, 0.55);
      ctx.lineWidth = w || 0.85;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(ex, ey, Math.max(0.9, (r1 - r0) * 0.14), 0, 6.283);
      ctx.fillStyle = rgba(tipCol, 0.9);
      ctx.fill();
    }
  }

  /* ---------- 花型 ---------- */
  function bloomPeony(ctx, R, rnd, pal) {
    var rings = [
      { n: 6, len: 1.04, wid: 0.94, off: 0.2, lit: 2, bend: 0.26 },
      { n: 6, len: 0.84, wid: 0.76, off: 1.0, lit: -3, bend: 0.34 },
      { n: 7, len: 0.63, wid: 0.55, off: 1.9, lit: -8, bend: 0.42 },
      { n: 5, len: 0.44, wid: 0.39, off: 2.7, lit: -13, bend: 0.48 }
    ];
    rings.forEach(function (rg2, ri) {
      for (var i = 0; i < rg2.n; i++) {
        var a = i / rg2.n * 6.283 + rg2.off + (rnd() - 0.5) * 0.24;
        // 外圈一半花瓣翻过来，露出背面：颜色更深、卷得更开
        var back = ri === 0 && i % 2 === 1;
        drawPetal(ctx, {
          x: Math.cos(a) * R * 0.04 * ri, y: Math.sin(a) * R * 0.04 * ri,
          ang: a, len: R * rg2.len * (0.84 + rnd() * 0.26), wid: R * rg2.wid * (0.84 + rnd() * 0.28),
          bend: (back ? -0.30 : rg2.bend) + (rnd() - 0.5) * 0.2, ruffle: 0.13, round: true,
          color: shift(pal, (rnd() - 0.5) * 5, 2, rg2.lit + (rnd() - 0.5) * 4 - (back ? 9 : 0)),
          lw: 1.35, lineAlpha: 0.52, rnd: rnd, hatch: ri < 2 && i % 2 === 0,
          deepH: 3
        });
      }
    });
    // 花心皱褶
    for (var k = 0; k < 5; k++) {
      var a2 = k / 5 * 6.283 + rnd();
      drawPetal(ctx, {
        x: Math.cos(a2) * R * 0.05, y: Math.sin(a2) * R * 0.05,
        ang: a2, len: R * 0.22 * (0.8 + rnd() * 0.4), wid: R * 0.20,
        bend: 0.3, ruffle: 0.22, round: true,
        color: shift(pal, 0, 4, -12), lw: 1.0, lineAlpha: 0.38, rnd: rnd
      });
    }
    stamens(ctx, 0, 0, R * 0.02, R * 0.10, 12, [52, 34, 46], [44, 46, 58], rnd, 0.65);
  }

  function bloomRose(ctx, R, rnd, pal) {
    var ang0 = rnd() * 6.28;
    for (var ring = 0; ring < 5; ring++) {
      var n = 5 + ring;
      for (var i = 0; i < n; i++) {
        var a = i / n * 6.283 + ang0 + ring * 0.62;
        var len = R * (1.02 - ring * 0.16);
        drawPetal(ctx, {
          x: Math.cos(a) * R * 0.08 * ring, y: Math.sin(a) * R * 0.08 * ring,
          ang: a, len: len * (0.92 + rnd() * 0.16), wid: len * (0.84 + rnd() * 0.18),
          bend: 0.52 + ring * 0.14, ruffle: 0.05, round: true,
          color: shift(pal, 0, 1, 3 - ring * 4),
          lw: 1.2, lineAlpha: 0.48, rnd: rnd, hatch: ring < 2,
          veins: ring > 2 ? 2 : false
        });
      }
    }
    ctx.save();
    ctx.strokeStyle = rgba(INK, 0.48);
    for (var s = 0; s < 3; s++) {
      ctx.beginPath();
      var ra = 0.10 + s * 0.085;
      for (var t = 0; t <= 16; t++) {
        var aa = ang0 + t * 0.36 + s * 1.7;
        var rr = R * (ra * (1 + t * 0.085));
        var px = Math.cos(aa) * rr, py = Math.sin(aa) * rr;
        t ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.lineWidth = 1 - s * 0.15;
      ctx.stroke();
    }
    ctx.restore();
  }

  function bloomRanunculus(ctx, R, rnd, pal) {
    for (var ring = 0; ring < 6; ring++) {
      var n = 7 + Math.floor(ring * 1.2);
      for (var i = 0; i < n; i++) {
        var a = i / n * 6.283 + ring * 0.44 + rnd() * 0.12;
        var len = R * (0.95 - ring * 0.135);
        if (len < R * 0.07) continue;
        drawPetal(ctx, {
          x: Math.cos(a) * R * 0.045 * ring, y: Math.sin(a) * R * 0.045 * ring,
          ang: a, len: len, wid: len * (0.76 + rnd() * 0.16),
          bend: 0.18, ruffle: 0.035, round: true,
          color: shift(pal, 0, 0, (ring % 2 ? 4 : -3) + (rnd() - 0.5) * 4),
          lw: 0.95, lineAlpha: 0.42, rnd: rnd
        });
      }
    }
    centerDisc(ctx, 0, 0, R * 0.085, shift(pal, 2, 8, -22), rnd, { dots: 5 });
  }

  function bloomAnemone(ctx, R, rnd, pal) {
    for (var i = 0; i < 9; i++) {
      var a = i / 9 * 6.283 + rnd() * 0.14;
      drawPetal(ctx, {
        x: 0, y: 0, ang: a, len: R * (0.92 + rnd() * 0.12), wid: R * (0.50 + rnd() * 0.10),
        bend: (rnd() - 0.5) * 0.18, ruffle: 0.045, round: true,
        color: shift(pal, 0, 0, (rnd() - 0.5) * 5),
        lw: 1.2, lineAlpha: 0.46, rnd: rnd, veins: 3, hatch: i % 3 === 0
      });
    }
    centerDisc(ctx, 0, 0, R * 0.150, [344, 22, 34], rnd, { dots: 10 });
    stamens(ctx, 0, 0, R * 0.17, R * 0.31, 22, [40, 30, 40], [40, 50, 68], rnd, 0.8);
  }

  function bloomPoppy(ctx, R, rnd, pal) {
    var conf = [
      { a: 0.28, dx: -0.04, dy: 0.05, len: 1.05, wid: 1.02, lit: 4 },
      { a: 1.86, dx: 0.05, dy: -0.03, len: 1.00, wid: 0.98, lit: 1 },
      { a: 3.42, dx: 0.03, dy: 0.06, len: 1.08, wid: 1.04, lit: -2 },
      { a: 5.02, dx: -0.05, dy: -0.04, len: 0.92, wid: 0.90, lit: 6 }
    ];
    conf.forEach(function (c, i) {
      drawPetal(ctx, {
        x: Math.cos(c.a) * R * 0.10 + c.dx * R, y: Math.sin(c.a) * R * 0.10 + c.dy * R,
        ang: c.a + (rnd() - 0.5) * 0.14,
        len: R * c.len * 0.94, wid: R * c.wid * 0.86,
        bend: (rnd() - 0.5) * 0.22, ruffle: 0.18, round: true,
        color: shift(pal, (rnd() - 0.5) * 7, 0, c.lit), deepH: 4,
        alpha: 1,
        lw: 1.35, lineAlpha: 0.50, rnd: rnd, veins: 5, hatch: i === 1
      });
    });
    // 花心与花丝
    centerDisc(ctx, 0, 0, R * 0.10, [66, 22, 38], rnd, { dots: 7 });
    stamens(ctx, 0, 0, R * 0.10, R * 0.24, 16, [52, 34, 40], [48, 40, 56], rnd, 0.8);
  }

  function bloomCosmos(ctx, R, rnd, pal) {
    for (var i = 0; i < 8; i++) {
      var a = i / 8 * 6.283 + rnd() * 0.10;
      drawPetal(ctx, {
        x: 0, y: 0, ang: a, len: R * (0.97 + rnd() * 0.09), wid: R * (0.34 + rnd() * 0.05),
        bend: 0, ruffle: 0.02, round: true, tipPinch: 0.94,
        color: shift(pal, 0, 1, (rnd() - 0.5) * 4),
        lw: 1.0, lineAlpha: 0.44, rnd: rnd
      });
    }
    centerDisc(ctx, 0, 0, R * 0.155, [44, 58, 56], rnd, { dots: 12 });
    stamens(ctx, 0, 0, R * 0.16, R * 0.22, 12, [44, 56, 46], [40, 58, 66], rnd, 0.75);
  }

  function bloomDahlia(ctx, R, rnd, pal) {
    for (var ring = 0; ring < 5; ring++) {
      var n = 8 + ring * 2;
      for (var i = 0; i < n; i++) {
        var a = i / n * 6.283 + ring * 0.32 + rnd() * 0.10;
        var len = R * (0.98 - ring * 0.165);
        drawPetal(ctx, {
          x: 0, y: 0, ang: a, len: len, wid: len * (0.46 + ring * 0.02),
          bend: 0.16, ruffle: 0.05, round: false,
          color: shift(pal, 0, 2, -ring * 2 + (rnd() - 0.5) * 4),
          lw: 1.0, lineAlpha: 0.46, rnd: rnd, veins: 1, hatch: ring > 2
        });
      }
    }
    centerDisc(ctx, 0, 0, R * 0.075, shift(pal, 0, 6, -20), rnd, { dots: 4 });
  }

  function bloomTulip(ctx, R, rnd, pal) {
    for (var i = 0; i < 3; i++) {
      var a = i / 3 * 6.283 + 0.5;
      drawPetal(ctx, {
        x: 0, y: 0, ang: a, len: R * 0.96, wid: R * 0.64,
        bend: 0.12, ruffle: 0.02, round: true,
        color: shift(pal, 0, 1, i === 0 ? 6 : -3),
        lw: 1.2, lineAlpha: 0.46, rnd: rnd, veins: 3, hatch: i === 1
      });
    }
    var g = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.26);
    g.addColorStop(0, 'rgba(72,50,44,0.30)');
    g.addColorStop(1, 'rgba(72,50,44,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, R * 0.26, 0, 6.28); ctx.fill();
  }

  function bloomBud(ctx, R, rnd, pal) {
    drawPetal(ctx, {
      x: 0, y: 0, ang: -Math.PI / 2, len: R * 1.0, wid: R * 0.54,
      bend: -0.05, ruffle: 0.02, round: true,
      color: pal, lw: 1.1, lineAlpha: 0.5, rnd: rnd, veins: 2
    });
    drawPetal(ctx, {
      x: 0, y: 0, ang: -Math.PI / 2 + 0.48, len: R * 0.84, wid: R * 0.36,
      bend: 0.14, ruffle: 0.02, round: true,
      color: shift(pal, 2, 4, -8), lw: 1.0, lineAlpha: 0.44, rnd: rnd
    });
    // 花萼
    ctx.save();
    ctx.strokeStyle = 'rgba(96,110,72,0.65)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(-R * 0.10, 1);
    ctx.quadraticCurveTo(-R * 0.26, -R * 0.30, -R * 0.16, -R * 0.52);
    ctx.moveTo(R * 0.10, 1);
    ctx.quadraticCurveTo(R * 0.28, -R * 0.26, R * 0.20, -R * 0.46);
    ctx.stroke();
    ctx.restore();
  }

  function tinyFlower(ctx, R, rnd, pal) {
    for (var i = 0; i < 5; i++) {
      var a = i / 5 * 6.283 + rnd() * 0.2;
      drawPetal(ctx, {
        x: 0, y: 0, ang: a, len: R * (0.95 + rnd() * 0.1), wid: R * 0.62,
        bend: 0, ruffle: 0.06, round: true,
        color: pal, lw: 0.95, lineAlpha: 0.42, rnd: rnd
      });
    }
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.17, 0, 6.283);
    ctx.fillStyle = 'rgba(196,158,96,0.95)';
    ctx.fill();
    ctx.strokeStyle = rgba(INK, 0.4);
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }

  /* ---------- 枝叶 ---------- */
  function stem(ctx, x0, y0, x1, y1, bow, w, col, rnd) {
    var mx = (x0 + x1) / 2 + bow * (y1 - y0) * 0.35;
    var my = (y0 + y1) / 2 - bow * (x1 - x0) * 0.35;
    ctx.strokeStyle = rgba(col, 0.92);
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(mx, my, x1, y1);
    ctx.stroke();
    ctx.strokeStyle = rgba(col, 0.20);
    ctx.lineWidth = w * 1.8;
    ctx.beginPath();
    ctx.moveTo(x0 + 0.8, y0 + 0.4);
    ctx.quadraticCurveTo(mx + 0.8, my + 0.4, x1 + 0.8, y1 + 0.4);
    ctx.stroke();
  }

  function leafShapes(ctx, x, y, ang, len, wid, col, rnd, opts) {
    opts = opts || {};
    drawPetal(ctx, {
      x: x, y: y, ang: ang, len: len, wid: wid,
      bend: opts.bend == null ? 0.14 : opts.bend, ruffle: 0.03, round: false,
      color: col, lw: 0.95, lineAlpha: 0.42, rnd: rnd, veins: 3,
      hatch: opts.hatch, ink: LEAF_INK
    });
  }

  function eucalyptus(ctx, R, rnd, pal) {
    var bx = 0, by = R * 0.9, tx = -R * 0.18, ty = -R * 0.92;
    stem(ctx, bx, by, tx, ty, -0.2, R * 0.028, [92, 96, 62], rnd);
    var n = 5;
    for (var i = 0; i < n; i++) {
      var t = 0.18 + i / n * 0.76;
      var px = lerp(bx, tx, t) + Math.sin(t * 3.1) * R * 0.055;
      var py = lerp(by, ty, t);
      var s = R * (0.30 - i * 0.020) * (0.92 + rnd() * 0.22);
      for (var side = -1; side <= 1; side += 2) {
        var a = (side > 0 ? -0.62 : Math.PI + 0.62) - t * 0.12 + (rnd() - 0.5) * 0.16;
        var lx = px + Math.cos(a) * s * 0.55, ly = py + Math.sin(a) * s * 0.55;
        ctx.strokeStyle = 'rgba(104,115,78,0.7)';
        ctx.lineWidth = R * 0.010;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(lx, ly);
        ctx.stroke();
        ctx.save();
        ctx.translate(lx, ly);
        ctx.rotate(a + (rnd() - 0.5) * 0.3);
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 0.68, s * 0.40, 0, 0, 6.283);
        var g = ctx.createRadialGradient(-s * 0.2, -s * 0.22, s * 0.05, 0, 0, s * 0.72);
        g.addColorStop(0, hslA(shift(pal, 0, 0, 12), 0.96));
        g.addColorStop(1, hslA(shift(pal, 0, 4, -7), 0.96));
        ctx.fillStyle = g; ctx.fill();
        ctx.strokeStyle = 'rgba(62,72,46,0.55)';
        ctx.lineWidth = 0.95;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-s * 0.46, 0);
        ctx.lineTo(s * 0.46, 0);
        ctx.strokeStyle = 'rgba(62,72,46,0.28)';
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  function fern(ctx, R, rnd, pal) {
    var bx = 0, by = R * 0.85, tx = R * 0.30, ty = -R * 0.95;
    stem(ctx, bx, by, tx, ty, 0.12, R * 0.018, [96, 92, 60], rnd);
    var n = 14;
    for (var i = 0; i < n; i++) {
      var t = 0.08 + i / n * 0.88;
      var px = lerp(bx, tx, t) + Math.sin(t * 2.4) * R * 0.055;
      var py = lerp(by, ty, t);
      var s = R * 0.24 * (0.5 + 0.85 * Math.sin(Math.PI * Math.min(1, t + 0.14)));
      for (var side = -1; side <= 1; side += 2) {
        var a = (side > 0 ? -0.95 : Math.PI + 0.95) - t * 0.3;
        drawPetal(ctx, {
          x: px, y: py, ang: a, len: s, wid: s * 0.32,
          bend: 0.18, ruffle: 0.04, round: false,
          color: shift(pal, 0, 0, (i % 3) * 2), lw: 0.75, lineAlpha: 0.34,
          rnd: rnd, veins: 1, ink: LEAF_INK
        });
      }
    }
  }

  function grasses(ctx, R, rnd, pal) {
    var blades = [
      { a: -2.55, len: 1.00, bend: 0.14, w: 0.016 },
      { a: -2.24, len: 1.14, bend: 0.20, w: 0.014 },
      { a: -1.95, len: 0.92, bend: 0.10, w: 0.013 },
      { a: 2.55, len: 1.02, bend: -0.16, w: 0.015 },
      { a: 2.86, len: 0.90, bend: -0.12, w: 0.013 }
    ];
    blades.forEach(function (b) {
      var len = R * b.len;
      var ex = Math.cos(b.a) * len, ey = Math.sin(b.a) * len;
      var mx = Math.cos(b.a + b.bend) * len * 0.55, my = Math.sin(b.a + b.bend) * len * 0.55;
      var g = ctx.createLinearGradient(0, 0, ex, ey);
      g.addColorStop(0, hslA(shift(pal, 0, 4, -14), 0.92));
      g.addColorStop(1, hslA(shift(pal, 0, 0, 6), 0.85));
      ctx.beginPath();
      ctx.moveTo(-len * b.w, 0);
      ctx.quadraticCurveTo(mx - len * b.w * 0.6, my, ex, ey);
      ctx.quadraticCurveTo(mx + len * b.w * 0.6, my, len * b.w, 0);
      ctx.closePath();
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = rgba(LEAF_INK, 0.35);
      ctx.lineWidth = 0.8;
      ctx.stroke();
    });
  }

  function leafBranch(ctx, R, rnd, pal) {
    // 一根从花丛里伸出来的小枝，左右交错长叶
    var tipX = R * (0.55 + rnd() * 0.35), tipY = -R * (0.7 + rnd() * 0.25);
    stem(ctx, 0, R * 0.05, tipX, tipY, 0.14, R * 0.016, [100, 108, 70], rnd);
    var n = 5;
    for (var i = 0; i < n; i++) {
      var t = 0.25 + i / n * 0.72;
      var px = lerp(0, tipX, t), py = lerp(R * 0.05, tipY, t);
      var side = i % 2 ? 1 : -1;
      var s2 = R * (0.20 - i * 0.022);
      drawPetal(ctx, {
        x: px, y: py,
        ang: (side > 0 ? -0.45 : Math.PI + 0.45) - 0.55 + (rnd() - 0.5) * 0.2,
        len: s2, wid: s2 * 0.52,
        bend: side * 0.22, ruffle: 0.03, round: false,
        color: shift(pal, 0, 0, (i % 2 ? 5 : -2)), lw: 0.9, lineAlpha: 0.38,
        rnd: rnd, veins: 2, ink: LEAF_INK
      });
    }
  }

  function berries(ctx, R, rnd, pal) {
    for (var i = 0; i < 6; i++) {
      var a = -2.3 + (rnd() - 0.5) * 1.4;
      var d = R * (0.28 + rnd() * 0.55);
      var x = Math.cos(a) * d, y = Math.sin(a) * d;
      stem(ctx, x * 0.3, y * 0.3, x, y, 0.05, R * 0.009, [104, 96, 58], rnd);
      var r = R * (0.052 + rnd() * 0.024);
      var g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
      g.addColorStop(0, hslA(shift(pal, 0, 4, 15), 0.98));
      g.addColorStop(1, hslA(shift(pal, 0, 6, -10), 0.98));
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 6.283);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = 'rgba(78,42,52,0.5)';
      ctx.lineWidth = 0.85;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x - r * 0.3, y - r * 0.34, r * 0.22, 0, 6.283);
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fill();
    }
  }

  /* 单片散叶，用来填缝 */
  function fallenPetal(ctx, R, rnd, pal) {
    drawPetal(ctx, {
      x: 0, y: 0, ang: -Math.PI / 2 + (rnd() - 0.5) * 0.6,
      len: R, wid: R * 0.52, bend: (rnd() - 0.5) * 0.4, ruffle: 0.08, round: true,
      color: pal, lw: 1.0, lineAlpha: 0.45, rnd: rnd, veins: 2
    });
  }

  function leafBed(ctx, R, rnd, pal) {
    var n = 13;
    for (var i = 0; i < n; i++) {
      var a = i / n * 6.283 + 0.18 + (rnd() - 0.5) * 0.12;
      var d = R * (0.42 + rnd() * 0.22);
      var len = R * (0.52 + rnd() * 0.22);
      drawPetal(ctx, {
        x: Math.cos(a) * d * 0.35, y: Math.sin(a) * d * 0.35,
        ang: a + (rnd() - 0.5) * 0.16,
        len: len, wid: len * (0.42 + rnd() * 0.12),
        bend: (rnd() - 0.5) * 0.28, ruffle: 0.05, round: false,
        color: shift(pal, 0, 0, (i % 3) * 3 - 3), lw: 1.0, lineAlpha: 0.4,
        rnd: rnd, veins: 3, ink: LEAF_INK
      });
    }
  }

  function sprigLeaf(ctx, R, rnd, pal) {
    drawPetal(ctx, {
      x: 0, y: 0, ang: -Math.PI / 2, len: R, wid: R * 0.42,
      bend: (rnd() - 0.5) * 0.3, ruffle: 0.04, round: false,
      color: pal, lw: 0.9, lineAlpha: 0.4, rnd: rnd, veins: 3, ink: LEAF_INK
    });
  }

  /* ---------- 配色 ---------- */
  var P = {
    ivory: [352, 24, 95],
    blush: [351, 40, 86],
    rose: [345, 30, 74],
    wine: [343, 27, 54],
    plum: [330, 20, 74],
    mauve: [300, 17, 72],
    coral: [10, 44, 73],
    ochre: [36, 52, 74],
    sage: [96, 17, 63],
    deepSage: [104, 19, 49]
  };

  /* ---------- 构图 ---------- */
  var BLOOMS = [
    // 主花：奶油牡丹（偏左），花心带一点胭脂
    { kind: 'peony', x: -0.060, y: 0.000, r: 0.168, rot: -0.35, z: 6, delay: 0.00, pal: P.ivory },
    // 主花周围的高一层花
    { kind: 'rose', x: 0.150, y: 0.100, r: 0.126, rot: 0.42, z: 6, delay: 0.10, pal: P.rose },
    { kind: 'anemone', x: -0.135, y: -0.175, r: 0.112, rot: -0.20, z: 5, delay: 0.16, pal: P.ivory },
    { kind: 'poppy', x: 0.175, y: -0.115, r: 0.116, rot: 0.35, z: 7, delay: 0.22, pal: P.coral },
    { kind: 'dahlia', x: -0.155, y: 0.175, r: 0.106, rot: 0.22, z: 7, delay: 0.28, pal: P.ochre },
    { kind: 'ranunculus', x: -0.240, y: -0.020, r: 0.104, rot: -0.55, z: 7, delay: 0.32, pal: P.wine },
    // 碎花
    { kind: 'cosmos', x: 0.060, y: 0.245, r: 0.060, rot: 0.20, z: 8, delay: 0.38, pal: P.blush },
    { kind: 'dahlia', x: 0.270, y: 0.155, r: 0.088, rot: -0.35, z: 8, delay: 0.40, pal: P.plum },
    { kind: 'cosmos', x: -0.300, y: 0.090, r: 0.055, rot: -0.30, z: 8, delay: 0.42, pal: P.ivory },
    { kind: 'tiny', x: 0.055, y: -0.250, r: 0.045, rot: 0.50, z: 9, delay: 0.46, pal: P.ivory },
    { kind: 'tiny', x: -0.275, y: -0.160, r: 0.041, rot: -0.40, z: 9, delay: 0.50, pal: P.blush },
    { kind: 'bud', x: 0.245, y: 0.235, r: 0.046, rot: 0.60, z: 9, delay: 0.54, pal: P.wine },
    { kind: 'bud', x: 0.300, y: -0.030, r: 0.040, rot: -0.60, z: 9, delay: 0.58, pal: P.rose }
  ];

  var FOLIAGE = [
    // 叶床：垫底，填满花与花之间的缝
    { kind: 'bed', x: 0.000, y: 0.030, r: 0.330, rot: 0.00, z: 0, pal: P.sage },
    // 外圈叶材（压在花下）
    { kind: 'euc', x: -0.310, y: 0.170, r: 0.160, rot: 2.60, z: 2, pal: P.sage },
    { kind: 'euc', x: 0.300, y: 0.220, r: 0.150, rot: -0.50, z: 2, pal: P.sage },
    { kind: 'branch', x: 0.235, y: -0.230, r: 0.150, rot: -1.05, z: 3, pal: P.deepSage },
    { kind: 'branch', x: -0.250, y: 0.225, r: 0.140, rot: 2.40, z: 3, pal: P.deepSage },
    { kind: 'grass', x: 0.010, y: 0.050, r: 0.265, rot: 0.10, z: 1, pal: P.sage },
    // 叶枝从花缝里探出来
    { kind: 'branch', x: 0.020, y: -0.205, r: 0.130, rot: 1.40, z: 4, pal: P.sage },
    { kind: 'branch', x: 0.240, y: 0.020, r: 0.120, rot: -1.20, z: 4, pal: P.sage },
    { kind: 'branch', x: -0.215, y: 0.105, r: 0.115, rot: -2.10, z: 4, pal: P.sage },
    // 浆果
    { kind: 'berry', x: 0.210, y: 0.250, r: 0.105, rot: 0.25, z: 9, pal: [344, 26, 48] },
    // 落下的花瓣
    { kind: 'fallen', x: 0.330, y: 0.300, r: 0.030, rot: 0.9, z: 10, pal: P.rose },
    { kind: 'fallen', x: -0.330, y: 0.305, r: 0.026, rot: -0.4, z: 10, pal: P.blush },
    { kind: 'fallen', x: 0.075, y: 0.315, r: 0.024, rot: 1.9, z: 10, pal: P.ivory }
  ];

  function buildLayer(kind, R, rnd, pal, rot) {
    var size = Math.ceil(R * 3.0);
    var cv = document.createElement('canvas');
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = cv.height = Math.ceil(size * dpr);
    var c = cv.getContext('2d');
    c.scale(dpr, dpr);
    c.translate(size / 2, size / 2);
    c.rotate(rot || 0);
    c.lineJoin = 'round';

    if (kind === 'peony') bloomPeony(c, R, rnd, pal);
    else if (kind === 'rose') bloomRose(c, R, rnd, pal);
    else if (kind === 'ranunculus') bloomRanunculus(c, R, rnd, pal);
    else if (kind === 'anemone') bloomAnemone(c, R, rnd, pal);
    else if (kind === 'poppy') bloomPoppy(c, R, rnd, pal);
    else if (kind === 'cosmos') bloomCosmos(c, R, rnd, pal);
    else if (kind === 'dahlia') bloomDahlia(c, R, rnd, pal);
    else if (kind === 'bud') bloomBud(c, R, rnd, pal);
    else if (kind === 'tiny') tinyFlower(c, R, rnd, pal);
    else if (kind === 'euc') eucalyptus(c, R, rnd, pal);
    else if (kind === 'fern') fern(c, R, rnd, pal);
    else if (kind === 'grass') grasses(c, R, rnd, pal);
    else if (kind === 'gyps') babysBreath(c, R, rnd, pal);
    else if (kind === 'berry') berries(c, R, rnd, pal);
    else if (kind === 'sprig') sprigLeaf(c, R, rnd, pal);
    else if (kind === 'branch') leafBranch(c, R, rnd, pal);
    else if (kind === 'bed') leafBed(c, R, rnd, pal);
    else if (kind === 'fallen') fallenPetal(c, R, rnd, pal);

    // 统一光源：左上提亮、右下压暗（只作用在已有像素上）
    if (['peony', 'rose', 'ranunculus', 'anemone', 'poppy', 'cosmos', 'dahlia', 'bud', 'tiny'].indexOf(kind) >= 0) {
      c.save();
      c.globalCompositeOperation = 'source-atop';
      var lg = c.createRadialGradient(-R * 0.40, -R * 0.46, R * 0.06, R * 0.22, R * 0.34, R * 1.25);
      lg.addColorStop(0, 'rgba(255,252,244,0.10)');
      lg.addColorStop(0.42, 'rgba(255,250,240,0.02)');
      lg.addColorStop(0.72, 'rgba(96,48,60,0.05)');
      lg.addColorStop(1, 'rgba(90,42,54,0.16)');
      c.fillStyle = lg;
      c.fillRect(-size / 2, -size / 2, size, size);
      c.restore();
    }

    return { canvas: cv, size: size, dpr: dpr };
  }

  function mount(canvas) {
    if (!canvas || canvas.__bloom) return;
    canvas.__bloom = true;

    var ctx = canvas.getContext('2d');
    var W = 0, H = 0, DPR = 1, S = 1;
    var layers = [];
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var t0 = 0, raf = 0, started = false;

    function build() {
      layers = [];
      var K = 1.06;
      var i;
      for (i = 0; i < FOLIAGE.length; i++) {
        var f = FOLIAGE[i];
        layers.push({
          kind: f.kind, z: f.z, x: f.x * S * K, y: f.y * S * K, delay: 0,
          rot: f.rot || 0, layer: buildLayer(f.kind, f.r * S * K, rng(1000 + i * 37), f.pal, f.rot)
        });
      }
      for (i = 0; i < BLOOMS.length; i++) {
        var b = BLOOMS[i];
        layers.push({
          kind: b.kind, z: b.z, x: b.x * S * K, y: b.y * S * K, delay: b.delay,
          rot: b.rot || 0, layer: buildLayer(b.kind, b.r * S * K, rng(2000 + i * 53), b.pal, b.rot)
        });
      }
      layers.sort(function (a, b) { return a.z - b.z; });
    }

    function render(p) {
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.clearRect(0, 0, W, H);
      var cx = W * 0.500, cy = H * 0.415;

      var sh = ctx.createRadialGradient(cx, cy + S * 0.05, S * 0.04, cx, cy + S * 0.05, S * 0.42);
      sh.addColorStop(0, 'rgba(118,60,75,0.04)');
      sh.addColorStop(1, 'rgba(118,60,75,0)');
      ctx.fillStyle = sh;
      ctx.beginPath();
      ctx.ellipse(cx, cy + S * 0.035, S * 0.36, S * 0.31, 0, 0, 6.283);
      ctx.fill();

      for (var i = 0; i < layers.length; i++) {
        var L = layers[i];
        var dur = 1 - Math.max(0.2, L.delay);
        var lp = clamp((p - L.delay) / dur, 0, 1);
        if (lp <= 0) continue;
        var e = 1 - Math.pow(1 - lp, 3);
        var sc = 0.55 + 0.45 * (L.delay ? (1 + 1.3 * Math.pow(lp - 1, 3) + 0.3 * Math.pow(lp - 1, 2)) : e);
        var a = clamp(lp * 2.6, 0, 1);
        var sz = L.layer.size;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(cx + L.x, cy + L.y);
        ctx.rotate(L.rot + (1 - e) * (L.kind === 'grass' ? 0.22 : -0.10));
        ctx.scale(sc, sc);
        ctx.shadowColor = 'rgba(96,52,62,' + (0.20 * a) + ')';
        ctx.shadowBlur = S * 0.022;
        ctx.shadowOffsetX = S * 0.006;
        ctx.shadowOffsetY = S * 0.010;
        ctx.drawImage(L.layer.canvas, -sz / 2, -sz / 2, sz, sz);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    function progress() {
      if (reduce) return 1;
      if (!t0) return 0;
      return clamp((performance.now() - t0) / 2400, 0, 1);
    }

    function loop() {
      var p = progress();
      render(p);
      if (p < 1) raf = requestAnimationFrame(loop);
    }

    function resize() {
      var rect = canvas.getBoundingClientRect();
      W = Math.max(1, rect.width);
      H = Math.max(1, rect.height);
      DPR = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(W * DPR);
      canvas.height = Math.round(H * DPR);
      S = Math.min(W, H);
      build();
      render(progress());
    }

    function startBloom() {
      started = true;
      if (reduce) { render(1); return; }
      t0 = performance.now();
      loop();
    }

    resize();
    canvas.__start = startBloom;
    window.addEventListener('resize', function () {
      clearTimeout(canvas.__rt);
      canvas.__rt = setTimeout(function () { resize(); }, 160);
    });

    if (reduce) render(1);
    setTimeout(function () { if (!started) startBloom(); }, 6000);
  }

  window.mountBloom = mount;
  window.startBloom = function () {
    Array.prototype.forEach.call(document.querySelectorAll('canvas.bloom-canvas'), function (c) {
      if (c.__start) c.__start();
    });
  };
})();
