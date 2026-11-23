import { h, clear } from '../ui/dom';
import { Callout, Card, StepList, Badge } from '../ui/components';
import { createMapPanel } from '../ui/mappanel';
import { createLineChart } from '../ui/linechart';
import { dataUrl } from '../data/load';
import type { ForestCase, ForestData } from '../data/types';
import { FOREST_CAUTION, FOREST_CLASSIFY, FOREST_GUESS } from '../content';
import { itemMax } from '../scoring';
import { fmt } from '../ui/chart-math';
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
    const m = createMapPanel({
      bbox: c.bounds, ariaLabel: `${title}: tree-cover loss pixels${overlays ? ' with overlay' : ''}`, scaleKm: undefined,
      legend: [{ color: '#f2a93b', label: `Tree-cover loss ${c.lossYears[0]}–${c.lossYears[1]} (30 m pixels)` }, ...(overlays ? [{ color: c.overlayKind === 'fire' ? '#ff6b57' : '#7cc4ff', label: c.overlayKind === 'fire' ? 'Fire perimeter' : 'Clearing polygon' }] : [])],
    });
    m.addImage(dataUrl(assetPath(c.lossPng)), c.bounds, { label: `Tree-cover loss pixels, ${title}` });
    if (overlays) m.addOverlay(c.overlay, { stroke: c.overlayKind === 'fire' ? '#ff6b57' : '#7cc4ff', label: c.overlayKind === 'fire' ? 'Fire perimeter' : 'Clearing polygon' });
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
            explain: right ? c.note : `The overlay shows ${c.overlayKind === 'fire' ? 'a fire perimeter' : 'a clearing polygon'}. ${c.note}`,
          }));
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
    const withSeries = cases.filter((c) => c.annualLoss_ha && c.annualLoss_ha.length > 1);
    return h('div', { class: 'cols' },
      h('div', { class: 'stack' },
        Card('From one event to the long record', [
          h('p', null, 'A loss map is a snapshot. To judge climate, you need to put that snapshot into a long record of the same place, and then into the science of why.'),
          h('ul', { style: 'margin:.2rem 0 .8rem 1.1rem;padding:0' },
            h('li', null, h('strong', null, 'Tree-cover loss'), ' means canopy is gone from a pixel. It is not the same as deforestation.'),
            h('li', null, h('strong', null, 'Deforestation'), ' means land was permanently changed to another use, such as farms.'),
            h('li', null, h('strong', null, 'Climate'), ' is the pattern over decades. One burnt season is weather plus fuel plus ignition.')),
          Callout('Keep this in mind', 'Satellites are very good at where and how much. They need other evidence for why.'),
        ], { eyebrow: 'Step 3 · the long view' }),
        PartNav({ back: { label: 'Back', onClick: () => go(1) }, next: { label: 'On to sea ice', onClick: () => ctx.finish('forest') } })),
      withSeries.length
        ? Card('Annual tree-cover loss in each crop', withSeries.map((c) => {
          const ch = createLineChart({
            title: `Annual tree-cover loss: ${c.label}`, series: [{ id: c.id, label: c.label, color: '#e69f00', points: c.annualLoss_ha!.map((p) => ({ x: p.year, y: p.loss_ha })), markers: true }],
            xLabel: 'Year', yLabel: 'Tree-cover loss', yUnit: 'ha', xFormat: (x) => String(Math.round(x)), yDecimals: 0, zeroBase: true, aspect: 0.45,
            highlights: [{ x0: c.lossYears[0], x1: c.lossYears[1] + 1, label: 'map period' }],
          });
          return ch.el;
        }), { flat: true })
        : Card('What a long record would add', [h('p', { class: 'muted' }, 'Looking back over many years of the same crop would show whether the loss was a one-off spike or part of a steady pattern. That is why one event never settles a climate question.'), h('div', null, Badge('Case ends on the long record', 'accent'))], { flat: true }));
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
