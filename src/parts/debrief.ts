import { h, clear, announce } from '../ui/dom';
import { Badge, Button, Callout, Card, openModal } from '../ui/components';
import { loadMany } from '../data/load';
import { predictionHeld, surveyOutcome, reefList } from '../data/derive';
import { DRAFT_FN, DRAFT_NOTE, STRENGTHS, USES } from '../content';
import { claimById, evidenceById, limitationById, summarise, summaryText, totals } from '../scoring';
import type { Progress } from '../state';
import { PartHeader, pct, type PartMount } from './shared';

export function fillPrintSummary(el: HTMLElement, p: Progress): void {
  clear(el);
  const t = totals(p);
  const first = p.briefing.first;
  const claim = first ? claimById(first.claimId ?? '') : undefined;
  const lim = first ? limitationById(first.limitationId ?? '') : undefined;
  el.append(
    h('h1', null, 'Ground Truth: satellite evidence summary'),
    h('p', null, `Year 9 Science · NSW 4.3.4 · ${p.name.trim() ? p.name.trim() + ' · ' : ''}${new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}`),
    h('h2', null, `Evidence points: ${t.earned} / ${t.max}`),
    h('table', null,
      h('thead', null, h('tr', null, h('th', null, 'Part'), h('th', { class: 'n' }, 'Points'))),
      h('tbody', null, summarise(p).map((s) => h('tr', null, h('td', null, s.label), h('td', { class: 'n' }, `${s.earned} / ${s.max}`))))),
    h('h2', null, 'Minister briefing'),
    first && claim
      ? h('div', null,
          h('blockquote', null, claim.text),
          h('p', null, h('strong', null, 'Strength: '), `The satellite evidence ${['gives no evidence for', 'suggests', 'strongly supports', 'proves'][first.strength ?? 1]} this claim.`),
          h('p', null, h('strong', null, 'Evidence: '), first.evidence.map((id) => evidenceById(id)?.title ?? id).join('; ')),
          lim ? h('p', null, h('strong', null, 'Limitation: '), `${lim.title}. ${lim.text}`) : null,
          first.freeText.trim() ? h('p', null, h('strong', null, 'Note: '), first.freeText.trim()) : null)
      : h('p', null, 'The briefing was not completed.'),
    h('p', { style: 'font-size:9pt;margin-top:10pt' }, 'Points are for evidence work, not ranks. Predictions score for committing. Only first attempts count.'));
}

