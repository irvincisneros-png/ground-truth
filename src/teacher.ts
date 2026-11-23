import './styles/tokens.css';
import './styles/base.css';
import { h, clear } from './ui/dom';
import { loadMany, loadLand } from './data/load';
import { buoyStats, parseWindows, findDropPair, annualMeans, reefList, reefPeak, seaIceTrend, seriesRecords, surveyOutcome, windowRate } from './data/derive';
import { CLAIMS, EVIDENCE, FOREST_CAUTION, ICE_SHEET, ICE_STATEMENT, LAUNCH_GUESS, LIMITATIONS, REEF_LIMITS, REEF_WHY, SEA_CONCLUSION, SEA_GAUGE, STRENGTHS, type Option } from './content';
import { briefingMax } from './scoring';
import { fmt } from './ui/chart-math';
import type { DataFiles, Source } from './data/types';

const root = document.getElementById('teacher-root')!;
const base = import.meta.env.BASE_URL;

const sec = (title: string, ...body: (Node | string | null)[]) => h('section', { class: 'panel' }, h('h2', { style: 'font-size:1.25rem' }, title), ...body);
const tbl = (head: string[], rows: (Node | string)[][]) => h('div', { style: 'overflow-x:auto' }, h('table', { class: 't' }, h('thead', null, h('tr', null, head.map((c) => h('th', null, c)))), h('tbody', null, rows.map((r) => h('tr', null, r.map((c) => h('td', null, c)))))));
const right = (opts: Option[]) => opts.find((o) => o.correct)?.text ?? '';
const pending = (what: string) => h('span', { class: 'muted' }, `[${what}: data file not available yet]`);

const LESSON: [string, string, string, string][] = [
  ['0:00', 'Launch (5 min)', 'Read the hook, commit an answer, see the mission map.', 'Ask: “Can a satellite photograph temperature?” Take three guesses before they commit.'],
  ['0:05', 'Sensor lab (8 min)', 'Four stations in any order: thermal infrared, radar altimeter, optical multispectral, passive microwave.', 'Circulate. Ask each pair: “What was the raw signal? What did the scientists calculate from it?”'],
  ['0:13', 'Reef investigation (20 min)', 'Predict and commit with confidence, spend one survey flight, see the reveal, compare logger with satellite, quantify the peaks, pick limitations.', 'Hold the class at the prediction until everyone has committed. After the reveal, ask who was overturned and why that is good science.'],
  ['0:33', 'Transfer cases (10 min)', 'Sea level, forest, ice, each about 3 minutes. Each has a trap and ends on the long record.', 'Name the trap out loud at the end of each case: cherry-picked pair, identical-looking pixels, one record year.'],
  ['0:43', 'Minister briefing (7 min)', 'Build a claim, a strength, 2–3 evidence cards and one limitation.', 'Pre-teach nothing. Remind them that “proves” and “no evidence” both cost points when they overshoot.'],
  ['0:50', 'Debrief', 'Evidence points, where this is used, print or copy the summary.', 'Collect the copied text or printed page. Read a few free-text notes aloud.'],
];

const MISCONCEPTIONS: [string, string][] = [
  ['“The satellite takes a picture of the temperature.”', 'It records radiance: infrared, microwave or reflected light arriving at a sensor. Temperature, height and cover are calculated from that signal, with uncertainty.'],
  ['“Altimeters scan the whole ocean like a camera.”', 'An altimeter measures straight down along thin ground tracks, with gaps of hundreds of kilometres at the equator. The global picture is built over time.'],
  ['“Infrared satellites see through cloud.”', 'Thermal infrared is blocked by cloud. That is why the reef pixel goes to “no data” and why gap-filled blended products exist. Passive microwave does see through cloud.'],
  ['“DHW is a hot day.”', 'Degree Heating Weeks add up how much hotter than the usual summer maximum the water was, and for how long. It is accumulated stress, not a single temperature. It predicts risk, not the bleaching outcome.'],
  ['“Sea ice melting raises sea level.”', 'Floating sea ice already displaces its own weight of water. Melting ice sheets on land raise sea level, and these need gravity (GRACE) or laser altimetry (ICESat-2).'],
  ['“A record low means a trend.”', 'One record, high or low, is a single data point. A trend needs many years pointing the same way. Compare the Antarctic swings with the steady Arctic September decline.'],
  ['“Tree-cover loss, deforestation and climate impact are the same thing.”', 'Loss pixels mark canopy that is gone. Deforestation is a permanent change in land use. Climate links need separate evidence such as fire-weather research. Burnt eucalypt forest often resprouts.'],
  ['“The satellite and the buoy disagree, so one is wrong.”', 'They measure different things: skin against depth, a pixel against a point. Ground truth tests how far the satellite number can be trusted.'],
];

