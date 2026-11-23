import { h, clear, put } from '../ui/dom';
import { Button, Callout, Card, ChoiceGroup } from '../ui/components';
import { CLAIMS, EVIDENCE, LIMITATIONS, STRENGTHS } from '../content';
import { award } from '../state';
import { EVIDENCE_MAX, EVIDENCE_MIN, briefingMax, claimById, evidenceById, limitationById, scoreBriefing, type BriefingResult } from '../scoring';
import { PartHeader, type PartMount } from './shared';

const VERB = ['gives no evidence for', 'suggests', 'strongly supports', 'proves'];

export const mountBriefing: PartMount = (root, ctx) => {
  const st = ctx.state.briefing;
  const d = st.draft;
  let practice: BriefingResult | null = null;
  let alive = true;
  const memo = h('div', { class: 'memo', 'aria-live': 'polite' });
  const resultBox = h('div', { class: 'stack' });
  const submit = Button('Send the briefing', { variant: 'primary', onClick: () => doSubmit() });

  function result(): BriefingResult {
    return scoreBriefing({ claimId: d.claimId ?? '', strength: d.strength ?? -1, evidenceIds: d.evidence, limitationId: d.limitationId ?? '' });
  }

  function paintMemo() {
    clear(memo);
    const claim = d.claimId ? claimById(d.claimId) : undefined;
    const lim = d.limitationId ? limitationById(d.limitationId) : undefined;
    put(memo, 
      h('h4', null, 'Briefing note · To the Minister for the Environment'),
      claim ? h('p', { class: 'claim' }, claim.text) : h('p', { class: 'muted' }, 'Choose a claim to begin.'),
      d.strength !== undefined ? h('p', null, 'The satellite evidence ', h('span', { class: 'strength' }, VERB[d.strength]), ' this claim.') : null,
      h('h4', null, 'Evidence'),
      d.evidence.length ? h('ul', null, d.evidence.map((id) => h('li', null, evidenceById(id)?.title ?? id))) : h('p', { class: 'muted' }, `Choose ${EVIDENCE_MIN} or ${EVIDENCE_MAX} cards.`),
      h('h4', null, 'Limitation'),
      lim ? h('p', null, h('strong', null, lim.title + '. '), lim.text) : h('p', { class: 'muted' }, 'Choose one.'),
      d.freeText.trim() ? h('div', null, h('h4', null, 'Note from the analyst'), h('p', null, d.freeText.trim())) : null);
    const r = result();
    submit.disabled = !r.valid;
    submit.textContent = st.first ? 'Check my revision (practice)' : 'Send the briefing';
  }

  function paintResult(r: BriefingResult, isPractice: boolean) {
    clear(resultBox);
    if (!r.valid) return;
    const claim = claimById(d.claimId!)!;
    const evRows = r.evidence.cards.map((c) => h('li', null,
      h('strong', null, c.title), ' – ',
      c.trap ? 'a trap: one hand-picked pair, not the record. ' : c.relevance === 'core' ? 'directly tests your claim. ' : c.relevance === 'support' ? 'useful background, but it does not test the claim directly. ' : 'does not test this claim. ',
      h('span', { class: 'mono' }, `${c.points > 0 ? '+' : ''}${c.points}`)));
    put(resultBox, 
      Card(isPractice ? 'Practice check (not counted)' : 'Your first briefing is scored', [
        h('div', { class: 'readouts', style: 'margin-bottom:.8rem' },
          h('div', { class: 'readout' }, h('span', { class: 'k' }, 'Total'), h('span', { class: 'v' }, `${r.total} / ${r.max}`)),
          h('div', { class: 'readout' }, h('span', { class: 'k' }, 'Strength'), h('span', { class: 'v' }, `${r.strength.points} / ${r.strength.max}`)),
          h('div', { class: 'readout' }, h('span', { class: 'k' }, 'Evidence'), h('span', { class: 'v' }, `${r.evidence.points} / ${r.evidence.max}`)),
          h('div', { class: 'readout' }, h('span', { class: 'k' }, 'Limitation'), h('span', { class: 'v' }, `${r.limitation.points} / ${r.limitation.max}`))),
        Callout('Claim strength', `${r.messages[0]} The honest strength for this claim is “${STRENGTHS[r.strength.justified].label}”. ${claim.why}`, r.strength.direction === 'match' ? 'good' : 'warn'),
        h('h4', { style: 'margin-top:1rem' }, 'Your evidence'),
        h('ul', { style: 'margin:.2rem 0 0 1.1rem;padding:0;display:grid;gap:.3rem' }, evRows),
        h('div', { style: 'height:.8rem' }),
        Callout('Limitation', r.messages[r.messages.length - 1], r.limitation.match === 'primary' ? 'good' : 'warn'),
      ], { eyebrow: 'Marked by the rules, not by a person' }));
    if (!isPractice) put(resultBox, h('div', { class: 'row end no-print' }, Button('See my debrief', { variant: 'primary', onClick: () => ctx.finish('briefing') })));
  }

  function doSubmit() {
    const r = result();
    if (!r.valid) return;
    if (!st.first) {
      st.first = { ...d, evidence: [...d.evidence], points: r.total, max: r.max };
      award(ctx.state, 'briefing.strength', r.strength.points);
      award(ctx.state, 'briefing.evidence', r.evidence.points);
      award(ctx.state, 'briefing.limitation', r.limitation.points);
      ctx.save();
      practice = null;
      render();
      // the marked result sits at the top of the part: bring it into view and announce it
      window.scrollTo({ top: 0 });
      resultBox.setAttribute('role', 'status');
      resultBox.tabIndex = -1;
      resultBox.focus({ preventScroll: true });
      return;
    }
    practice = r;
    paintResult(r, true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function changed() { ctx.save(); paintMemo(); }

  function render() {
    if (!alive) return;
    clear(root);
    const locked = !!st.first;
    const form = h('div', { class: 'stack' },
      Card('1. Choose a claim', [
        ChoiceGroup({ name: 'claim', legend: 'Which claim will you brief the Minister on?', options: CLAIMS.map((c) => ({ id: c.id, text: c.text, detail: c.topic })), value: d.claimId, onChange: (v) => { d.claimId = v as string; changed(); } }),
      ], { eyebrow: 'Minister briefing' }),
      Card('2. How strongly does the evidence support it?', [
        h('div', { role: 'radiogroup', 'aria-label': 'Claim strength', class: 'seg' }, STRENGTHS.map((s) => {
          const input = h('input', { type: 'radio', name: 'strength', value: String(s.value) });
          input.checked = d.strength === s.value;
          input.addEventListener('change', () => { d.strength = s.value; changed(); });
          return h('label', null, input, h('span', { class: 't' }, s.label), h('span', { class: 'd' }, s.desc));
        })),
        h('p', { class: 'muted small', style: 'margin:.6rem 0 0' }, 'Claiming too much costs exactly as many points as claiming too little.'),
      ]),
      Card('3. Pick two or three pieces of evidence', [
        h('div', { class: 'card-grid' }, EVIDENCE.map((e) => {
          const input = h('input', { type: 'checkbox', value: e.id });
          input.checked = d.evidence.includes(e.id);
          const label = h('label', { class: 'ev-card' }, input, h('span', { class: 'tag' }, e.topic), h('span', { class: 't' }, e.title), h('span', { class: 'd' }, e.text));
          input.addEventListener('change', () => {
            if (input.checked && d.evidence.length >= EVIDENCE_MAX) { input.checked = false; return; }
            d.evidence = input.checked ? [...d.evidence, e.id] : d.evidence.filter((x) => x !== e.id);
            changed();
          });
          return label;
        })),
        h('p', { class: 'muted small', style: 'margin:.6rem 0 0' }, 'Careful: a card that does not test your claim loses you a point.'),
      ]),
      Card('4. Name one limitation (required)', [
        ChoiceGroup({ name: 'limitation', legend: 'What is the main weakness of this evidence for this claim?', options: LIMITATIONS.map((l) => ({ id: l.id, text: l.title, detail: l.text })), value: d.limitationId, onChange: (v) => { d.limitationId = v as string; changed(); } }),
      ]),
      Card('5. Add a note (optional)', [
        h('div', { class: 'field' }, h('label', { for: 'free' }, 'In your own words: what should the Minister do or ask next? Your teacher reads this. It is not marked by the app.'),
          (() => { const ta = h('textarea', { id: 'free', maxlength: '600', rows: '3' }); ta.value = d.freeText; ta.addEventListener('input', () => { d.freeText = ta.value; changed(); }); return ta; })()),
      ]));
    put(root, 
      PartHeader('Part 7 · Exit ticket · about 7 minutes', 'Brief the Minister', 'Choose a claim, say how strongly satellite evidence supports it, back it with evidence, and name its main limitation.'),
      locked ? h('div', { style: 'margin-bottom:1rem' }, Callout('First briefing locked', `Your first submission scored ${st.first!.points} of ${st.first!.max}. You can keep editing to see how changes would score, but only your first submission counts.`, 'good')) : null,
      h('div', { style: 'margin-bottom:1rem' }, resultBox),
      h('div', { class: 'cols wide-left' },
        form,
        h('div', { class: 'stack', style: 'position:sticky;top:5.5rem' },
          Card('Preview', [memo, h('div', { class: 'row end', style: 'margin-top:.8rem' }, submit), locked ? null : h('p', { class: 'muted small', style: 'margin:.6rem 0 0' }, `Your first submission is the one that scores (out of ${briefingMax()}).`)], { eyebrow: 'Live briefing note' }))));
    paintMemo();
    if (st.first) {
      const r = scoreBriefing({ claimId: st.first.claimId ?? '', strength: st.first.strength ?? -1, evidenceIds: st.first.evidence, limitationId: st.first.limitationId ?? '' });
      paintResult(practice ?? r, !!practice);
    }
  }
  render();
  return () => { alive = false; };
};
