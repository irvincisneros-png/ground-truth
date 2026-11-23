import { h, nextId } from './dom';

export interface TableSpec {
  caption: string;
  columns: string[];
  rows: (string | number)[][];
}

/** "Show data table" toggle with an accessible, scrollable table. The table is built lazily on first open. */
export function DataTableToggle(getSpec: () => TableSpec): { el: HTMLElement; refresh(): void } {
  const id = nextId('dt');
  const wrap = h('div', { class: 'data-table-wrap', id, hidden: true, tabindex: '0', role: 'region', 'aria-label': 'Data table' });
  const btn = h('button', { type: 'button', class: 'btn ghost small', 'aria-expanded': 'false', 'aria-controls': id }, 'Show data table');
  let built = false;
  function build() {
    const spec = getSpec();
    wrap.textContent = '';
    wrap.setAttribute('aria-label', spec.caption);
    const table = h('table', null,
      h('caption', null, spec.caption),
      h('thead', null, h('tr', null, spec.columns.map((c) => h('th', { scope: 'col' }, c)))),
      h('tbody', null, spec.rows.map((r) => h('tr', null, r.map((cell, i) => (i === 0 ? h('th', { scope: 'row' }, String(cell)) : h('td', null, String(cell))))))));
    wrap.appendChild(table);
    built = true;
  }
  btn.addEventListener('click', () => {
    const open = btn.getAttribute('aria-expanded') === 'true';
    if (!open && !built) build();
    btn.setAttribute('aria-expanded', String(!open));
    btn.textContent = open ? 'Show data table' : 'Hide data table';
    wrap.hidden = open;
  });
  const el = h('div', null, btn, wrap);
  return { el, refresh: () => { if (built) build(); } };
}