function build(d: Partial<DataFiles>, hasLand: boolean) {
  clear(root);
  const reefs = d.reef ? reefList(d.reef) : [];
  const out = d.reef ? surveyOutcome(reefs, '2024') : null;
  const annual = d.sealevel ? annualMeans(d.sealevel.gmsl) : [];
  const trap = d.sealevel ? findDropPair(annual) : null;
  const [e, l] = d.sealevel ? parseWindows(d.sealevel.rates ?? {}) : [[1993, 2002], [2015, 2024]];
  const antSep = d.seaice ? seriesRecords(d.seaice.antarctic.sep_max) : null;
  const arcTrend = d.seaice ? seaIceTrend(d.seaice.arctic.sep) : null;

  const reefAnswers = reefs.length
    ? tbl(['Reef', 'Peak DHW 2024', 'Aerial survey 2024'], reefs.map((r) => [r.name, `${fmt(reefPeak(r, '2024') ?? NaN, 1)} °C-weeks`, r.survey['2024'] ? `${r.survey['2024'].category} · ${r.survey['2024'].label}` : '–']))
    : pending('reef data');
  const buoy = d.buoy ? buoyStats(d.buoy) : null;

  root.append(h('div', { class: 't-wrap stack' },
    h('div', { class: 'spread no-print' },
      h('a', { class: 'btn ghost small', href: base }, 'Open the student lesson'),
      h('button', { class: 'btn small', type: 'button', onclick: () => window.print() }, 'Print this guide')),
    h('header', null, h('p', { class: 'eyebrow' }, h('span', { class: 'dot' }), 'Teacher guide'), h('h1', null, 'Ground Truth'),
      h('p', { class: 'muted' }, 'A one-period Year 9 lesson-game. Students judge how strongly satellite evidence supports a climate claim, and find that ground truth can overturn what they predicted.')),

    sec('At a glance', tbl(['Topic', 'Detail'], [
      ['Syllabus', 'NSW Science 7–10 (2023), Stage 5, Environmental Sustainability, dot point 4.3.4: investigate how satellites collect global data, including data on ocean temperatures, sea levels, and forest and ice cover, and examine how this data is used to evaluate the impact of climate change.'],
      ['Time', 'One period, about 50 minutes. Nothing is timed on screen.'],
      ['Devices', 'School laptops and Chromebooks. Works at 1366×768 and down to phone width. No login, no accounts. Progress is saved in the browser on that device.'],
      ['Core skill', 'Judging how strongly evidence supports a claim: overclaiming and underclaiming are penalised equally.'],
      ['Web addresses', 'Add ?unlock to open every part at once (for previewing). Add ?draft to show the First Nations content that is still being checked.'],
    ])),

    sec('Lesson plan', tbl(['Clock', 'Part', 'Students', 'You'], LESSON)),

    sec('Answer guide', 
      h('h3', null, 'Launch'), h('p', null, `Hook answer: ${right(LAUNCH_GUESS)}`),
      h('h3', null, 'Sensor lab'), h('p', null, 'One point per station completed (4 in total). There are no right or wrong sensor picks. The trade-off card scores coverage, revisit, resolution, cloud and night.'),
      h('h3', null, 'Reef investigation'), reefAnswers,
      out ? h('p', null, `Most severe in the survey: ${out.top === 'same' ? 'the top reefs tied' : reefs.find((r) => r.id === out.top)?.name ?? 'unknown'}. A student whose prediction is overturned still scores the commitment points.`) : null,
      buoy && d.buoy ? h('p', null, `Logger at ${d.buoy.depth_m} m against satellite skin SST: mean difference ${fmt(buoy.meanDiff, 2)} °C (satellite minus logger), largest gap ${fmt(buoy.maxAbsDiff, 2)} °C. Accept: skin against depth, and a pixel against a point.`) : pending('buoy data'),
      h('p', null, `Why do they differ (correct): ${right(REEF_WHY)}`),
      h('p', null, 'Quantified comparison tolerance: peak within ±0.5 °C-weeks or 10%; ratio within ±0.2 or 15% (whichever is larger).'),
      h('p', null, 'Valid limitations: ', REEF_LIMITS.filter((o) => o.valid).map((o) => o.text).join(' '), ' Invalid (each costs a point): ', REEF_LIMITS.filter((o) => !o.valid).map((o) => o.text).join(' ')),
      h('h3', null, 'Sea level'),
      d.sealevel ? h('p', null, `From the data: ${e[0]}–${e[1]} ≈ ${fmt(windowRate(d.sealevel.gmsl, e[0], e[1]) ?? NaN, 1)} mm/yr; ${l[0]}–${l[1]} ≈ ${fmt(windowRate(d.sealevel.gmsl, l[0], l[1]) ?? NaN, 1)} mm/yr (least-squares over every point in the window).${trap ? ` The trap pair is ${trap.y0} to ${trap.y1}, a change of ${fmt(trap.delta_mm, 1)} mm in annual means.` : ''} Tide gauge: ${d.sealevel.tideGauge.station}.`) : pending('sea level data'),
      h('p', null, `Best conclusion: ${right(SEA_CONCLUSION)}`), h('p', null, `Gauge difference: ${right(SEA_GAUGE)}`),
      h('h3', null, 'Forest'),
      d.forest ? tbl(['Case', 'Overlay', 'Expected answer', 'Note'], d.forest.cases.map((c) => [c.label, c.overlayKind, c.answer, c.note])) : pending('forest data'),
      h('p', null, `Attribution: ${right(FOREST_CAUTION)}`),
      h('h3', null, 'Ice'),
      d.seaice ? h('p', null, `Antarctic September maximum: record high ${antSep?.high.year ?? '–'} (${fmt(antSep?.high.extent_mkm2 ?? NaN, 2)} million km²), record low ${antSep?.low.year ?? '–'} (${fmt(antSep?.low.extent_mkm2 ?? NaN, 2)} million km²). Arctic September trend: ${arcTrend ? fmt(arcTrend.mkm2PerDecade, 2) + ' million km² per decade (' + fmt(arcTrend.pctPerDecade, 1) + '% of the mean)' : '–'}; published ${fmt(d.seaice.trendPctPerDecade?.arctic_sep ?? NaN, 1)}% per decade.`) : pending('sea ice data'),
      h('p', null, `Best statement: ${right(ICE_STATEMENT)}`), h('p', null, `Sea ice and sea level: ${right(ICE_SHEET)}`)),

    sec('Minister briefing: marking guide',
      h('p', null, `Scored out of ${briefingMax()} by the rules in src/scoring.ts: strength 3, evidence 4, limitation 3. A strength one step from the honest one earns 1 point, two or more steps earns 0, whichever direction. Each core card is +2, each background card +1, each card that does not test the claim (and the cherry-picked pair) is −1. Evidence is capped at 4. A primary limitation is 3 points, a related one 1, a mismatch 0. The free-text note is not marked: use the rubric below.`),
      tbl(['Claim', 'Honest strength', 'Why', 'Core evidence', 'Primary limitations'], CLAIMS.map((c) => [
        c.text, STRENGTHS[c.justified].label, c.why,
        EVIDENCE.filter((e) => e.rel[c.id] === 'core').map((e) => e.title).join('; '),
        LIMITATIONS.filter((x) => x.match[c.id] === 'primary').map((x) => x.title).join('; '),
      ])),
      h('h3', { style: 'margin-top:1rem' }, 'Free-text rubric (teacher marked, optional)'),
      tbl(['Level', 'Looks like'], [
        ['3', 'Recommends an action or next measurement that follows from the evidence and the limitation.'],
        ['2', 'Restates the claim and limitation accurately, with a sensible next question.'],
        ['1', 'Vague or repeats the card text only.'],
      ])),

    sec('Common misconceptions', tbl(['Students may say', 'What to say back'], MISCONCEPTIONS)),

    sec('Scoring and saving',
      h('p', null, 'Points are evidence points per part. There are no ranks and no shop. Predictions score for committing, not for being right. Only first attempts score: a retry never changes the total. Progress is stored in the browser under the key ground-truth:v1; “Start again” clears it.')),

    sec('Syllabus mapping', tbl(['Syllabus idea', 'Where in the lesson'], [
      ['Satellites collect global data: ocean temperature', 'Sensor lab (thermal infrared); Reef investigation (heat stress, logger against satellite)'],
      ['Satellites collect global data: sea level', 'Sensor lab (radar altimeter); Sea level transfer case'],
      ['Satellites collect global data: forest cover', 'Sensor lab (optical multispectral); Forest transfer case'],
      ['Satellites collect global data: ice cover', 'Sensor lab (passive microwave); Ice transfer case'],
      ['Examine how the data is used to evaluate climate change', 'Reef investigation; three transfer cases; Minister briefing claim builder'],
      ['Working scientifically: evaluating evidence, limitations, data literacy', 'Predict and commit, ground truth, quantified comparison, limitation picks, claim strength'],
    ]), h('p', { class: 'muted small', style: 'margin-top:.6rem' }, 'Outcome codes are not listed here. Add the Stage 5 outcome codes your faculty uses for 2023 programming.')),

    sec('Data sources and licences', d.reef || d.sealevel || d.seaice || d.forest || d.buoy ? sources(d) : pending('any data'), hasLand ? null : null),
  ));
}

function sources(d: Partial<DataFiles>): Node {
  const rows: (Node | string)[][] = [];
  const seen = new Set<string>();
  for (const [file, data] of Object.entries(d)) {
    for (const so of ((data as { sources?: Source[] }).sources ?? [])) {
      const k = `${so.name}|${so.url}`;
      if (seen.has(k)) continue;
      seen.add(k);
      rows.push([`${file}.json`, h('a', { href: so.url, target: '_blank', rel: 'noopener' }, so.name), so.licence, so.citation, so.retrieved]);
    }
  }
  rows.push(['geo/au-land.json', h('a', { href: 'https://www.naturalearthdata.com/', target: '_blank', rel: 'noopener' }, 'Natural Earth 1:50m land'), 'Public domain', 'Made with Natural Earth.', '']);
  return tbl(['File', 'Source', 'Licence', 'Citation', 'Retrieved'], rows);
}

root.append(h('p', { class: 'muted', style: 'padding:2rem', role: 'status' }, 'Loading the guide…'));
Promise.all([loadMany(['reef', 'buoy', 'sealevel', 'forest', 'seaice']), loadLand()]).then(([d, land]) => build(d, land.ok));
