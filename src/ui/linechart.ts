import { h, s, nextId, clear } from './dom';
import { DataTableToggle } from './datatable';
import { decimate, fmt, linearScale, nearestIndex, niceDomain, niceTicks, trendSegment, type LinearFit, type XY } from './chart-math';

export interface ChartSeries {
  id: string;
  label: string;
  color: string;
  points: XY[];
  dashed?: boolean;
  width?: number;
  markers?: boolean;
}
export interface ChartHighlight {
  x0: number;
  x1: number;
  label?: string;
}
export interface ChartRef {
  y: number;
  label: string;
}
export interface ChartTrend {
  seriesId: string;
  x0: number;
  x1: number;
  color?: string;
  label: string;
}
export interface LineChartOpts {
  title: string;
  desc?: string;
  series: ChartSeries[];
  xLabel: string;
  yLabel: string;
  xUnit?: string;
  yUnit?: string;
  xFormat?: (x: number) => string;
  yFormat?: (y: number) => string;
  yDecimals?: number;
  xDomain?: [number, number];
  yDomain?: [number, number];
  /** Force the y axis to start at zero. */
  zeroBase?: boolean;
  xTicks?: number[];
  highlights?: ChartHighlight[];
  refs?: ChartRef[];
  trends?: ChartTrend[];
  /** Multiplier applied to a fitted slope before display (10 turns "per year" into "per decade"). */
  slopeScale?: number;
  slopeUnit?: string;
  slopeDecimals?: number;
  tableCaption?: string;
  tableXHeader?: string;
  aspect?: number;
  onCursor?: (x: number, values: { series: string; y: number }[]) => void;
}
export interface TrendResult {
  label: string;
  fit: LinearFit | null;
  slope: number | null;
}
export interface LineChart {
  el: HTMLElement;
  update(patch: Partial<LineChartOpts>): void;
  trendResults(): TrendResult[];
  destroy(): void;
}

const M = { l: 58, r: 16, t: 14, b: 46 };

