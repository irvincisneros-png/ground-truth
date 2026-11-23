import { h, clear } from '../ui/dom';
import { Callout, Card, Readout, StepList } from '../ui/components';
import { createLineChart, type LineChart } from '../ui/linechart';
import { seaIceTrend, seriesRecords } from '../data/derive';
import type { SeaIceData, YearValue } from '../data/types';
import { ICE_GUESS, ICE_SHEET, ICE_STATEMENT } from '../content';
import { fmt } from '../ui/chart-math';
import { PartHeader, PartNav, QuestionBlock, withData, type PartCtx, type PartMount } from './shared';

const STEPS = ['Predict', 'Two poles', 'Ice sheets'];
const pts = (s: YearValue[]) => s.map((p) => ({ x: p.year, y: p.extent_mkm2 }));
const yr = (x: number) => String(Math.round(x));

export const mountIce: PartMount = (root, ctx) => withData(root, ctx, 'ice', ['seaice'], (d) => run(root, ctx, d.seaice));

function run(root: HTMLElement, ctx: PartCtx, data: SeaIceData): () => void {
  const st = ctx.state.ice;
  let view = Math.min(st.step, 2);
  let alive = true;
  const charts: LineChart[] = [];
  const ant = data.antarctic;
  const recent = ant.feb_min.length ? ant.feb_min[ant.feb_min.length - 1].year : 2024;
  const go = (i: number) => { view = i; render(); };
  const advance = (to: number) => { st.step = Math.max(st.step, to); ctx.save(); view = to; render(); window.scrollTo({ top: 0 }); };

  function stepPredict(): HTMLElement {
    const recentPts = pts(ant.feb_min).filter((p) => p.x >= recent - 10);
    const ch = createLineChart({
      title: `Antarctic February minimum sea-ice extent, last ten years`, series: [{ id: 'feb', label: 'February minimum extent', color: '#56b4e9', points: recentPts, markers: true }],
      xLabel: 'Year', yLabel: 'Sea-ice extent', yUnit: 'million km²', xFormat: yr, yDecimals: 2, aspect: 0.5, tableXHeader: 'Year',
    });
    charts.push(ch);
    return h('div', { class: 'cols' },
      h('div', { class: 'stack' },
        Card('Headline: a record low', [
          h('p', null, 'The news says Antarctic sea ice hit a record low in 2023. This is the last ten years of the February minimum, the smallest extent of the year.'),
          QuestionBlock(ctx, {
            name: 'ice-guess', legend: 'Is that a trend?', options: ICE_GUESS, commit: true,
            get: () => st.guess, set: (id) => { st.guess = id; }, scoreKey: 'ice.guess', max: 1, rerender: render,
            explain: 'Now see the whole satellite record, from 1979, for both poles.',
          }),
        ], { eyebrow: 'Trap case 3 · ice' }),
        st.guess ? PartNav({ next: { label: 'See both poles', onClick: () => advance(1) } }) : null),
      Card('Last ten years only', [ch.el], { flat: true }));
  }

  function stepPoles(): HTMLElement {
    const hi = seriesRecords(ant.sep_max), lo = seriesRecords(ant.sep_max);
    const feb = seriesRecords(ant.feb_min);
    const antChart = createLineChart({
      title: 'Antarctic sea-ice extent, 1979 to now',
      series: [
        { id: 'sep', label: 'September maximum', color: '#56b4e9', points: pts(ant.sep_max), markers: false },
        { id: 'feb', label: 'February minimum', color: '#cc79a7', points: pts(ant.feb_min), markers: false },
      ],
      xLabel: 'Year', yLabel: 'Sea-ice extent', yUnit: 'million km²', xFormat: yr, yDecimals: 2, aspect: 0.48, zeroBase: true, tableXHeader: 'Year',
      highlights: [hi && { x0: hi.high.year - 0.5, x1: hi.high.year + 0.5, label: `high ${hi.high.year}` }, lo && { x0: lo.low.year - 0.5, x1: lo.low.year + 0.5, label: `low ${lo.low.year}` }].filter(Boolean) as { x0: number; x1: number; label: string }[],
    });
    const arcChart = createLineChart({
      title: 'Arctic September sea-ice extent, 1979 to now',
      series: [{ id: 'arc', label: 'September extent', color: '#e69f00', points: pts(data.arctic.sep), markers: false }],
      xLabel: 'Year', yLabel: 'Sea-ice extent', yUnit: 'million km²', xFormat: yr, yDecimals: 2, aspect: 0.48, zeroBase: true, tableXHeader: 'Year',
      trends: [{ seriesId: 'arc', x0: -Infinity, x1: Infinity, color: '#ffb547', label: 'Trend 1979–now' }],
      slopeScale: 10, slopeUnit: 'million km² per decade', slopeDecimals: 2,
    });
    charts.push(antChart, arcChart);
    const tr = seaIceTrend(data.arctic.sep);
    const published = data.trendPctPerDecade?.arctic_sep;
    return h('div', { class: 'stack' },
      h('div', { class: 'cols even' },
        Card('Antarctic: swings up and down', [antChart.el, h('p', { class: 'muted small', style: 'margin:.5rem 0 0' }, `Record high ${hi?.high.year ?? '–'}, record low ${hi?.low.year ?? '–'} (September maximum). February record low: ${feb?.low.year ?? '–'}.`)], { flat: true }),
        Card('Arctic: a steady decline', [arcChart.el,
          h('div', { class: 'readouts', style: 'margin-top:.7rem' },
            Readout('Published trend', published === undefined ? '–' : fmt(published, 1), '% per decade'),
            Readout('Fitted here', tr ? fmt(tr.mkm2PerDecade, 2) : '–', 'million km² per decade'))], { flat: true })),
      Card('What can you conclude?', [
        QuestionBlock(ctx, {
          name: 'ice-statement', legend: 'Pick the best statement.', options: ICE_STATEMENT,
          get: () => st.statement, set: (id) => { st.statement = id; }, scoreKey: 'ice.statement', max: 2, rerender: render,
          explain: 'A trend needs many years pointing the same way. The Arctic September record does. The Antarctic record swings, so one record year, high or low, is a data point, not a trend.',
        }),
      ]),
      PartNav({ back: { label: 'Back', onClick: () => go(0) }, next: { label: 'One more distinction', disabled: !st.statement, onClick: () => advance(2) } }));
  }

  function stepSheets(): HTMLElement {
    return h('div', { class: 'cols' },
      h('div', { class: 'stack' },
        Card('Sea ice is not an ice sheet', [
          h('p', null, 'Sea ice floats on the ocean. Ice sheets sit on land, in Greenland and Antarctica. Passive microwave sensors map sea ice well. Ice-sheet mass loss is measured differently, with gravity (GRACE) and laser altimetry (ICESat-2).'),
          QuestionBlock(ctx, {
            name: 'ice-sheet', legend: 'Does melting sea ice raise sea level?', options: ICE_SHEET,
            get: () => st.sheet, set: (id) => { st.sheet = id; }, scoreKey: 'ice.sheet', max: 1, rerender: render,
            explain: 'A floating ice cube already pushes aside its own weight of water. Ice sitting on land adds new water to the ocean when it melts.',
          }),
        ], { eyebrow: 'Step 3 · callout' }),
        PartNav({ back: { label: 'Back', onClick: () => go(1) }, next: { label: 'On to the Minister briefing', disabled: !st.sheet, onClick: () => ctx.finish('ice') } })),
      Card('Which sensor, which ice?', [
        h('ul', { style: 'margin:0 0 0 1.1rem;padding:0;display:grid;gap:.5rem' },
          h('li', null, h('strong', null, 'Passive microwave'), ': sea-ice concentration and extent, through cloud and polar night.'),
          h('li', null, h('strong', null, 'GRACE'), ': changes in the pull of gravity, which show ice-sheet mass loss.'),
          h('li', null, h('strong', null, 'ICESat-2'), ': a laser altimeter that measures the height of the ice surface.')),
        h('div', { style: 'height:.8rem' }),
        Callout('Check the claim', 'When you read a headline about ice, ask: sea ice or ice sheet? Each answers a different question.')], { flat: true }));
  }

  function render() {
    if (!alive) return;
    while (charts.length) charts.pop()!.destroy();
    const y = window.scrollY;
    clear(root);
    root.append(
      PartHeader('Part 6 · Transfer case 3 of 3 · about 4 minutes', 'Ice: is one record a trend?', 'Passive microwave satellites have watched sea ice at both poles since 1979.'),
      h('div', { style: 'margin-bottom:1rem' }, StepList(STEPS, view, Math.min(st.step, 2), go)),
      [stepPredict, stepPoles, stepSheets][view]());
    window.scrollTo({ top: y });
  }
  render();
  return () => { alive = false; while (charts.length) charts.pop()!.destroy(); };
}