export const mountDebrief: PartMount = (root, ctx) => {
  const p = ctx.state;
  const showDraft = ctx.params.has('draft');
  const printEl = document.getElementById('print-summary');
  let alive = true;

  function copy() {
    const text = summaryText(p);
    const done = () => { announce('Summary copied'); copyBtn.textContent = 'Copied'; window.setTimeout(() => { copyBtn.textContent = 'Copy summary'; }, 2000); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
    function fallback() {
      const ta = h('textarea', { 'aria-label': 'Summary text', readonly: true, style: 'width:100%;min-height:9rem' });
      ta.value = text;
      openModal({ title: 'Copy your summary', body: [h('p', null, 'Select all and copy:'), ta] });
      ta.focus(); ta.select();
    }
  }
  const copyBtn = Button('Copy summary', { onClick: copy });

  function render() {
    if (!alive) return;
    clear(root);
    const parts = summarise(p);
    const t = totals(p);
    if (printEl) fillPrintSummary(printEl, p);
    const nameInput = h('input', { type: 'text', id: 'student-name', maxlength: '60', autocomplete: 'off', value: p.name });
    nameInput.addEventListener('input', () => { p.name = nameInput.value; ctx.save(); if (printEl) fillPrintSummary(printEl, p); });
    const uses = USES.filter((u) => !u.draftFN || showDraft);
    root.append(
      PartHeader('Part 8 · Debrief', 'What you found out', 'Points reward good evidence work. There are no ranks and no shop.'),
      h('div', { class: 'cols' },
        h('div', { class: 'stack' },
          Card('Evidence points', [
            h('div', { class: 'spread', style: 'margin-bottom:.6rem' }, h('div', null, h('p', { class: 'panel-title' }, 'Total'), h('div', { class: 'total-score' }, `${t.earned}`, h('span', { class: 'muted', style: 'font-size:1.2rem' }, ` / ${t.max}`)))),
            ...parts.map((s) => h('div', { class: 'score-row' },
              h('span', null, s.label),
              h('div', { class: 'point-bar', role: 'img', 'aria-label': `${s.label}: ${s.earned} of ${s.max}` }, h('i', { style: `width:${pct(s.earned, s.max)}%` })),
              h('span', { class: 'pts' }, `${s.earned} / ${s.max}`))),
            h('p', { class: 'muted small', style: 'margin:.8rem 0 0' }, 'Predictions earn points for committing, right or wrong. Only first attempts score, so a retry never changes your total.'),
          ], { eyebrow: 'Score summary' }),
          Card('Where your points came from', [
            ...parts.map((s) => h('details', { style: 'margin-bottom:.4rem' },
              h('summary', { style: 'cursor:pointer;font-weight:600' }, `${s.label}: ${s.earned} / ${s.max}`),
              h('ul', { class: 'muted small', style: 'margin:.4rem 0 .4rem 1.1rem;padding:0' }, s.items.map((i) => h('li', null, `${i.label}: ${i.earned === null ? 'not attempted' : i.earned} / ${i.max}`))))),
          ], { flat: true })),
        h('div', { class: 'stack' },
          Card('Your briefing', [
            p.briefing.first && claimById(p.briefing.first.claimId ?? '')
              ? h('div', { class: 'memo' },
                  h('p', { class: 'claim' }, claimById(p.briefing.first.claimId ?? '')!.text),
                  h('p', null, 'The satellite evidence ', h('span', { class: 'strength' }, STRENGTHS[p.briefing.first.strength ?? 1].label.toLowerCase()), ' this claim.'),
                  h('p', { class: 'muted small' }, `${p.briefing.first.points} / ${p.briefing.first.max} points on your first submission.`))
              : h('p', { class: 'muted' }, 'You have not submitted a briefing yet.'),
          ], { flat: true }),
          reflection(),
          Card('Export', [
            h('div', { class: 'field' }, h('label', { for: 'student-name' }, 'Your name (optional, stays on this device)'), nameInput),
            h('div', { class: 'row', style: 'margin-top:.8rem' },
              Button('Print one-page summary', { variant: 'primary', onClick: () => { if (printEl) fillPrintSummary(printEl, p); window.print(); } }),
              copyBtn),
            h('p', { class: 'muted small', style: 'margin:.6rem 0 0' }, 'Submit the copied text, or print to PDF, as your teacher asks.'),
          ], { flat: true }))),
      Card('Where this is used', [
        h('div', { class: 'cols even' }, uses.map((u) => h('div', { class: u.draftFN ? 'fn-draft stack-sm' : 'stack-sm' },
          u.draftFN && DRAFT_FN ? Badge('Draft', 'draft') : null,
          h('h4', { style: 'margin:0' }, u.title), h('p', { class: 'muted', style: 'margin:0' }, u.text)))),
        showDraft ? h('p', { class: 'small', style: 'margin:.8rem 0 0;color:var(--warn)' }, DRAFT_NOTE) : null,
      ], { eyebrow: 'End on use' }),
      h('div', { class: 'row end no-print', style: 'margin-top:1rem' },
        Button('Start again', { variant: 'ghost', onClick: () => ctx.restart() })));
  }

  function reflection() {
    const box = h('div');
    const pick = p.reef.predict?.choice;
    if (pick) {
      loadMany(['reef']).then((d) => {
        if (!alive || !d.reef) return;
        const reefs = reefList(d.reef);
        const out = surveyOutcome(reefs, '2024');
        const name = (id: string) => (id === 'same' ? 'about the same' : reefs.find((r) => r.id === id)?.name ?? id);
        if (out.top === null) return;
        const held = predictionHeld(out, pick);
        box.append(Callout(held ? 'Your reef prediction held up' : 'Your reef prediction was overturned', `You predicted ${name(pick)}. The aerial survey puts ${out.allSame ? 'every area level' : out.topIds.map(name).join(' and ')} at the top. Either way, you committed first, and that is what scores.`, held ? 'good' : 'warn'));
      });
    }
    return box;
  }

  render();
  return () => { alive = false; if (printEl) clear(printEl); };
};
