/*
 * "Main results, visualized": a click-through animation of the JMP's main results.
 *
 *   Markup  _includes/jmp-viz.html          Text   _data/jmp_viz.yml
 *   Data    assets/data/jmp-curves.json     (built by _viz/build_curves.py)
 *   Styles  "JMP visualization" block in assets/css/style.scss
 *
 * Each step is a target state (which curves are shown, dimmed or hidden, and
 * which annotations are on). Moving between steps animates from the current
 * state to the target, so Back, Next and the step pips all share one code path.
 * No dependencies.
 */
(() => {
  'use strict';

  const root = document.querySelector('[data-jv]');
  if (!root) return;

  const NS = 'http://www.w3.org/2000/svg';
  const X_MAX = 700000;
  const Y_MAX = 1.0;         // as in the paper's figures; leaves the top for the definition box
  const DIM = 0.28;
  const DRAW_MS = 1150;      // left-to-right reveal of a curve
  const STAGGER_MS = 300;    // gap between curve groups drawn in the same step
  const FADE_MS = 550;       // matches .jv-series opacity transition
  const reduceMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ---------- What is drawn ---------- */

  // Drawing order: first is bottom. `group` draws series together; `tip` names
  // the series in the hover read-out.
  const SERIES = [
    { key: 'kenya', color: 'ink', bold: true, tip: 'Kenya 2021' },
    { key: 't2020', color: 'muted', kind: 'vline', style: 'dotted', reveal: 'fade' },
    { key: 'ha_ci', color: 'ha', kind: 'band', group: 'ha' },
    { key: 'naive', color: 'naive', tip: 'Naïve planner' },
    { key: 'hu', color: 'hu', tip: 'Horizontally utilitarian' },
    { key: 'hu_ext', color: 'hu', style: 'dashed', group: 'hu_var', tip: 'Utilitarian, ext. margin & admin' },
    { key: 'hu_high', color: 'hu', style: 'dotted', group: 'hu_var', tip: 'Utilitarian, high ext. & admin' },
    { key: 'ha_ext', color: 'ha', style: 'dashed', group: 'ha_var', tip: 'Averse, ext. margin & admin' },
    { key: 'ha_high', color: 'ha', style: 'dotted', group: 'ha_var', tip: 'Averse, high ext. & admin' },
    { key: 'ha', color: 'ha', bold: true, group: 'ha', tip: 'Horizontally averse' },
  ];

  const LEGEND = [
    { key: 'kenya', label: 'Tax schedule, Kenya 2021', color: 'ink' },
    { key: 'naive', label: 'Naïve planner', color: 'naive' },
    { key: 'hu', label: 'Horizontally utilitarian planner', color: 'hu' },
    { key: 'ha', label: 'Horizontally averse planner (empirical weights)', color: 'ha' },
    { key: 'ha_ci', label: '95% CI', color: 'ha', kind: 'band' },
    { key: 't2020', label: 'Exemption threshold, 2020', color: 'muted', kind: 'vline' },
    { key: 'hu_ext', label: 'w. extensive margin & admin cost', color: 'muted', style: 'dashed' },
    { key: 'hu_high', label: 'w. high extensive margin & high admin cost', color: 'muted', style: 'dotted' },
  ];

  // Keep in the same order as the steps in _data/jmp_viz.yml.
  const STEPS = [
    {
      show: { kenya: 1 },
      notes: ['kenya'],
      desc: "Kenya's 2021 income tax schedule: a zero marginal rate on the first 288,000 Ksh a year, 25% up to 388,000 Ksh and 30% above. 80% of workers earn below the exemption threshold.",
    },
    {
      show: { kenya: 1, naive: 1 },
      notes: ['naive'],
      desc: "Added: the naïve planner's optimal schedule, with positive marginal rates from the first shilling, peaking at about 42%.",
    },
    {
      show: { kenya: 1, naive: DIM, hu: 1 },
      notes: ['hu'],
      desc: "Added: the horizontally utilitarian planner, with marginal rates of 70 to 75% at the bottom, even further from Kenya's schedule.",
    },
    {
      show: { kenya: 1, naive: DIM, hu: DIM, ha_ci: 1, ha: 1, t2020: 1 },
      notes: ['ha', 't2020'],
      desc: "Added: the horizontally averse planner using empirically measured social preferences over horizontal inequality, with a zero marginal rate up to about 155,000 Ksh, close to Kenya's 2020 threshold of about 162,000 Ksh.",
    },
    {
      show: { kenya: 1, hu: DIM, ha: DIM, t2020: 1, hu_ext: 1, hu_high: 1, ha_ext: 1, ha_high: 1 },
      notes: ['frictions'],
      desc: 'Added: schedules with extensive-margin responses and administrative costs. Without horizontal inequality aversion they give exemptions of only 22,000 to 33,000 Ksh; with it, 181,000 to 196,000 Ksh.',
    },
  ];

  // Arrows and labels. `draw` adds the marks and returns the in-chart label;
  // on narrow screens the label moves under the chart as `callout`.
  function makeNotes() {
    const m = D.marks;
    const s = D.series;
    const k = (v) => fmt(Math.round(v / 1000) * 1000);
    return {
      kenya: {
        color: 'ink',
        callout: `Exempt: the first ${k(m.kenya2021)} Ksh a year, covering 80% of workers.`,
        draw(g) {
          const y = L.y(0.075);
          span(g, L.x(0), L.x(m.kenya2021), y, 'ink');
          return {
            x: (L.x(0) + L.x(m.kenya2021)) / 2, y: y - 10, anchor: 'middle', valign: 'bottom',
            lines: [[`Exemption: first ${k(m.kenya2021)} Ksh/yr`, true], ['covers 80% of workers']],
          };
        },
      },
      naive: {
        color: 'ink2',
        callout: 'No exemption: the naïve planner taxes from the first shilling.',
        draw(g) {
          const tx = L.x(72000);
          const ty = L.y(0.6);
          const tipX = L.x(10000);
          const tipY = L.y(at(s.naive, 10000)) - 7;
          curve(g, tx - 7, ty, tipX, tipY, 'ink2');
          return { x: tx, y: ty, anchor: 'start', valign: 'middle', lines: [['No exemption:', true], ['taxed from the first shilling']] };
        },
      },
      hu: {
        color: 'ink2',
        callout: 'Informality alone pushes rates on low earners even higher.',
        draw(g) {
          const x = L.x(110000);
          const y0 = L.y(at(s.naive, 110000)) - 7;
          const y1 = L.y(at(s.hu, 110000)) + 7;
          vArrow(g, x, y0, y1, 'ink2');
          return { x: x + 9, y: (y0 + y1) / 2, anchor: 'start', valign: 'middle', lines: [['Informality alone:', true], ['even higher rates at the bottom']] };
        },
      },
      ha: {
        color: 'ha',
        callout: `Prescribed exemption: about ${k(m.ha)} Ksh a year.`,
        draw(g) {
          const y = L.y(0.075);
          span(g, L.x(0), L.x(m.ha), y, 'ha');
          return {
            x: (L.x(0) + L.x(m.ha)) / 2, y: y - 10, anchor: 'middle', valign: 'bottom',
            lines: [['Prescribed', true], ['exemption', true], [`≈ ${k(m.ha)} Ksh`]],
          };
        },
      },
      t2020: {
        color: 'muted',
        dotted: true,
        callout: `Dotted line: Kenya's 2020 exemption threshold, about ${k(m.t2020)} Ksh a year.`,
        draw() {
          // Bottom right of the dotted line, level with the prescribed-exemption
          // label on its left, so the two numbers read side by side.
          return {
            x: L.x(m.t2020) + 8, y: L.y(0.075) - 10, anchor: 'start', valign: 'bottom',
            lines: [["Kenya's 2020", true], ['threshold', true], [`≈ ${k(m.t2020)} Ksh`]],
          };
        },
      },
      frictions: {
        color: 'hu',
        callout: `On their own, these give exemptions of only ${k(m.hu_ext)}–${k(m.hu_high)} Ksh (ochre). With horizontal inequality aversion: ${k(m.ha_ext)}–${k(m.ha_high)} Ksh.`,
        draw(g) {
          const y = L.y(0.075);
          span(g, L.x(0), L.x(m.hu_high), y, 'hu');
          return {
            x: L.x(m.hu_high) + 8, y: y + 4, anchor: 'start', valign: 'bottom',
            lines: [['On their own:', true], ['exemptions of only'], [`${Math.round(m.hu_ext / 1000)}k–${Math.round(m.hu_high / 1000)}k Ksh`]],
          };
        },
      },
    };
  }

  /* ---------- Elements and state ---------- */

  const $ = (sel) => root.querySelector(sel);
  const $$ = (sel) => Array.from(root.querySelectorAll(sel));
  // The toggle lives on the card's link line, outside the panel.
  const toggle = document.querySelector('[data-jv-toggle]');
  const collapse = $('.jv-collapse');
  const panel = $('.jv-panel');
  const chartEl = $('.jv-chart');
  const legendEl = $('.jv-legend');
  const calloutsEl = $('.jv-callouts');
  const headlines = $$('.jv-headline');
  const textsEl = $('.jv-texts');
  const stepNum = $('.jv-step-num');
  const sources = $$('.jv-source');
  const defs = $$('.jv-def');
  const pips = $$('.jv-pip');
  const prevBtn = $('.jv-prev');
  const nextBtn = $('.jv-next');
  const live = $('.jv-sr');
  const uid = 'jv' + Math.random().toString(36).slice(2, 7);

  let D = null;              // data
  let L = null;              // layout (scales) of the current render
  let cur = 0;               // current step
  let built = false;
  let isOpen = false;
  let nodes = {};            // series key -> { g, rect }
  let noteNodes = {};        // note key -> <g>
  let svgRoot = null;
  let cross = null;
  let tip = null;
  let legendKeys = {};
  let tipTimer = 0;
  const state = {};          // series key -> { op, prog, timer }
  SERIES.forEach((s) => { state[s.key] = { op: 0, prog: 0, timer: 0 }; });

  /* ---------- Small helpers ---------- */

  const fmt = (v) => v.toLocaleString('en-US');
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

  function svg(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    for (const a in attrs) n.setAttribute(a, attrs[a]);
    if (parent) parent.appendChild(n);
    return n;
  }

  // Linear interpolation on a polyline sorted by x; vertical jumps take the upper value.
  function at(pts, x) {
    if (x < pts[0][0] || x > pts[pts.length - 1][0]) return null;
    let lo = 0;
    let hi = pts.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (pts[mid][0] <= x) lo = mid; else hi = mid;
    }
    const [x0, y0] = pts[lo];
    const [x1, y1] = pts[hi];
    return x1 === x0 ? y1 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }

  const kenyaRate = (x) => (x < 288000 ? 0 : x < 388000 ? 0.25 : 0.3);

  /* ---------- Tweens (requestAnimationFrame) ---------- */

  let tweens = [];
  let raf = 0;
  function tween(dur, delay, fn) {
    tweens.push({ t0: performance.now() + delay, dur, fn });
    if (!raf) raf = requestAnimationFrame(tick);
  }
  function tick(now) {
    raf = 0;
    tweens = tweens.filter((tw) => {
      if (now < tw.t0) return true;
      const p = tw.dur ? clamp((now - tw.t0) / tw.dur, 0, 1) : 1;
      tw.fn(ease(p));
      return p < 1;
    });
    if (tweens.length) raf = requestAnimationFrame(tick);
  }
  function finishTweens() {
    tweens.forEach((tw) => tw.fn(1));
    tweens = [];
  }

  /* ---------- Layout and rendering ---------- */

  function layout(w) {
    const narrow = w < 470;
    const m = { l: narrow ? 34 : 40, r: narrow ? 12 : 24, t: 30, b: 44 };
    const h = Math.round(clamp(w * (narrow ? 1.02 : 0.65), 310, 460));
    const pw = w - m.l - m.r;
    const ph = h - m.t - m.b;
    return {
      w, h, m, pw, ph, narrow,
      x: (v) => m.l + (v / X_MAX) * pw,
      y: (v) => m.t + (1 - v / Y_MAX) * ph,
      xinv: (px) => ((px - m.l) / pw) * X_MAX,
    };
  }

  const toPath = (pts) => 'M' + pts.map((p) => L.x(p[0]).toFixed(1) + ',' + L.y(p[1]).toFixed(1)).join('L');

  function build() {
    const w = Math.round(chartEl.clientWidth);
    if (!w) return false;
    L = layout(w);
    chartEl.textContent = '';
    nodes = {};
    noteNodes = {};

    svgRoot = svg('svg', { viewBox: `0 0 ${L.w} ${L.h}`, width: L.w, height: L.h, role: 'img' });
    const svgDefs = svg('defs', {}, svgRoot);
    chartEl.appendChild(svgRoot);

    // Grid, ticks and axis titles
    const grid = svg('g', { class: 'jv-grid' }, svgRoot);
    for (let i = 0; i <= Math.round(Y_MAX / 0.2); i++) {
      const v = i * 0.2;
      const y = L.y(v);
      if (i) svg('line', { x1: L.m.l, x2: L.m.l + L.pw, y1: y, y2: y }, grid);
      svg('text', { x: L.m.l - 7, y, dy: '0.32em', 'text-anchor': 'end', class: 'jv-tick' }, svgRoot).textContent = Math.round(v * 100) + '%';
    }
    const xStep = L.narrow ? 200000 : 100000;
    for (let v = 0; v <= X_MAX; v += xStep) {
      const x = L.x(v);
      svg('line', { x1: x, x2: x, y1: L.y(0), y2: L.y(0) + 4, class: 'jv-tickmark' }, svgRoot);
      svg('text', { x, y: L.y(0) + 17, 'text-anchor': 'middle', class: 'jv-tick' }, svgRoot).textContent =
        v === 0 ? '0' : L.narrow ? v / 1000 + 'k' : fmt(v);
    }
    svg('line', { x1: L.m.l, x2: L.m.l + L.pw, y1: L.y(0), y2: L.y(0), class: 'jv-baseline' }, svgRoot);
    svg('text', { x: L.m.l + L.pw / 2, y: L.h - 5, 'text-anchor': 'middle', class: 'jv-axis-title' }, svgRoot).textContent = 'Gross income (Ksh / year)';
    svg('text', { x: 0, y: 13, class: 'jv-axis-title' }, svgRoot).textContent = 'Marginal tax rate';

    // Series, each revealed through its own clip rectangle
    const plot = svg('g', { class: 'jv-plot' }, svgRoot);
    SERIES.forEach((s) => {
      const clip = svg('clipPath', { id: `${uid}-c-${s.key}` }, svgDefs);
      const rect = svg('rect', { x: L.m.l - 6, y: 0, height: L.h, width: 0 }, clip);
      const g = svg('g', { class: 'jv-series', 'clip-path': `url(#${uid}-c-${s.key})` }, plot);
      const cls = (s.style ? ' jv-' + s.style : '') + (s.bold ? ' jv-bold' : '');
      if (s.kind === 'band') {
        const b = D.band.ha_ci;
        const d = toPath(b.upper) + 'L' + toPath(b.lower.slice().reverse()).slice(1) + 'Z';
        svg('path', { d, class: 'jv-band jv-f-' + s.color }, g);
      } else if (s.kind === 'vline') {
        const x = L.x(D.marks.t2020);
        svg('line', { x1: x, x2: x, y1: L.y(0), y2: L.y(Y_MAX), class: `jv-line jv-s-${s.color}${cls}` }, g);
      } else {
        svg('path', { d: toPath(D.series[s.key]), class: `jv-line jv-s-${s.color}${cls}` }, g);
      }
      nodes[s.key] = { g, rect };
    });

    // Annotations
    const notesG = svg('g', { class: 'jv-notes', 'aria-hidden': 'true' }, svgRoot);
    const notes = makeNotes();
    Object.keys(notes).forEach((key) => {
      const g = svg('g', { class: 'jv-note' }, notesG);
      const label = notes[key].draw(g);
      if (label && !L.narrow) placeLabel(g, label);
      noteNodes[key] = g;
    });
    buildCallouts(notes);
    placeDefs();

    // Hover read-out
    cross = svg('line', { class: 'jv-cross', y1: L.m.t, y2: L.y(0), x1: 0, x2: 0 }, svgRoot);
    const hit = svg('rect', { class: 'jv-hit', x: L.m.l, y: L.m.t, width: L.pw, height: L.ph }, svgRoot);
    hit.addEventListener('pointermove', onPointer);
    hit.addEventListener('pointerdown', onPointer);
    hit.addEventListener('pointerleave', hideTip);
    hit.addEventListener('pointercancel', hideTip);
    tip = document.createElement('div');
    tip.className = 'jv-tip';
    tip.setAttribute('aria-hidden', 'true');
    chartEl.appendChild(tip);

    built = true;
    return true;
  }

  function placeLabel(g, o) {
    const lh = 15.5;
    const n = o.lines.length;
    let y0;
    if (o.valign === 'bottom') y0 = o.y - (n - 1) * lh;
    else if (o.valign === 'top') y0 = o.y + lh * 0.75;
    else y0 = o.y - ((n - 1) * lh) / 2 + 4.5;
    const t = svg('text', { x: o.x, y: y0, 'text-anchor': o.anchor || 'start' }, g);
    o.lines.forEach(([str, strong], i) => {
      const ts = svg('tspan', { x: o.x, dy: i ? lh : 0 }, t);
      if (strong) ts.setAttribute('class', 'jv-strong');
      ts.textContent = str;
    });
    // Keep the label inside the plot area.
    const bb = t.getBBox();
    const minX = L.m.l + 3;
    const maxX = L.m.l + L.pw - 3;
    let dx = 0;
    if (bb.x < minX) dx = minX - bb.x;
    else if (bb.x + bb.width > maxX) dx = maxX - bb.x - bb.width;
    if (dx) t.setAttribute('transform', `translate(${dx.toFixed(1)},0)`);
  }

  function head(g, x, y, ang, color) {
    const s = 6.5;
    const a = 0.48;
    const p1 = [x - s * Math.cos(ang - a), y - s * Math.sin(ang - a)];
    const p2 = [x - s * Math.cos(ang + a), y - s * Math.sin(ang + a)];
    svg('path', { d: `M${p1[0].toFixed(1)},${p1[1].toFixed(1)}L${x.toFixed(1)},${y.toFixed(1)}L${p2[0].toFixed(1)},${p2[1].toFixed(1)}`, class: 'jv-arrow jv-s-' + color }, g);
  }
  // Two-headed horizontal arrow marking an income range.
  function span(g, x0, x1, y, color) {
    const a = x0 + 1.5;
    const b = x1 - 1.5;
    svg('line', { x1: a, x2: b, y1: y, y2: y, class: 'jv-arrow jv-s-' + color }, g);
    if (b - a > 16) {
      head(g, a, y, Math.PI, color);
      head(g, b, y, 0, color);
    }
    svg('line', { x1: x1, x2: x1, y1: y - 5, y2: y + 5, class: 'jv-arrow jv-s-' + color }, g);
  }
  function vArrow(g, x, yFrom, yTo, color) {
    svg('line', { x1: x, x2: x, y1: yFrom, y2: yTo, class: 'jv-arrow jv-s-' + color }, g);
    head(g, x, yTo, yTo < yFrom ? -Math.PI / 2 : Math.PI / 2, color);
  }
  // Leaves the label horizontally, arrives at the target from above.
  function curve(g, x1, y1, x2, y2, color) {
    svg('path', { d: `M${x1.toFixed(1)},${y1.toFixed(1)}Q${x2.toFixed(1)},${y1.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`, class: 'jv-arrow jv-s-' + color }, g);
    head(g, x2, y2, y2 > y1 ? Math.PI / 2 : -Math.PI / 2, color);
  }

  function lineKey(color, style, kind) {
    const k = svg('svg', { viewBox: '0 0 22 12', 'aria-hidden': 'true' });
    if (kind === 'band') svg('rect', { x: 1, y: 2, width: 20, height: 8, rx: 2, class: 'jv-band jv-f-' + color }, k);
    else if (kind === 'vline') svg('line', { x1: 11, x2: 11, y1: -1, y2: 13, class: 'jv-line jv-dotted jv-s-' + color }, k);
    else svg('line', { x1: 2, x2: 20, y1: 6, y2: 6, class: `jv-line jv-s-${color}${style ? ' jv-' + style : ''}` }, k);
    return k;
  }

  function buildLegend() {
    legendEl.textContent = '';
    legendKeys = {};
    LEGEND.forEach((it) => {
      const span = document.createElement('span');
      span.className = 'jv-key';
      span.hidden = true;
      span.appendChild(lineKey(it.color, it.style, it.kind));
      span.appendChild(document.createTextNode(it.label));
      legendEl.appendChild(span);
      legendKeys[it.key] = span;
    });
  }

  function buildCallouts(notes) {
    calloutsEl.textContent = '';
    calloutsEl.hidden = !L.narrow;
    if (!L.narrow) return;
    STEPS.forEach((st, i) => {
      const div = document.createElement('div');
      div.className = 'jv-callout';
      div.dataset.step = i;
      st.notes.forEach((key) => {
        const n = notes[key];
        const p = document.createElement('p');
        const k = lineKey(n.color, n.dotted ? 'dotted' : '', n.dotted ? 'vline' : '');
        k.setAttribute('class', 'jv-key-line');
        p.appendChild(k);
        p.appendChild(document.createTextNode(n.callout));
        div.appendChild(p);
      });
      calloutsEl.appendChild(div);
    });
  }

  // Definition boxes: over the empty top-right of the plot when the chart is
  // wide enough for the box to clear the curves, otherwise under the chart.
  function placeDefs() {
    const overlay = L.pw >= 560;
    defs.forEach((d) => {
      d.classList.remove('is-overlay', 'is-inline', 'is-on');
      d.removeAttribute('style');
      d.setAttribute('aria-hidden', 'true');
      if (overlay) {
        d.classList.add('is-overlay');
        d.style.width = Math.min(Math.round(L.pw * 0.62), 390) + 'px';
        d.style.top = L.m.t + 4 + 'px';
        d.style.right = L.m.r + 4 + 'px';
        chartEl.appendChild(d);
      } else {
        d.classList.add('is-inline');
        calloutsEl.after(d);
      }
    });
  }

  // Animate the text card to the active headline's height; the chart below
  // moves with it, while the controls above stay put.
  function fitText(n) {
    if (headlines[n]) textsEl.style.height = headlines[n].offsetHeight + 'px';
  }

  /* ---------- Steps ---------- */

  function setClip(key, p) {
    nodes[key].rect.setAttribute('width', ((L.pw + 12) * p).toFixed(1));
  }

  function applyChart(n, animate) {
    const step = STEPS[n];
    finishTweens();
    const groups = {};
    let drawn = 0;
    SERIES.forEach((s) => {
      const st = state[s.key];
      const target = step.show[s.key] || 0;
      clearTimeout(st.timer);
      if (target > 0) {
        if (animate && st.prog < 1 && s.reveal !== 'fade') {
          const grp = s.group || s.key;
          if (!(grp in groups)) groups[grp] = drawn++;
          st.prog = 0;
          setClip(s.key, 0);
          tween(DRAW_MS, groups[grp] * STAGGER_MS, (p) => { st.prog = p; setClip(s.key, p); });
        } else {
          st.prog = 1;
          setClip(s.key, 1);
        }
      } else if (animate && st.op > 0) {
        // Fade out, then rewind so the curve draws again if it comes back.
        st.timer = setTimeout(() => { st.prog = 0; setClip(s.key, 0); }, FADE_MS + 50);
      } else {
        st.prog = 0;
        setClip(s.key, 0);
      }
      st.op = target;
      nodes[s.key].g.style.opacity = target;
    });

    const noteDelay = !animate ? 0 : drawn ? (drawn - 1) * STAGGER_MS + DRAW_MS * 0.7 : 150;
    Object.keys(noteNodes).forEach((key) => {
      const on = step.notes.includes(key);
      noteNodes[key].classList.toggle('is-on', on);
      noteNodes[key].style.transitionDelay = on ? noteDelay + 'ms' : '0ms';
    });
    defs.forEach((d) => {
      const on = +d.dataset.step === n;
      d.classList.toggle('is-on', on);
      d.setAttribute('aria-hidden', on ? 'false' : 'true');
      if (d.classList.contains('is-overlay')) d.style.transitionDelay = on ? noteDelay + 'ms' : '0ms';
    });
    // aria-label rather than <title>: screen readers get it, but hovering the
    // chart does not pop up a native tooltip.
    svgRoot.setAttribute('aria-label', step.desc);
  }

  function updateLegend(n, animate) {
    const step = STEPS[n];
    LEGEND.forEach((it) => {
      const el = legendKeys[it.key];
      const op = step.show[it.key] || 0;
      const wasHidden = el.hidden;
      el.hidden = op === 0;
      el.classList.toggle('is-dim', op > 0 && op < 1);
      el.classList.remove('is-new');
      if (animate && wasHidden && op > 0) {
        void el.offsetWidth; // restart the animation
        el.classList.add('is-new');
      }
    });
  }

  function updateChrome(n) {
    const activate = (list) => list.forEach((el, i) => {
      const on = i === n;
      el.classList.toggle('is-active', on);
      el.setAttribute('aria-hidden', on ? 'false' : 'true');
    });
    activate(headlines);
    fitText(n);
    activate(sources);
    if (!calloutsEl.hidden) activate(Array.from(calloutsEl.children));
    pips.forEach((p, i) => {
      p.classList.toggle('is-active', i === n);
      p.classList.toggle('is-done', i < n);
      if (i === n) p.setAttribute('aria-current', 'step'); else p.removeAttribute('aria-current');
    });
    stepNum.textContent = n + 1;
    prevBtn.disabled = n === 0;
    const last = n === STEPS.length - 1;
    nextBtn.innerHTML = last ? 'Start over &#8635;' : 'Next &rarr;';
    nextBtn.setAttribute('aria-label', last ? 'Start over from step 1' : 'Next step');
    const text = headlines[n] ? headlines[n].textContent.trim() : '';
    live.textContent = `Step ${n + 1} of ${STEPS.length}. ${text} ${STEPS[n].desc}`;
  }

  function go(n, animate = true) {
    cur = clamp(n, 0, STEPS.length - 1);
    const anim = animate && !reduceMotion;
    hideTip();
    if (built) {
      if (!anim) panel.classList.add('jv-instant');
      applyChart(cur, anim);
      updateLegend(cur, anim);
      if (!anim) {
        void panel.offsetWidth;
        requestAnimationFrame(() => panel.classList.remove('jv-instant'));
      }
    }
    updateChrome(cur);
  }

  // Hide every curve and note so the next step draws from scratch.
  function reset() {
    if (!built) return;
    panel.classList.add('jv-instant');
    finishTweens();
    SERIES.forEach((s) => {
      const st = state[s.key];
      clearTimeout(st.timer);
      st.op = 0;
      st.prog = 0;
      nodes[s.key].g.style.opacity = 0;
      setClip(s.key, 0);
    });
    Object.values(noteNodes).forEach((g) => g.classList.remove('is-on'));
    defs.forEach((d) => d.classList.remove('is-on'));
    LEGEND.forEach((it) => { legendKeys[it.key].hidden = true; });
    void panel.offsetWidth;
    panel.classList.remove('jv-instant');
  }

  /* ---------- Hover read-out ---------- */

  function onPointer(e) {
    if (!built) return;
    clearTimeout(tipTimer);
    const r = svgRoot.getBoundingClientRect();
    const scale = r.width / L.w;
    const px = (e.clientX - r.left) / scale;
    const xv = Math.round(clamp(L.xinv(px), 0, X_MAX) / 1000) * 1000;
    const cx = L.x(xv);
    cross.setAttribute('x1', cx);
    cross.setAttribute('x2', cx);
    cross.classList.add('is-on');

    const rows = SERIES
      .filter((s) => s.tip && state[s.key].op > 0)
      .map((s) => ({ s, v: s.key === 'kenya' ? kenyaRate(xv) : at(D.series[s.key], xv) }))
      .filter((row) => row.v !== null)
      .sort((a, b) => b.v - a.v);

    tip.textContent = '';
    const headEl = document.createElement('div');
    headEl.className = 'jv-tip-head';
    headEl.textContent = `${fmt(xv)} Ksh / year`;
    tip.appendChild(headEl);
    rows.forEach(({ s, v }) => {
      const row = document.createElement('div');
      row.className = 'jv-tip-row' + (state[s.key].op < 1 ? ' is-dim' : '');
      row.appendChild(lineKey(s.color, s.style));
      const b = document.createElement('b');
      b.textContent = Math.round(v * 100) + '%';
      row.appendChild(b);
      row.appendChild(document.createTextNode(s.tip));
      tip.appendChild(row);
    });

    const cssX = cx * scale;
    const cssY = (e.clientY - r.top);
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    let left = cssX + 14;
    if (left + tw > chartEl.clientWidth) left = cssX - 14 - tw;
    const top = clamp(cssY - th / 2, 0, Math.max(0, r.height - th));
    tip.style.transform = `translate(${Math.max(0, left).toFixed(0)}px, ${top.toFixed(0)}px)`;
    tip.classList.add('is-on');
    if (e.pointerType === 'touch') tipTimer = setTimeout(hideTip, 2200);
  }

  function hideTip() {
    if (tip) tip.classList.remove('is-on');
    if (cross) cross.classList.remove('is-on');
  }

  /* ---------- Loading, open/close ---------- */

  let dataPromise = null;
  function load() {
    if (!dataPromise) {
      dataPromise = fetch(root.dataset.src)
        .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then((d) => { D = d; })
        .catch((err) => { dataPromise = null; throw err; });
    }
    return dataPromise;
  }

  function open(startStep = 0) {
    isOpen = true;
    root.classList.add('is-open');
    if (toggle) toggle.setAttribute('aria-expanded', 'true');
    collapse.removeAttribute('inert');
    if (!built) chartEl.style.minHeight = layout(Math.round(chartEl.clientWidth) || 600).h + 'px';
    const fonts = document.fonts ? document.fonts.ready : Promise.resolve();
    Promise.all([load(), fonts]).then(() => {
      if (!isOpen) return;
      if (!built && !build()) return;
      chartEl.style.minHeight = '';
      reset();
      updateChrome(startStep);
      // Let the panel open a little before the first curve draws.
      setTimeout(() => { if (isOpen) go(startStep); }, reduceMotion ? 0 : 320);
      setTimeout(() => {
        if (isOpen) panel.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
      }, reduceMotion ? 0 : 560);
    }).catch(() => {
      chartEl.innerHTML = '<p class="jv-error">The visualization could not be loaded. Please try again later.</p>';
    });
  }

  function close() {
    isOpen = false;
    root.classList.remove('is-open');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
    collapse.setAttribute('inert', '');
    hideTip();
  }

  /* ---------- Wiring ---------- */

  buildLegend();
  if (toggle) {
    toggle.addEventListener('click', (e) => {
      // The toggle sits inside the abstract's <summary>: don't open the abstract too.
      e.preventDefault();
      e.stopPropagation();
      if (isOpen) close(); else open(0);
    });
    toggle.addEventListener('pointerenter', () => { load().catch(() => {}); }, { once: true });
    toggle.addEventListener('focus', () => { load().catch(() => {}); }, { once: true });
  }
  prevBtn.addEventListener('click', () => go(cur - 1));
  nextBtn.addEventListener('click', () => {
    if (cur === STEPS.length - 1) { reset(); go(0); } else go(cur + 1);
  });
  pips.forEach((p) => p.addEventListener('click', () => go(+p.dataset.go)));
  collapse.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' && cur < STEPS.length - 1) { e.preventDefault(); go(cur + 1); }
    if (e.key === 'ArrowLeft' && cur > 0) { e.preventDefault(); go(cur - 1); }
  });

  // Re-render at the new width without animating.
  if ('ResizeObserver' in window) {
    let pending = 0;
    new ResizeObserver(() => {
      if (!built || pending) return;
      pending = requestAnimationFrame(() => {
        pending = 0;
        if (Math.abs(Math.round(chartEl.clientWidth) - L.w) < 2) return;
        finishTweens();
        build();
        go(cur, false);
      });
    }).observe(chartEl);
  }

  // Show the toggle only once the script is running.
  const toggleWrap = toggle && toggle.closest('.jv-toggle-wrap');
  if (toggleWrap) toggleWrap.hidden = false;
  root.classList.add('is-ready');

  // Deep links: #jmp-viz opens the panel, #jmp-viz-3 opens it at step 3.
  const hash = /^#jmp-viz(?:-(\d))?$/.exec(location.hash);
  if (hash) open(hash[1] ? clamp(+hash[1] - 1, 0, STEPS.length - 1) : 0);
})();
