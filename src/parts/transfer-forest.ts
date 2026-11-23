import { h, clear } from '../ui/dom';
import { Callout, Card, Readout, StepList } from '../ui/components';
import { createMapPanel } from '../ui/mappanel';
import { createLineChart } from '../ui/linechart';
import { dataUrl } from '../data/load';
import { lossSeries } from '../data/derive';
import type { ForestCase, ForestData } from '../data/types';
import { FOREST_CAUTION, FOREST_CLASSIFY, FOREST_GUESS } from '../content';
import { itemMax } from '../scoring';
import { fmt, yearTicks } from '../ui/chart-math';
import { PartHeader, PartNav, QuestionBlock, withData, type PartCtx, type PartMount } from './shared';

const STEPS = ['Loss pixels', 'Overlays', 'The long record'];

export const mountForest: PartMount = (root, ctx) => withData(root, ctx, 'forest', ['forest'], (d) => run(root, ctx, d.forest));

export function assetPath(p: string): string {
  return p.replace(/^\/+/, '').replace(/^(public\/)?data\//, '');
}

function run(root: HTMLElement, ctx: PartCtx, data: ForestData): () => void {
  const st = ctx.state.forest;
  const cases = data.cases.slice(0, 2);
  let view = Math.min(st.step, 2);
  let alive = true;
  const go = (i: number) => { view = i; render(); };
  const advance = (to: number) => { st.step = Math.max(st.step, to); ctx.save(); view = to; render(); window.scrollTo({ top: 0 }); };

  function cropMap(c: ForestCase, overlays: boolean, title: string) {
    const focus = (c.lossLegend ?? []).filter((l) => l.focus);
    const legend = [
      ...(focus.length ? focus.map((l) => ({ color: l.hex, label: String(l.year) })) : [{ color: '#f2a93b', label: `Loss ${c.lossYears[0]}\u2013${c.lossYears[1]}` }]),
      ...((c.lossLegend ?? []).some((l) => !l.focus) ? [{ color: '#5f78be', label: 'Other years' }] : []),
      ...(overlays ? [{ color: c.overlayKind === 'fire' ? '#ff6b57' : '#7cc4ff', label: c.overlayKind === 'fire' ? 'Fire perimeter' : 'Clearing polygon' }] : []),
    ];
    const m = createMapPanel({
      bbox: c.bounds, ariaLabel: `${title}: tree-cover loss pixels${overlays ? ' with overlay' : ''}`, legend,
    });
    m.addImage(dataUrl(assetPath(c.lossPng)), c.bounds, { label: `Tree-cover loss pixels, ${title}` });
    if (overlays) m.addOverlay(c.overlay, { stroke: c.overlayKind === 'fire' ? '#ff6b57' : '#7cc4ff', fill: c.overlayKind === 'fire' ? 'rgba(255,107,87,.10)' : 'rgba(124,196,255,.10)', label: c.overlayKind === 'fire' ? 'Fire perimeter' : 'Clearing polygon' });
    return m;
  }

  function mapsCard(maps: ReturnType<typeof cropMap>[], showLabels: boolean): HTMLElement {
    return Card(showLabels ? 'Loss pixels with overlays' : 'Tree-cover loss, two crops', [
      h('div', { class: 'cols even', style: 'gap:.8rem' }, cases.map((c, i) => h('div', null,
        h('p', { class: 'panel-title', style: 'margin-bottom:.4rem' }, `Crop ${i === 0 ? 'A' : 'B'}${showLabels && st.classify[c.id] ? ` \u00B7 ${c.label}` : ''}`),
        maps[i].el,
        h('p', { class: 'muted small mono', style: 'margin:.4rem 0 0' }, `${fmt(Math.abs(c.bounds[3]), 1)}\u00B0 S, ${fmt(c.bounds[0], 1)}\u2013${fmt(c.bounds[2], 1)}\u00B0 E`)))),
    ], { flat: true });
  }

  function stepPixels(): HTMLElement {
    const maps = cases.map((c, i) => cropMap(c, false, `Crop ${i === 0 ? 'A' : 'B'}`));
    return h('div', { class: 'cols' },
      h('div', { class: 'stack' },
        Card('Two crops, the same kind of pixel', [
          h('p', null, 'Both maps come from Landsat-based tree-cover loss data. A coloured pixel means the tree canopy there was lost during the period. The pixels do not say why.'),
          QuestionBlock(ctx, {
            name: 'forest-guess', legend: 'Looking only at the loss pixels: which crop shows climate-linked loss?', options: FOREST_GUESS, commit: true,
            get: () => st.guess['pixels'], set: (id) => { st.guess['pixels'] = id; }, scoreKey: 'forest.guess', max: 1, rerender: render,
            explain: 'Now add what the satellite pixels cannot tell you: an overlay of what was actually on the ground.',
          }),
        ], { eyebrow: 'Trap case 2 \u00B7 forest' }),
        st.guess['pixels'] ? PartNav({ next: { label: 'Add the overlays', onClick: () => advance(1) } }) : null),
      mapsCard(maps, false));
  }

  function stepOverlay(): HTMLElement {
    const maps = cases.map((c, i) => cropMap(c, true, `Crop ${i === 0 ? 'A' : 'B'}`));
    const allDone = cases.every((c) => st.classify[c.id]);
    return h('div', { class: 'cols' },
      h('div', { class: 'stack' },
        Card('What is behind each crop?', cases.map((c, i) => {
          const right = st.classify[c.id] === c.answer;
          return h('div', { style: i ? 'margin-top:1.1rem' : '' }, QuestionBlock(ctx, {
            name: `forest-c-${c.id}`, legend: `Crop ${i === 0 ? 'A' : 'B'}: what is behind it?`, options: FOREST_CLASSIFY.map((o) => ({ ...o, correct: o.id === c.answer })),
            get: () => st.classify[c.id], set: (id) => { st.classify[c.id] = id; }, scoreKey: `forest.classify.${i}`, max: itemMax(`forest.classify.${i}`), rerender: render,
            explain: `${right ? '' : 'Look again. '}${c.overlayKind === 'fire' ? 'The fire perimeter sits right on the loss pixels, and the loss follows the fire edge in an irregular patchwork.' : 'The loss comes in straight-edged blocks that line up with mapped clearing polygons: people changing how the land is used.'}`,
          }), st.classify[c.id] ? h('div', { class: 'stack-sm', style: 'margin-top:.7rem' },
            c.stats?.focus_loss_inside_overlay_pct !== undefined ? Readout(`Loss pixels inside the ${c.overlayKind === 'fire' ? 'fire perimeter' : 'clearing polygons'}`, fmt(c.stats.focus_loss_inside_overlay_pct, 1), '%') : null,
            h('details', null, h('summary', { style: 'cursor:pointer;color:var(--muted);font-size:.85rem' }, 'Data notes'), h('p', { class: 'muted small', style: 'margin:.4rem 0 0' }, `${c.label}. ${c.note}`))) : null);
        }), { eyebrow: 'Step 2 \u00B7 add the ground truth' }),
        PartNav({ back: { label: 'Back', onClick: () => go(0) } })),
      h('div', { class: 'stack' },
        mapsCard(maps, true),
        Card('Climate-linked is not the same as caused by climate', [
          allDone
            ? QuestionBlock(ctx, {
                name: 'forest-caution', legend: 'What did the Black Summer attribution research find?', options: FOREST_CAUTION,
                get: () => st.caution, set: (id) => { st.caution = id; }, scoreKey: 'forest.caution', max: 1, rerender: render,
                explain: 'Researchers found increased fire-weather risk. They did not say climate change caused each fire. Burnt eucalypt forest also often resprouts, so loss is not always permanent.',
              })
            : h('p', { class: 'muted' }, 'Classify both crops to unlock this question.'),
        ], { flat: true }),
        PartNav({ next: { label: 'Zoom out to the long record', disabled: !st.caution, onClick: () => advance(2) } })));
  }

  function stepLong(): HTMLElement {
    const charts = cases.map((c, i) => {
      const s = lossSeries(c.stats, 2001, undefined);
      return s.length ? createLineChart({
        title: `Crop ${i === 0 ? 'A' : 'B'}: share of the crop with tree-cover loss each year`, series: [{ id: c.id, label: c.label, color: i === 0 ? '#d55e00' : '#56b4e9', points: s.map((p) => ({ x: p.year, y: p.pct })), markers: true }],
        xLabel: 'Year', yLabel: 'Area with loss', yUnit: '% of crop', xFormat: (x) => String(Math.round(x)), xTicks: yearTicks(s[0].year, s[s.length - 1].year, 6), yDecimals: 1, zeroBase: true, aspect: 0.62,
        highlights: [{ x0: c.lossYears[0] - 0.5, x1: c.lossYears[1] + 0.5, label: 'map period' }], tableXHeader: 'Year',
      }) : null;
    });
    return h('div', { class: 'stack' },
      h('div', { class: 'cols' },
        Card('From one event to the long record', [
          h('p', null, 'A loss map is a snapshot. To judge climate, put that snapshot into a long record of the same place, and then into the science of why.'),
          h('ul', { style: 'margin:.2rem 0 .8rem 1.1rem;padding:0' },
            h('li', null, h('strong', null, 'Tree-cover loss'), ' means canopy is gone from a pixel. It is not the same as deforestation.'),
            h('li', null, h('strong', null, 'Deforestation'), ' means land was permanently changed to another use, such as farms.'),
            h('li', null, h('strong', null, 'Climate'), ' is the pattern over decades. One burnt season is weather plus fuel plus ignition.')),
          Callout('Keep this in mind', 'Satellites are very good at where and how much. They need other evidence for why.'),
        ], { eyebrow: 'Step 3 \u00B7 the long view' }),
        Card('Every year since 2001', [h('div', { class: 'cols even', style: 'gap:.8rem' }, charts.map((ch) => (ch ? ch.el : h('p', { class: 'muted' }, 'No year-by-year record for this crop.')))),
          h('p', { class: 'muted small', style: 'margin:.6rem 0 0' }, 'Each point is the share of the same map window that lost trees that year. The spike marks the map period. The other years show what ordinary loss in this place looks like.')], { flat: true })),
      PartNav({ back: { label: 'Back', onClick: () => go(1) }, next: { label: 'On to sea ice', onClick: () => ctx.finish('forest') } }));
  }

  function render() {
    if (!alive) return;
    const y = window.scrollY;
    clear(root);
    root.append(
      PartHeader('Part 5 · Transfer case 2 of 3 · about 3 minutes', 'Forest: which loss is climate, which is bulldozers?', 'Two places lost tree cover. From orbit the pixels look alike.'),
      h('div', { style: 'margin-bottom:1rem' }, StepList(STEPS, view, Math.min(st.step, 2), go)),
      [stepPixels, stepOverlay, stepLong][view]());
    window.scrollTo({ top: y });
  }
  render();
  return () => { alive = false; };
}
