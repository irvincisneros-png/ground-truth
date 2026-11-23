import { h, clear } from '../ui/dom';
import { Button, Callout, Card, ChoiceGroup, openModal, Readout, StepList } from '../ui/components';
import { createLineChart, type LineChart } from '../ui/linechart';
import { createMapPanel } from '../ui/mappanel';
import { loadLand } from '../data/load';
import { buoyStats, isoToYear, monthTicks, predictionHeld, rankByPeak, reefList, reefPeak, summerWindow, surveyOutcome, yearToDayLabel, yearToLabel } from '../data/derive';
import type { BuoyData, Reef, ReefData } from '../data/types';
import { REEF_LIMITS, REEF_WHY } from '../content';
import { award } from '../state';
import { PEAK_TOLERANCE, RATIO_TOLERANCE, scoreLimitSelection, scorePrediction, scoreQuantified, itemMax } from '../scoring';
import { fmt, yearTicks } from '../ui/chart-math';
import { LockChip, PartHeader, PartNav, withData, type PartCtx, type PartMount } from './shared';

const SUMMER = '2024';
const REEF_COLOURS = ['var(--d-reef-a)', 'var(--d-reef-b)', 'var(--d-reef-c)'];
const REEF_HEX = ['#d55e00', '#56b4e9', '#009e73'];
const STEPS = ['Predict', 'Survey flight', 'Reveal', 'Ground truth', 'Compare', 'Limits'];
// cividis-like ramp for the 0-4 survey categories. Colour is redundant: the number and label are always shown.
const CAT_COLOURS = ['#2b4a73', '#4f6580', '#78797a', '#a18f6c', '#cdb85a', '#f4e04d'];
const LIMIT_ORDER = ['cannot', 'risk', 'scale', 'oneyear', 'hottest', 'depth', 'wrong', 'history'];
const CONFIDENCE = [
  { id: '1', text: 'Guess', detail: 'I am not sure at all' },
  { id: '2', text: 'Fairly sure', detail: 'The graph points one way' },
  { id: '3', text: 'Certain', detail: 'I would bet on it' },
];

function bboxFor(reefs: Reef[]): [number, number, number, number] {
  const lons = reefs.map((r) => r.lon), lats = reefs.map((r) => r.lat);
  const cx = (Math.min(...lons) + Math.max(...lons)) / 2, cy = (Math.min(...lats) + Math.max(...lats)) / 2;
  const k = Math.cos((cy * Math.PI) / 180);
  const ASPECT = 2.1; // width : height on screen
  let hh = Math.max(4.5, (Math.max(...lats) - Math.min(...lats)) / 2 + 2.5);
  let ww = Math.max((hh * ASPECT) / k, (Math.max(...lons) - Math.min(...lons)) / 2 + 3);
  hh = Math.max(hh, (ww * k) / ASPECT);
  ww = (hh * ASPECT) / k;
  return [cx - ww, cy - hh, cx + ww, cy + hh];
}

function heatChart(reefs: Reef[]): LineChart {
  const [a, b] = summerWindow(Number(SUMMER));
  return createLineChart({
    title: 'Heat stress (Degree Heating Weeks) at each area',
    desc: 'Accumulated heat stress over several summers, against the same baseline for every reef.',
    series: reefs.map((r, i) => ({ id: r.id, label: r.name, color: REEF_HEX[i], points: r.dhw.map((p) => ({ x: isoToYear(p.date), y: p.dhw_cweeks })), markers: false })),
    xLabel: 'Date', yLabel: 'Heat stress (DHW)', yUnit: '°C-weeks',
    xFormat: (x) => String(Math.round(x)), xTicks: yearTicks(Math.min(...reefs.flatMap((r) => r.dhw.map((p) => isoToYear(p.date)))), Math.max(...reefs.flatMap((r) => r.dhw.map((p) => isoToYear(p.date)))), 8),
    yDecimals: 1, zeroBase: true,
    refs: [{ y: 4, label: 'Bleaching Alert Level 1 (4 °C-weeks)', tag: 'Alert 1|4 °C-weeks' }, { y: 8, label: 'Alert Level 2 (8 °C-weeks)', tag: 'Alert 2|8 °C-weeks' }], legendTop: true,
    highlights: [{ x0: a, x1: b, label: `Summer ${SUMMER}` }],
    tableXHeader: 'Date (decimal year)', aspect: 0.42,
    tableCaption: 'Degree Heating Weeks (°C-weeks) for each reef',
  });
}