export function createLineChart(initial: LineChartOpts): LineChart {
  let o: LineChartOpts = { ...initial };
  let width = 640;
  let cursorIdx = -1;
  let results: TrendResult[] = [];
  const titleId = nextId('ct');
  const root = h('div', { class: 'chart' });
  const wrap = h('div', { class: 'chart-wrap', tabindex: '0', role: 'group' });
  const svgHost = h('div');
  const readout = h('div', { class: 'chart-readout', 'aria-hidden': 'true' });
  const live = h('div', { class: 'sr-only', 'aria-live': 'polite', role: 'status' });
  const legend = h('ul', { class: 'legend' });
  const table = DataTableToggle(tableSpec);
  wrap.append(svgHost);
  root.append(wrap, readout, live, h('div', { class: 'chart-tools' }, legend, table.el));

  const xf = () => o.xFormat ?? ((x: number) => String(Math.round(x * 100) / 100));
  const yf = () => o.yFormat ?? ((y: number) => fmt(y, o.yDecimals ?? 1));

  function tableSpec() {
    const xs = new Map<number, Map<string, number>>();
    for (const se of o.series) for (const p of se.points) {
      let m = xs.get(p.x);
      if (!m) xs.set(p.x, (m = new Map()));
      m.set(se.id, p.y);
    }
    const rows = [...xs.entries()].sort((a, b) => a[0] - b[0]).slice(0, 6000).map(([x, m]) => [
      xf()(x),
      ...o.series.map((se) => (m.has(se.id) ? yf()(m.get(se.id)!) : '–')),
    ]);
    const unit = (u?: string) => (u ? ` (${u})` : '');
    return {
      caption: o.tableCaption ?? `${o.title}: data`,
      columns: [o.tableXHeader ?? `${o.xLabel}${unit(o.xUnit)}`, ...o.series.map((se) => `${se.label}${unit(o.yUnit)}`)],
      rows,
    };
  }

  function domains() {
    const all = o.series.flatMap((se) => se.points);
    const xs = all.map((p) => p.x), ys = all.map((p) => p.y);
    const xd: [number, number] = o.xDomain ?? [Math.min(...xs), Math.max(...xs)];
    let yMin = Math.min(...ys), yMax = Math.max(...ys);
    if (o.refs) for (const r of o.refs) { yMin = Math.min(yMin, r.y); yMax = Math.max(yMax, r.y); }
    if (o.zeroBase) yMin = Math.min(0, yMin);
    const yd = o.yDomain ?? niceDomain(yMin, yMax, 5);
    return { xd, yd };
  }

  function render() {
    const W = Math.max(280, width);
    const H = Math.round(Math.min(400, Math.max(220, W * (o.aspect ?? 0.5))));
    const pw = W - M.l - M.r, ph = H - M.t - M.b;
    const hasData = o.series.some((se) => se.points.length);
    wrap.setAttribute('aria-label', `${o.title}. Use the left and right arrow keys to move along the line and read values.`);
    clear(svgHost);
    if (!hasData) { svgHost.append(h('p', { class: 'muted' }, 'No data to show.')); return; }
    const { xd, yd } = domains();
    const sx = linearScale(xd[0], xd[1], M.l, M.l + pw);
    const sy = linearScale(yd[0], yd[1], M.t + ph, M.t);
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-labelledby': titleId, width: W, height: H });
    svg.append(s('title', { id: titleId }, o.title));
    if (o.desc) svg.append(s('desc', null, o.desc));

    const yt = niceTicks(yd[0], yd[1], Math.max(3, Math.round(ph / 55)));
    const xt = o.xTicks ?? niceTicks(xd[0], xd[1], Math.max(3, Math.round(pw / 90)));
    const grid = s('g', { class: 'grid' });
    for (const t of yt) grid.append(s('line', { x1: M.l, x2: M.l + pw, y1: sy(t), y2: sy(t) }));
    for (const t of xt) grid.append(s('line', { x1: sx(t), x2: sx(t), y1: M.t, y2: M.t + ph }));
    svg.append(grid);

    const hl = s('g', { class: 'hl' });
    for (const r of o.highlights ?? []) {
      const a = Math.max(M.l, sx(r.x0)), b = Math.min(M.l + pw, sx(r.x1));
      if (b <= a) continue;
      hl.append(s('rect', { x: a, y: M.t, width: b - a, height: ph }));
      if (r.label) hl.append(s('text', { x: a + 4, y: M.t + 11 }, r.label));
    }
    svg.append(hl);

    const ref = s('g', { class: 'ref' });
    for (const r of o.refs ?? []) {
      ref.append(s('line', { x1: M.l, x2: M.l + pw, y1: sy(r.y), y2: sy(r.y) }));
      ref.append(s('text', { x: M.l + pw - 4, y: sy(r.y) - 4, 'text-anchor': 'end' }, r.label));
    }
    svg.append(ref);

    const ax = s('g', { class: 'ax' });
    ax.append(s('line', { class: 'axis-line', x1: M.l, x2: M.l + pw, y1: M.t + ph, y2: M.t + ph, stroke: 'currentColor' }));
    ax.append(s('line', { class: 'axis-line', x1: M.l, x2: M.l, y1: M.t, y2: M.t + ph }));
    for (const t of yt) ax.append(s('text', { x: M.l - 8, y: sy(t) + 4, 'text-anchor': 'end' }, yf()(t)));
    let lastLab = '';
    for (const t of xt) { const lab = xf()(t); if (lab === lastLab) continue; lastLab = lab; ax.append(s('text', { x: sx(t), y: M.t + ph + 16, 'text-anchor': 'middle' }, lab)); }
    ax.append(s('text', { class: 'title', x: M.l + pw / 2, y: H - 8, 'text-anchor': 'middle' }, `${o.xLabel}${o.xUnit ? ` (${o.xUnit})` : ''}`));
    ax.append(s('text', { class: 'title', transform: `translate(14 ${M.t + ph / 2}) rotate(-90)`, 'text-anchor': 'middle' }, `${o.yLabel}${o.yUnit ? ` (${o.yUnit})` : ''}`));
    svg.append(ax);

    const defs = s('clipPath', { id: `${titleId}-clip` }, s('rect', { x: M.l, y: M.t - 2, width: pw, height: ph + 4 }));
    svg.append(defs);
    const sg = s('g', { class: 'series', 'clip-path': `url(#${titleId}-clip)` });
    for (const se of o.series) {
      const pts = decimate(se.points.filter((p) => p.x >= xd[0] && p.x <= xd[1]), Math.max(60, Math.floor(pw * 1.5)));
      if (!pts.length) continue;
      const d = pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join('');
      sg.append(s('path', { class: 'line', d, stroke: se.color, 'stroke-width': se.width ?? 2, 'stroke-dasharray': se.dashed ? '6 4' : undefined }));
      if (se.markers ?? pts.length <= 70) for (const p of pts) sg.append(s('circle', { cx: sx(p.x), cy: sy(p.y), r: 3, fill: se.color, stroke: '#0b1424', 'stroke-width': 1 }));
    }
    svg.append(sg);

    const tg = s('g', { class: 'trend', 'clip-path': `url(#${titleId}-clip)` });
    results = (o.trends ?? []).map((t) => {
      const se = o.series.find((q) => q.id === t.seriesId);
      const seg = se ? trendSegment(se.points, t.x0, t.x1) : null;
      if (seg) tg.append(s('path', { d: `M${sx(seg.a.x)} ${sy(seg.a.y)}L${sx(seg.b.x)} ${sy(seg.b.y)}`, stroke: t.color ?? '#ffb547', 'stroke-width': 3 }));
      return { label: t.label, fit: seg?.fit ?? null, slope: seg ? seg.fit.slope * (o.slopeScale ?? 1) : null };
    });
    svg.append(tg);

    const cur = s('g', { class: 'cursor', visibility: 'hidden' }, s('line', { x1: 0, x2: 0, y1: M.t, y2: M.t + ph }));
    const dots = o.series.map((se) => s('circle', { r: 5, fill: se.color, stroke: '#fff', 'stroke-width': 1.5 }));
    cur.append(...dots);
    svg.append(cur);

    const hit = s('rect', { x: M.l, y: M.t, width: pw, height: ph, fill: 'transparent', style: 'touch-action:pan-y' });
    svg.append(hit);
    svgHost.append(svg);

    const primary = o.series[0].points;
    function showAt(idx: number, speak: boolean) {
      if (idx < 0 || idx >= primary.length) return;
      cursorIdx = idx;
      const x = primary[idx].x;
      cur.setAttribute('visibility', 'visible');
      cur.querySelector('line')!.setAttribute('x1', String(sx(x)));
      cur.querySelector('line')!.setAttribute('x2', String(sx(x)));
      const vals: { series: string; y: number }[] = [];
      readout.textContent = '';
      readout.append(h('span', { class: 'x' }, `${o.xLabel}: ${xf()(x)}${o.xUnit ? ' ' + o.xUnit : ''}`));
      const parts: string[] = [`${xf()(x)}`];
      o.series.forEach((se, i) => {
        const j = nearestIndex(se.points, x);
        if (j < 0) return;
        const p = se.points[j];
        dots[i].setAttribute('cx', String(sx(p.x)));
        dots[i].setAttribute('cy', String(sy(p.y)));
        vals.push({ series: se.id, y: p.y });
        const txt = `${yf()(p.y)}${o.yUnit ? ' ' + o.yUnit : ''}`;
        readout.append(h('span', null, h('span', { class: 'sw', style: `background:${se.color}` }), `${se.label}: ${txt}`));
        parts.push(`${se.label} ${txt}`);
      });
      if (speak) live.textContent = parts.join(', ');
      o.onCursor?.(x, vals);
    }
    hit.addEventListener('pointermove', (e) => {
      const r = (hit as unknown as SVGGraphicsElement).getBoundingClientRect();
      const x = xd[0] + ((e.clientX - r.left) / r.width) * (xd[1] - xd[0]);
      showAt(nearestIndex(primary, x), false);
    });
    hit.addEventListener('pointerdown', (e) => {
      const r = (hit as unknown as SVGGraphicsElement).getBoundingClientRect();
      showAt(nearestIndex(primary, xd[0] + ((e.clientX - r.left) / r.width) * (xd[1] - xd[0])), false);
    });
    wrap.onkeydown = (e: KeyboardEvent) => {
      const big = Math.max(5, Math.round(primary.length / 12));
      let idx = cursorIdx < 0 ? 0 : cursorIdx;
      if (e.key === 'ArrowRight') idx += e.shiftKey ? big : 1;
      else if (e.key === 'ArrowLeft') idx -= e.shiftKey ? big : 1;
      else if (e.key === 'PageDown') idx += big;
      else if (e.key === 'PageUp') idx -= big;
      else if (e.key === 'Home') idx = 0;
      else if (e.key === 'End') idx = primary.length - 1;
      else return;
      e.preventDefault();
      showAt(Math.max(0, Math.min(primary.length - 1, idx)), true);
    };
    if (cursorIdx >= 0) showAt(Math.min(cursorIdx, primary.length - 1), false);

    legend.textContent = '';
    for (const se of o.series) legend.append(h('li', null, h('span', { class: `sw${se.dashed ? ' dash' : ''}`, style: `background:${se.color};color:${se.color}` }), se.label));
    results.forEach((r, i) => {
      const t = o.trends![i];
      legend.append(h('li', null, h('span', { class: 'sw dash', style: `color:${t.color ?? '#ffb547'}` }), `${r.label}: `, h('strong', { class: 'mono' }, r.slope === null ? 'no fit' : `${fmt(r.slope, o.slopeDecimals ?? 1)} ${o.slopeUnit ?? ''}`.trim())));
    });
  }

  let ro: ResizeObserver | null = null;
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver((entries) => {
      const w = Math.floor(entries[0].contentRect.width);
      if (w > 0 && Math.abs(w - width) > 2) { width = w; render(); }
    });
    ro.observe(root);
  }
  queueMicrotask(() => { width = root.clientWidth || width; render(); });
  render();

  return {
    el: root,
    update(patch) { o = { ...o, ...patch }; render(); table.refresh(); },
    trendResults: () => results,
    destroy() { ro?.disconnect(); },
  };
}
