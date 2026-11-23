import { h, s } from '../ui/dom';
import { Button, Callout, ChoiceGroup } from '../ui/components';
import { LAUNCH_GUESS, LAUNCH_REVEAL } from '../content';
import { award } from '../state';
import { commitPoints } from '../scoring';
import { LockChip, type PartMount } from './shared';

/** Authored hero art: a satellite, its signal and the question mark. Pure SVG, no images. */
function heroArt(): SVGElement {
  return s('svg', { viewBox: '0 0 420 300', role: 'img', 'aria-label': 'A satellite above Earth sending down a question mark: what does it actually measure?', class: 'scan', style: 'width:100%;height:auto;max-width:460px;justify-self:center;border:1px solid var(--line);border-radius:12px;background:#08122a' },
    s('defs', null,
      s('radialGradient', { id: 'earth-g', cx: '50%', cy: '0%', r: '90%' }, s('stop', { offset: '0', 'stop-color': '#1d4d86' }), s('stop', { offset: '1', 'stop-color': '#0b1f3d' })),
      s('linearGradient', { id: 'beam-g', x1: 0, y1: 0, x2: 0, y2: 1 }, s('stop', { offset: '0', 'stop-color': '#7cc4ff', 'stop-opacity': '.55' }), s('stop', { offset: '1', 'stop-color': '#7cc4ff', 'stop-opacity': '0' }))),
    // stars: fixed, hand-placed, so the art is the same every time
    ...[[30, 30], [90, 70], [150, 22], [260, 40], [330, 24], [380, 80], [60, 140], [370, 150], [210, 14]].map(([x, y]) => s('circle', { cx: x, cy: y, r: 1.2, fill: '#9fb0d4', opacity: '.7' })),
    s('ellipse', { cx: 210, cy: 330, rx: 330, ry: 150, fill: 'url(#earth-g)', stroke: '#2a3d63' }),
    s('path', { d: 'M80 214 Q150 188 210 192 Q290 196 345 222', fill: 'none', stroke: '#3a5486', 'stroke-width': 1, opacity: '.7' }),
    s('path', { d: 'M110 236 Q200 214 320 240', fill: 'none', stroke: '#3a5486', 'stroke-width': 1, opacity: '.5' }),
    s('path', { d: 'M210 96 L150 216 L270 216 Z', fill: 'url(#beam-g)' }),
    // satellite
    s('g', { transform: 'translate(210 82) rotate(-18)' },
      s('rect', { x: -9, y: -10, width: 18, height: 20, rx: 2, fill: '#c9d6f2', stroke: '#e8eefc' }),
      s('rect', { x: -52, y: -6, width: 38, height: 12, fill: '#1f4f94', stroke: '#7cc4ff' }),
      s('rect', { x: 14, y: -6, width: 38, height: 12, fill: '#1f4f94', stroke: '#7cc4ff' }),
      s('path', { d: 'M-52 0H-14M14 0H52M-33 -6V6M33 -6V6', stroke: '#7cc4ff', 'stroke-width': 1, opacity: '.7' }),
      s('circle', { cx: 0, cy: 12, r: 5, fill: '#ffb547' })),
    s('text', { x: 210, y: 192, 'text-anchor': 'middle', fill: '#ffb547', style: 'font:700 54px ui-monospace,Menlo,monospace' }, '?'),
    s('text', { x: 14, y: 288, fill: '#9fb0d4', style: 'font:600 10px ui-monospace,Menlo,monospace;letter-spacing:.14em' }, 'RADIANCE IN, MEANING OUT'));
}

export const mountLaunch: PartMount = (root, ctx) => {
  const st = ctx.state;
  function render() {
    root.textContent = '';
    const committed = st.launch.guess;
    const guessOpts = LAUNCH_GUESS.map((o) => ({
      id: o.id, text: o.text,
      state: committed ? (o.correct ? ('right' as const) : committed === o.id ? ('wrong' as const) : undefined) : undefined,
    }));
    let pick = committed ?? '';
    const commit = Button('Lock in my answer', { variant: 'primary', disabled: true, onClick: () => {
      if (!pick) return;
      st.launch.guess = pick;
      award(st, 'launch.guess', commitPoints(true, 1));
      ctx.save();
      render();
    } });
    const group = ChoiceGroup({ name: 'launch-guess', legend: 'What does a satellite actually record?', options: guessOpts, value: committed, locked: !!committed, onChange: (v) => { pick = v as string; commit.disabled = false; } });

    root.append(
      h('section', { class: 'hero' },
        h('div', null,
          h('p', { class: 'eyebrow' }, h('span', { class: 'dot' }), 'Year 9 · Environmental sustainability · 4.3.4'),
          h('h1', null, 'A satellite never photographs temperature.'),
          h('p', { class: 'lede' }, 'So what does it measure? And once you know, how much can you trust it when someone makes a claim about climate change?'),
          h('p', { class: 'muted' }, 'About 50 minutes. Real data. No login. Your answers stay on this device.')),
        heroArt()),
      h('div', { class: 'cols' },
        h('section', { class: 'panel stack-sm' },
          h('p', { class: 'eyebrow' }, 'Warm-up · commit first'),
          group,
          committed ? h('div', { class: 'stack-sm fade-in' }, h('div', null, LockChip('Answer locked')), Callout('What is really going on', LAUNCH_REVEAL, 'good')) : h('div', { class: 'row' }, commit, h('span', { class: 'muted small' }, 'You get the point for committing, right or wrong.'))),
        h('section', { class: 'panel stack-sm' },
          h('p', { class: 'eyebrow' }, 'Mission map'),
          h('ol', { class: 'mission-map', style: 'grid-template-columns:1fr 1fr' },
            h('li', null, h('span', { class: 'n' }, 'STEP 1 · 8 MIN'), h('span', { class: 't' }, 'Sensor lab'), h('span', { class: 'd' }, 'Four sensors. Raw signal in, number out.')),
            h('li', null, h('span', { class: 'n' }, 'STEP 2 · 20 MIN'), h('span', { class: 't' }, 'Reef investigation'), h('span', { class: 'd' }, 'Predict, spend one flight, let the ground truth overturn you.')),
            h('li', null, h('span', { class: 'n' }, 'STEP 3 · 10 MIN'), h('span', { class: 't' }, 'Three transfer cases'), h('span', { class: 'd' }, 'Sea level, forest and ice. Each has a trap.')),
            h('li', null, h('span', { class: 'n' }, 'STEP 4 · 7 MIN'), h('span', { class: 't' }, 'Minister briefing'), h('span', { class: 'd' }, 'Make a claim. Say how strongly the evidence backs it.'))),
          h('div', { class: 'row end' }, Button('Begin the mission', { variant: 'primary', disabled: !committed, onClick: () => ctx.finish('launch') }), committed ? null : h('span', { class: 'muted small' }, 'Lock in your answer first.')))));
  }
  render();
};