export const mountReef: PartMount = (root, ctx) => withData(root, ctx, 'reef', ['reef', 'buoy'], (d) => run(root, ctx, d.reef, d.buoy));

function run(root: HTMLElement, ctx: PartCtx, data: ReefData, buoy: BuoyData): () => void {
  const st = ctx.state.reef;
  const reefs = reefList(data);
  const ranked = rankByPeak(reefs, SUMMER);
  const outcome = surveyOutcome(reefs, SUMMER);
  const nameOf = (id: string) => (id === 'same' ? 'About the same' : reefs.find((r) => r.id === id)?.name ?? id);
  let view = Math.min(st.step, 5);
  let land: number[][] | undefined;
  const charts: LineChart[] = [];
  let alive = true;

  loadLand().then((r) => { if (r.ok && alive) { land = r.data.polygons; render(); } });

  function reefMap(opts: { selectable?: boolean; selected?: string | null; onSelect?: (id: string) => void }) {
    const m = createMapPanel({
      bbox: bboxFor(reefs), land, scaleKm: 200, selectable: opts.selectable, onSelect: opts.onSelect,
      ariaLabel: 'Map of the Great Barrier Reef region with the areas in this investigation marked',
      markers: reefs.map((r, i) => ({ id: r.id, lon: r.lon, lat: r.lat, label: r.name, color: REEF_HEX[i], ariaLabel: `${r.name}, latitude ${fmt(Math.abs(r.lat), 2)} south` })),
      legend: reefs.map((r, i) => ({ color: REEF_HEX[i], label: r.name })),
    });
    if (opts.selected) m.select(opts.selected);
    return m;
  }

  function go(i: number) { view = i; render(); }
  function advance(to: number) { st.step = Math.max(st.step, to); ctx.save(); view = to; render(); window.scrollTo({ top: 0 }); }

  /* ---------- step 0: predict ---------- */
  function stepPredict(): HTMLElement {
    const locked = !!st.predict;
    let choice = st.predict?.choice ?? '';
    let conf = st.predict?.confidence ? String(st.predict.confidence) : '';
    const commit = Button('Commit prediction', { variant: 'primary', disabled: true, onClick: () => {
      st.predict = { choice, confidence: Number(conf) as 1 | 2 | 3 };
      award(ctx.state, 'reef.predict', scorePrediction(choice, Number(conf)));
      st.step = Math.max(st.step, 1);
      ctx.save(); view = 1; render();
    } });
    const refresh = () => { commit.disabled = !(choice && conf); };
    const top = reefs.length > 2 ? 'most' : 'more';
    const noun = 'area';
    const opts = [...reefs.map((r) => ({ id: r.id, text: r.name })), { id: 'same', text: 'About the same' }];
    const map = reefMap({});
    const chart = heatChart(reefs); charts.push(chart);
    return h('div', { class: 'cols' },
      h('div', { class: 'stack' },
        Card('Your prediction', [
          h('p', null, `The graph shows heat stress at each reef over several summers, measured against the same baseline. Look at the summer ${SUMMER} shaded band.`),
          ChoiceGroup({ name: 'reef-predict', legend: `Which ${noun} bleached ${top} severely in ${SUMMER}?`, options: opts, value: choice, locked, onChange: (v) => { choice = v as string; refresh(); } }),
          h('div', { style: 'height:.8rem' }),
          ChoiceGroup({ name: 'reef-conf', legend: 'How sure are you?', options: CONFIDENCE, value: conf, locked, onChange: (v) => { conf = v as string; refresh(); } }),
          h('div', { class: 'row', style: 'margin-top:1rem' },
            locked ? LockChip('Prediction locked') : commit,
            locked ? null : h('span', { class: 'muted small' }, 'Once committed it cannot change. You score for committing, not for being right.')),
        ], { eyebrow: 'Step 1 · commit first' }),
        locked ? PartNav({ next: { label: 'Go to the survey flight', onClick: () => advance(1) } }) : null),
      h('div', { class: 'stack' },
        Card('Heat stress, summer by summer', [chart.el, h('p', { class: 'muted small', style: 'margin:.6rem 0 0' }, 'DHW adds up how far the water was above the usual summer maximum, week by week. 4 °C-weeks is the first bleaching alert, 8 the second. ', data.baseline)], { flat: true }),
        Card('Where the areas are', [map.el], { flat: true })));
  }

  /* ---------- step 1: flight ---------- */
  function stepFlight(): HTMLElement {
    const flown = st.flightReef;
    let pick = flown ?? '';
    const fly = Button('Fly this survey', { variant: 'primary', disabled: !pick || !!flown, onClick: () => confirmFlight(pick) });
    const mapRef: { m?: ReturnType<typeof reefMap> } = {};
    const group = ChoiceGroup({ name: 'flight', legend: 'Where do you send your flight?', options: reefs.map((r) => ({ id: r.id, text: r.name, detail: `${fmt(Math.abs(r.lat), 1)}° S, ${fmt(r.lon, 1)}° E` })), value: flown ?? '', locked: !!flown, onChange: (v) => { pick = v as string; fly.disabled = false; mapRef.m?.select(pick); } });
    const m = reefMap({ selectable: !flown, selected: flown ?? null, onSelect: (id) => {
      pick = id; fly.disabled = false; m.select(id);
      const input = group.querySelector<HTMLInputElement>(`input[value="${id}"]`); if (input) input.checked = true;
    } });
    mapRef.m = m;
    function confirmFlight(id: string) {
      openModal({
        title: 'Use your only flight?',
        body: [h('p', null, `You will see the aerial survey for ${nameOf(id)} only. There is no second flight.`)],
        actions: [{ label: 'Not yet', variant: 'ghost' }, { label: 'Fly now', variant: 'primary', onClick: () => {
          st.flightReef = id; award(ctx.state, 'reef.flight', itemMax('reef.flight')); advance(2);
        } }],
      });
    }
    return h('div', { class: 'cols' },
      Card('One survey flight', [
        h('p', null, `Aerial surveyors scored how bleached the reefs looked in summer ${SUMMER}. Flights are scarce. You get one, so choose the area where the answer would teach you the most.`),
        h('div', { class: 'readouts', style: 'margin-bottom:1rem' }, Readout('Flights left', flown ? '0' : '1', '/ 1'), Readout('Your prediction', nameOf(st.predict?.choice ?? '–'))),
        group,
        h('div', { class: 'row', style: 'margin-top:1rem' }, flown ? LockChip('Flight used') : fly),
        flown ? PartNav({ next: { label: 'See the results', onClick: () => advance(2) } }) : null,
      ], { eyebrow: 'Step 2 · spend it wisely' }),
      Card('Choose on the map or from the list', [m.el], { flat: true }));
  }

  /* ---------- step 2: reveal ---------- */
  const catText = (sv: { category: number; categoryIsMinimum?: boolean }) => `${sv.category}${sv.categoryIsMinimum ? '+' : ''}`;
  function distBar(sv: NonNullable<Reef['survey'][string]>): HTMLElement | null {
    const d = sv.distribution;
    if (!d || !d.length) return null;
    const total = d.reduce((a, x) => a + x.pct, 0) || 1;
    return h('div', { class: 'stack-sm' },
      h('div', { role: 'img', 'aria-label': `Share of surveyed reefs: ${d.map((x) => `${x.text ?? x.group ?? `category ${x.category}`}, ${x.pct} percent`).join('; ')}`, style: 'display:flex;height:14px;border-radius:7px;overflow:hidden;border:1px solid var(--line)' },
        d.map((x, i) => h('span', { style: `flex:${Math.max(0.5, (x.pct / total) * 100)};background:${CAT_COLOURS[Math.min(5, Math.round((i / Math.max(1, d.length - 1)) * 5))]}` }))),
      h('ul', { class: 'muted small', style: 'list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:.2rem 1rem' }, d.filter((x) => x.pct > 0).map((x) => h('li', null, `${x.text ?? (x.group !== undefined ? `Categories ${x.group}` : `Category ${x.category}`)}: `, h('strong', { class: 'mono' }, `${x.pct}%`)))),
      sv.basis ? h('p', { class: 'muted small', style: 'margin:0' }, `Basis: ${sv.basis}`) : null);
  }
  /** The honest caveat: these are NOAA regional virtual stations, and AIMS measured lower heat stress at the reefs it surveyed. */
  function scaleNote(): HTMLElement {
    const ranges = reefs.filter((r) => r.aimsReefDhwRange2024).map((r) => `${r.name} ${fmt(r.aimsReefDhwRange2024![0], 2)}\u2013${fmt(r.aimsReefDhwRange2024![1], 2)}`).join('; ');
    return h('div', { class: 'stack-sm' },
      h('p', { style: 'margin:0' }, 'The three \u201Creefs\u201D on the graph are NOAA regional virtual stations. Each line is a hot-end figure for a whole region (the 90th-percentile pixel), not the heat stress at one reef.'),
      ranges ? h('p', { style: 'margin:0' }, `At the reefs AIMS actually surveyed in ${SUMMER}, the heat stress it measured was lower than the regional line: ${ranges} \u00B0C-weeks. The Torres Strait region is the clearest case.`) : null,
      h('p', { class: 'muted', style: 'margin:0' }, 'This is a teaching point, not a mistake: a regional satellite number and a single reef can tell different stories. Scale matters when you decide how far satellite data can be pushed.'));
  }
  function stepReveal(): HTMLElement {
    const fl = reefs.find((r) => r.id === st.flightReef) ?? reefs[0];
    const sv = fl.survey[SUMMER];
    const pred = st.predict?.choice ?? '';
    const known = outcome.top !== null;
    const held = known && predictionHeld(outcome, pred);
    const topNames = outcome.topIds.map(nameOf).join(' and ');
    const rows = reefs.map((r, i) => {
      const sv2 = r.survey[SUMMER];
      const peak = reefPeak(r, SUMMER);
      return h('tr', null,
        h('th', { scope: 'row' }, h('span', { style: `display:inline-block;width:10px;height:10px;border-radius:50%;background:${REEF_COLOURS[i]};margin-right:.5rem` }), r.name),
        h('td', { class: 'mono' }, peak === undefined ? '\u2013' : `${fmt(peak, 1)} \u00B0C-weeks`),
        h('td', { style: 'white-space:normal;text-align:left' }, sv2 ? h('span', null, h('strong', { class: 'mono' }, `Category ${catText(sv2)}`), ` \u00B7 ${sv2.label}`) : '\u2013'),
        h('td', { class: 'mono' }, r.aimsReefDhwRange2024 ? `${fmt(r.aimsReefDhwRange2024[0], 2)}\u2013${fmt(r.aimsReefDhwRange2024[1], 2)}` : '\u2013'));
    });
    const scale = h('ol', { style: 'list-style:none;padding:0;margin:0;display:grid;gap:.35rem' }, data.surveyScale.map((c) =>
      h('li', { style: 'display:flex;gap:.6rem;align-items:baseline' }, h('span', { class: 'mono', style: `min-width:1.6rem;text-align:center;border-radius:4px;padding:0 .3rem;background:${CAT_COLOURS[Math.min(5, c.category)]};color:${c.category >= 3 ? '#0b1424' : '#fff'}` }, String(c.category)), h('span', null, h('strong', null, c.label), ' \u2013 ', c.description))));
    const verdictBody = !known ? 'There is no survey result to compare with your prediction.'
      : held
        ? `You predicted ${nameOf(pred)}, and the survey agrees${outcome.topIds.length > 1 && pred !== 'same' ? ` (${topNames} were level at the top)` : ''}. One summer is a small sample, so ask what could still make this misleading.`
        : `You predicted ${nameOf(pred)}. The survey puts ${outcome.allSame ? 'every area level' : topNames} at the top. Heat stress measures risk, not the result. Being overturned is how the evidence gets sharper.`;
    return h('div', { class: 'cols wide-left' },
      h('div', { class: 'stack' },
        Card(`Survey flight: ${fl.name}`, [
          sv ? h('div', { class: 'stack-sm fade-in' },
            h('div', { style: 'display:flex;gap:1rem;align-items:center' },
              h('div', { class: 'cat-chip', style: `background:${CAT_COLOURS[Math.min(5, sv.category)]};color:${sv.category >= 3 ? '#0b1424' : '#fff'}`, 'aria-hidden': 'true' }, catText(sv)),
              h('div', null, h('p', { class: 'panel-title' }, `AIMS aerial survey ${SUMMER}`), h('div', { style: 'font-size:1.15rem;font-weight:650;line-height:1.3' }, `Category ${catText(sv)}: ${sv.label}`))),
            distBar(sv),
            sv.note ? h('p', { class: 'muted' }, sv.note) : null) : h('p', { class: 'muted' }, 'No survey result is recorded for this area.'),
        ], { eyebrow: 'Step 3 \u00B7 the reveal' }),
        Card('All results', [
          h('div', { class: 'data-table-wrap', style: 'max-height:none' }, h('table', null,
            h('caption', null, 'Peak heat stress and aerial survey result by area'),
            h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Area'), h('th', { scope: 'col' }, `Peak DHW ${SUMMER}`), h('th', { scope: 'col', style: 'text-align:left' }, 'Survey result'), h('th', { scope: 'col' }, 'Measured at surveyed reefs (\u00B0C-weeks)'))),
            h('tbody', null, rows))),
          h('div', { style: 'height:.8rem' }),
          Callout(held ? 'Your prediction held up' : known ? 'The ground truth overturned your prediction' : 'Survey result unavailable', verdictBody, held ? 'good' : 'warn'),
        ]),
        Card('Regional figures, not single reefs', [scaleNote()], { flat: true }),
        PartNav({ back: { label: 'Back', onClick: () => go(1) }, next: { label: 'Check against the ground', onClick: () => advance(3) } })),
      Card('Survey scale', [scale], { flat: true }));
  }

  /* ---------- step 3: ground truth ---------- */
  function stepGround(): HTMLElement {
    const bs = buoyStats(buoy);
    const bx = buoy.series.map((p) => isoToYear(p.date));
    const buoyX0 = Math.min(...bx), buoyX1 = Math.max(...bx), buoySpan = buoyX1 - buoyX0;
    const chart = createLineChart({
      title: `Logger at ${buoy.depth_m} m against satellite skin temperature at ${buoy.site}`,
      series: [
        { id: 'logger', label: `Logger at ${buoy.depth_m} m`, color: '#e69f00', points: buoy.series.map((p) => ({ x: isoToYear(p.date), y: p.logger_c })), markers: false },
        { id: 'sat', label: 'Satellite skin SST', color: '#56b4e9', points: buoy.series.map((p) => ({ x: isoToYear(p.date), y: p.satellite_c })), markers: false },
      ],
      xLabel: 'Date', yLabel: 'Sea temperature', yUnit: '°C', xFormat: buoySpan > 0.6 ? yearToLabel : yearToDayLabel, xTicks: buoySpan > 0.25 ? monthTicks(buoyX0, buoyX1) : undefined, yDecimals: 1, aspect: 0.45,
      tableXHeader: 'Date (decimal year)', tableCaption: `Logger and satellite sea temperature, ${buoy.site}`,
    });
    charts.push(chart);
    const done = st.whyDiffer;
    const opts = REEF_WHY.map((o) => ({ id: o.id, text: o.text, state: done ? (o.correct ? ('right' as const) : done === o.id ? ('wrong' as const) : undefined) : undefined }));
    const group = ChoiceGroup({ name: 'why', legend: 'Why do the two lines differ?', options: opts, value: done, locked: !!done, onChange: (v) => {
      st.whyDiffer = v as string;
      award(ctx.state, 'reef.why', REEF_WHY.find((o) => o.id === v)?.correct ? itemMax('reef.why') : 0);
      ctx.save(); render();
    } });
    const good = REEF_WHY.find((o) => o.id === done)?.correct;
    return h('div', { class: 'cols wide-left' },
      h('div', { class: 'stack' },
        Card('Ground truth', [
          chart.el,
          h('div', { class: 'readouts', style: 'margin-top:.8rem' },
            Readout('Mean difference', fmt(bs.meanDiff, 2), '°C (satellite − logger)'),
            Readout('Largest gap', fmt(bs.maxAbsDiff, 2), '°C'),
            Readout('Logger depth', fmt(buoy.depth_m, 1), 'm')),
        ], { eyebrow: 'Step 4 · check the satellite' }),
        PartNav({ back: { label: 'Back', onClick: () => go(2) }, next: { label: 'Compare the peaks', disabled: !done, onClick: () => advance(4) }, hint: done ? undefined : 'Answer the question first' })),
      Card('Explain the gap', [group, done ? h('div', { class: 'fade-in', style: 'margin-top:.8rem' }, Callout(good ? 'Right' : 'Not quite', REEF_WHY.find((o) => o.correct)!.feedback ?? '', good ? 'good' : 'warn')) : null], { flat: true }));
  }

  /* ---------- step 4: quantified comparison ---------- */
  function stepCompare(): HTMLElement {
    const hi = ranked[0], lo = ranked[ranked.length - 1];
    const pHi = reefPeak(hi, SUMMER), pLo = reefPeak(lo, SUMMER);
    const truth = { peak: pHi ?? NaN, ratio: pLo !== undefined && pLo >= 0.05 && pHi !== undefined ? pHi / pLo : null };
    const peakIn = h('input', { type: 'number', step: '0.1', min: '0', id: 'q-peak', inputmode: 'decimal', value: st.quant ? String(st.quant.peak) : undefined });
    const ratioIn = h('input', { type: 'number', step: '0.1', min: '0', id: 'q-ratio', inputmode: 'decimal', value: st.quant ? String(st.quant.ratio) : undefined });
    const fb = h('div', { 'aria-live': 'polite' });
    let showAnswer = false;
    function paint() {
      clear(fb);
      const q = st.quant;
      if (!q) return;
      const ok = q.peakOk && q.ratioOk;
      fb.append(Callout(ok ? 'Within tolerance' : 'Not quite yet',
        ok ? `Peak ${fmt(truth.peak, 1)} °C-weeks${truth.ratio !== null ? `, ${fmt(truth.ratio, 1)} × ${lo.name}` : ''}. Answers within about ${PEAK_TOLERANCE.rel * 100}% of the data count.`
          : `${q.peakOk ? '' : 'Check your peak: hover the chart at the top of the summer band. '}${q.ratioOk ? '' : 'Check your ratio: divide the higher peak by the lower one. '}Your first attempt is what scores.`,
        ok ? 'good' : 'warn'));
      if (!ok && !showAnswer) fb.append(h('div', { style: 'margin-top:.6rem' }, Button('Show me the values', { small: true, onClick: () => { showAnswer = true; paint(); } })));
      if (!ok && showAnswer) fb.append(h('p', { class: 'mono', style: 'margin:.6rem 0 0' }, `${hi.name}: ${fmt(truth.peak, 1)} °C-weeks${truth.ratio !== null ? ` · ${fmt(truth.ratio, 2)} × ${lo.name}` : ''}`));
    }
    const chart = heatChart(reefs); charts.push(chart);
    const submit = Button(st.quant ? 'Check again' : 'Check my numbers', { variant: 'primary', onClick: () => {
      const peak = parseFloat(peakIn.value), ratio = truth.ratio === null ? 0 : parseFloat(ratioIn.value);
      if (!Number.isFinite(peak) || (truth.ratio !== null && !Number.isFinite(ratio))) { fb.textContent = 'Enter a number in each box.'; return; }
      const r = scoreQuantified({ peak, ratio }, truth);
      const tries = (st.quant?.tries ?? 0) + 1;
      if (tries === 1) { award(ctx.state, 'reef.peak', r.points.peak); award(ctx.state, 'reef.ratio', r.points.ratio); }
      st.quant = { peak, ratio, tries, peakOk: r.peakOk, ratioOk: r.ratioOk };
      ctx.save(); paint(); submit.textContent = 'Check again';
      nextBtn.disabled = false;
    } });
    const nextBtn = Button('Now the limits', { variant: 'primary', disabled: !st.quant, onClick: () => advance(5) });
    paint();
    return h('div', { class: 'cols wide-left' },
      h('div', { class: 'stack' },
        Card(`Reef comparison, summer ${SUMMER}`, [chart.el], { eyebrow: 'Step 5 · put a number on it' }),
        h('div', { class: 'spread no-print' }, Button('Back', { variant: 'ghost', onClick: () => go(3) }), nextBtn)),
      Card('Quantify it', [
        h('p', null, `${hi.name} had the highest peak and ${lo.name} the lowest. Read the ${SUMMER} peaks from the chart: hover, or use the arrow keys (hold Shift to jump).`),
        h('div', { class: 'field' }, h('label', { for: 'q-peak' }, `${hi.name}'s peak DHW in ${SUMMER} was`), h('div', { class: 'input-unit' }, peakIn, h('span', null, '°C-weeks'))),
        truth.ratio !== null ? h('div', { class: 'field', style: 'margin-top:.7rem' }, h('label', { for: 'q-ratio' }, `That is how many times ${lo.name}'s peak?`), h('div', { class: 'input-unit' }, ratioIn, h('span', null, '×'))) : null,
        h('div', { class: 'row', style: 'margin:1rem 0 .6rem' }, submit),
        fb,
        h('p', { class: 'muted small' }, `Tolerance: peak within ±${PEAK_TOLERANCE.abs} °C-weeks or ${PEAK_TOLERANCE.rel * 100}%, ratio within ±${RATIO_TOLERANCE.abs} or ${RATIO_TOLERANCE.rel * 100}%.`),
      ], { flat: true }));
  }

  /* ---------- step 5: limits ---------- */
  function stepLimits(): HTMLElement {
    const done = !!st.limits;
    const order = LIMIT_ORDER.map((id) => REEF_LIMITS.find((o) => o.id === id)!);
    let picked: string[] = st.limits ?? [];
    const score = done ? scoreLimitSelection(st.limits!) : null;
    const submit = Button('Submit limitations', { variant: 'primary', disabled: !picked.length, onClick: () => {
      st.limits = picked;
      award(ctx.state, 'reef.limits', scoreLimitSelection(picked).points);
      st.step = Math.max(st.step, 6); ctx.save(); render();
    } });
    const opts = order.map((o) => ({ id: o.id, text: o.text, state: done ? (o.valid ? ('right' as const) : st.limits!.includes(o.id) ? ('wrong' as const) : undefined) : undefined }));
    const chart = heatChart(reefs); charts.push(chart);
    return h('div', { class: 'cols' },
      h('div', { class: 'stack' },
        Card('What limits this evidence?', [
          h('p', null, 'You compared heat stress with survey results. Pick every limitation that really applies. Careful: a wrong pick costs a point.'),
          ChoiceGroup({ name: 'limits', legend: 'Limitations on what we can conclude', options: opts, multiple: true, value: picked, locked: done, onChange: (v) => { picked = v as string[]; submit.disabled = !picked.length; } }),
          done ? null : h('div', { class: 'row', style: 'margin-top:1rem' }, submit),
          done ? h('div', { class: 'fade-in', style: 'margin-top:1rem' }, Callout('Attribution limit', `Green ones are real limits on this evidence. DHW predicts risk, not outcome; these were regional hot-end figures, not single reefs; and one summer cannot make a trend. You scored ${score!.points} of ${itemMax('reef.limits')} here.`, 'good')) : null,
        ], { eyebrow: 'Step 6 · attribution' }),
        PartNav({ back: { label: 'Back', onClick: () => go(4) }, next: { label: 'On to the transfer cases', disabled: !done, onClick: () => { ctx.finish('reef'); } } })),
      Card('The evidence you had', [chart.el], { flat: true }));
  }

  function render() {
    if (!alive) return;
    while (charts.length) charts.pop()!.destroy();
    const keepScroll = window.scrollY;
    clear(root);
    root.append(
      PartHeader('Part 3 · Reef investigation · about 20 minutes', `${['Two', 'Three'][reefs.length - 2] ?? reefs.length} reef areas, one summer`, 'Can satellite heat stress tell you which part of the reef bleached? Predict first, then let the ground truth answer.'),
      h('div', { style: 'margin-bottom:1rem' }, StepList(STEPS, view, Math.min(st.step, 5), go)),
      [stepPredict, stepFlight, stepReveal, stepGround, stepCompare, stepLimits][view]());
    window.scrollTo({ top: keepScroll });
  }
  render();
  return () => { alive = false; while (charts.length) charts.pop()!.destroy(); };
}
