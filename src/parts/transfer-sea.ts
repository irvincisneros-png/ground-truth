import { h, clear } from '../ui/dom';
import { Button, Callout, Card, Readout, StepList } from '../ui/components';
import { createLineChart, type LineChart } from '../ui/linechart';
import { annualMeans, findDropPair, parseWindows, windowRate } from '../data/derive';
import type { SeaLevelData } from '../data/types';
import { SEA_CONCLUSION, SEA_GAUGE, SEA_PAIR_GUESS } from '../content';
import { fmt, yearTicks } from '../ui/chart-math';
import { PartHeader, PartNav, QuestionBlock, withData, type PartCtx, type PartMount } from './shared';

const STEPS = ['Two years', 'The full record', 'A local gauge'];

export const mountSea: PartMount = (root, ctx) => withData(root, ctx, 'sea', ['sealevel'], (d) => run(root, ctx, d.sealevel));

function run(root: HTMLElement, ctx: PartCtx, data: SeaLevelData): () => void {
  const st = ctx.state.sea;
  const annual = annualMeans(data.gmsl);
  const years = annual.map((a) => a.year);
  const trap = findDropPair(annual);
  const [early, late] = parseWindows(data.rates ?? {});
  const gm = data.gmsl.map((p) => ({ x: p.t_year, y: p.gmsl_mm }));
  let view = Math.min(st.step, 2);
  let showTrend = true;
  const charts: LineChart[] = [];
  let alive = true;
  if (st.y0 === undefined && trap) { st.y0 = trap.y0; st.y1 = trap.y1; }
  const meanOf = (y: number) => annual.find((a) => a.year === y)?.mean_mm;

  const go = (i: number) => { view = i; render(); };
  const advance = (to: number) => { st.step = Math.max(st.step, to); ctx.save(); view = to; render(); window.scrollTo({ top: 0 }); };
  const mm = (v: number) => `${fmt(v, 1)}`;

  function stepPair(): HTMLElement {
    const y0 = st.y0 ?? years[0], y1 = st.y1 ?? years[1];
    const lo = Math.min(y0, y1) - 1, hi = Math.max(y0, y1) + 2;
    const win = gm.filter((p) => p.x >= lo && p.x <= hi);
    const chart = createLineChart({
      title: `Global mean sea level, ${lo} to ${hi}`,
      series: [{ id: 'gmsl', label: 'Global mean sea level', color: '#56b4e9', points: win, markers: win.length <= 70 }],
      xLabel: 'Year', yLabel: 'Sea-surface height', yUnit: 'mm', xFormat: (x) => String(Math.round(x)), xTicks: yearTicks(lo, hi, 8),
      highlights: [{ x0: y0, x1: y0 + 1, label: String(y0) }, { x0: y1, x1: y1 + 1, label: String(y1) }],
      tableXHeader: 'Year (decimal)', yDecimals: 1, aspect: 0.5,
    });
    charts.push(chart);
    const sel = (id: string, val: number, onCh: (v: number) => void) => {
      const el = h('select', { id }, years.map((y) => h('option', { value: String(y) }, String(y))));
      el.value = String(val);
      el.disabled = st.pairGuess !== undefined;
      el.addEventListener('change', () => { onCh(Number(el.value)); ctx.save(); render(); });
      return el;
    };
    const m0 = meanOf(y0), m1 = meanOf(y1);
    const delta = m0 !== undefined && m1 !== undefined ? m1 - m0 : undefined;
    return h('div', { class: 'cols' },
      h('div', { class: 'stack' },
        Card('Someone says: “Sea level is not rising”', [
          h('p', null, 'They have picked two years from the satellite record and compared them. Try it yourself, then tell us what that pair suggests.'),
          h('div', { class: 'row' },
            h('div', { class: 'field' }, h('label', { for: 'sea-y0' }, 'From year'), sel('sea-y0', y0, (v) => { st.y0 = v; })),
            h('div', { class: 'field' }, h('label', { for: 'sea-y1' }, 'To year'), sel('sea-y1', y1, (v) => { st.y1 = v; }))),
          h('div', { class: 'readouts', style: 'margin:1rem 0' },
            Readout(`Mean ${y0}`, m0 === undefined ? '–' : mm(m0), 'mm'),
            Readout(`Mean ${y1}`, m1 === undefined ? '–' : mm(m1), 'mm'),
            Readout('Change', delta === undefined ? '–' : `${delta > 0 ? '+' : ''}${mm(delta)}`, 'mm')),
          QuestionBlock(ctx, {
            name: 'sea-pair', legend: 'What does this pair of years suggest about sea level over time?', options: SEA_PAIR_GUESS, commit: true,
            get: () => st.pairGuess, set: (id) => { st.pairGuess = id as 'rising'; }, scoreKey: 'sea.pair', max: 1, rerender: render,
            explain: 'Now zoom out. Does one pair of years tell the whole story?',
          }),
        ], { eyebrow: 'Trap case 1 · sea level' }),
        st.pairGuess ? PartNav({ next: { label: 'Zoom out to the full record', onClick: () => advance(1) } }) : null),
      Card('Satellite altimeter record, zoomed in', [chart.el, h('p', { class: 'muted small', style: 'margin:.6rem 0 0' }, 'Each point is a global average of sea-surface height from the altimeter satellites.')], { flat: true }));
  }

  function stepFull(): HTMLElement {
    const chart = createLineChart({
      title: 'Global mean sea level, full satellite record',
      series: [{ id: 'gmsl', label: 'Global mean sea level', color: '#56b4e9', points: gm, markers: false }],
      xLabel: 'Year', yLabel: 'Sea-surface height', yUnit: 'mm', xFormat: (x) => String(Math.round(x)),
      highlights: st.y0 !== undefined && st.y1 !== undefined ? [{ x0: st.y0, x1: st.y0 + 1 }, { x0: st.y1, x1: st.y1 + 1, label: 'your pair' }] : [],
      trends: showTrend ? [
        { seriesId: 'gmsl', x0: early[0], x1: early[1] + 1 - 1e-6, color: '#f0e442', label: `${early[0]}–${early[1]}` },
        { seriesId: 'gmsl', x0: late[0], x1: late[1] + 1 - 1e-6, color: '#d55e00', label: `${late[0]}–${late[1]}` },
      ] : [],
      slopeUnit: 'mm per year', slopeDecimals: 1, tableXHeader: 'Year (decimal)', yDecimals: 1, aspect: 0.5,
    });
    charts.push(chart);
    const r0 = windowRate(data.gmsl, early[0], early[1]), r1 = windowRate(data.gmsl, late[0], late[1]);
    const toggle = Button(showTrend ? 'Hide trend lines' : 'Show trend lines', { small: true, onClick: () => { showTrend = !showTrend; render(); } });
    return h('div', { class: 'cols wide-left' },
      h('div', { class: 'stack' },
        Card('The record that counts', [
          h('div', { class: 'spread', style: 'margin-bottom:.4rem' }, h('span', { class: 'muted small' }, 'Highlighted bands are the two years you compared.'), toggle),
          chart.el,
          h('div', { class: 'readouts', style: 'margin-top:.8rem' },
            Readout(`Rate ${early[0]}–${early[1]}`, r0 === null ? '–' : fmt(r0, 1), 'mm per year'),
            Readout(`Rate ${late[0]}–${late[1]}`, r1 === null ? '–' : fmt(r1, 1), 'mm per year'),
            Readout('Speed-up', r0 && r1 ? fmt(r1 / r0, 1) : '–', '×')),
          h('p', { class: 'muted small', style: 'margin:.6rem 0 0' }, 'Rates are straight lines fitted by least squares through every point in each window. Individual years bounce around with El Niño and La Niña, mostly because rain and ocean heat are shifted around the globe.'),
        ], { eyebrow: 'Step 2 · zoom out' }),
        PartNav({ back: { label: 'Back', onClick: () => go(0) }, next: { label: 'Compare with a local gauge', disabled: !st.conclusion, onClick: () => advance(2) } })),
      Card('What can you conclude?', [
        QuestionBlock(ctx, {
          name: 'sea-conclusion', legend: 'Pick the best conclusion.', options: SEA_CONCLUSION,
          get: () => st.conclusion, set: (id) => { st.conclusion = id; }, scoreKey: 'sea.conclusion', max: 2, rerender: render,
          explain: 'One pair of years is weather and ocean cycles. The 30-year line, and the way its slope steepens, is the climate signal.',
        }),
      ], { flat: true }));
  }

  function stepGauge(): HTMLElement {
    const tg = data.tideGauge;
    const gaugeChart = createLineChart({
      title: `Tide gauge: ${tg.station}`,
      series: [{ id: 'gauge', label: tg.station, color: '#cc79a7', points: tg.series.map((p) => ({ x: p.year, y: p.msl_mm })), markers: tg.series.length <= 70 }],
      xLabel: 'Year', yLabel: 'Mean sea level relative to the land', yUnit: 'mm', xFormat: (x) => String(Math.round(x)), yDecimals: 0, aspect: 0.45,
      tableXHeader: 'Year',
    });
    charts.push(gaugeChart);
    const satChart = createLineChart({
      title: 'Satellite global mean sea level',
      series: [{ id: 'gmsl', label: 'Satellite global mean', color: '#56b4e9', points: gm, markers: false }],
      xLabel: 'Year', yLabel: 'Global mean sea-surface height', yUnit: 'mm', xFormat: (x) => String(Math.round(x)), yDecimals: 1, aspect: 0.45, tableXHeader: 'Year (decimal)',
    });
    charts.push(satChart);
    return h('div', { class: 'cols wide-left' },
      h('div', { class: 'stack' },
        Card('Two instruments, two stories', [satChart.el, h('div', { style: 'height:1rem' }), gaugeChart.el, h('p', { class: 'muted small', style: 'margin:.6rem 0 0' }, `Gauge location: ${fmt(Math.abs(tg.lat), 2)}° ${tg.lat < 0 ? 'S' : 'N'}, ${fmt(tg.lon, 2)}° E. Different y-axes: do not compare the heights directly.`)], { eyebrow: 'Step 3 · a different ruler' }),
        PartNav({ back: { label: 'Back', onClick: () => go(1) }, next: { label: 'On to forests', disabled: !st.gauge, onClick: () => ctx.finish('sea') } })),
      Card('Why do they differ?', [
        QuestionBlock(ctx, {
          name: 'sea-gauge', legend: 'Why does the local gauge not match the satellite global mean?', options: SEA_GAUGE,
          get: () => st.gauge, set: (id) => { st.gauge = id; }, scoreKey: 'sea.gauge', max: 1, rerender: render,
          explain: 'A gauge is bolted to land that can rise or sink, and it only sees one place. A satellite averages the whole ocean surface.',
        }),
        h('div', { style: 'height:1rem' }),
        Callout('Remember', 'Altimetry cannot tell which street floods. For that, councils need local gauges, land-movement data and detailed ground heights.'),
      ], { flat: true }));
  }

  function render() {
    if (!alive) return;
    while (charts.length) charts.pop()!.destroy();
    const y = window.scrollY;
    clear(root);
    root.append(
      PartHeader('Part 4 · Transfer case 1 of 3 · about 3 minutes', 'Sea level: one pair or the long record?', 'Altimeter satellites have measured the height of the sea for over thirty years.'),
      h('div', { style: 'margin-bottom:1rem' }, StepList(STEPS, view, Math.min(st.step, 2), go)),
      [stepPair, stepFull, stepGauge][view]());
    window.scrollTo({ top: y });
  }
  render();
  return () => { alive = false; while (charts.length) charts.pop()!.destroy(); };
}
