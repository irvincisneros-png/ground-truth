import { h } from '../ui/dom';
import { openModal } from '../ui/components';
import { GLOSSARY } from './missions';
import { icon, type IconName } from './icons';
import { loadImages } from './images';

export const GLOSSARY_ICON: Record<string, IconName> = {
  satellite: 'satellite', sensor: 'sensor', data: 'data', 'climate-change': 'climate', 'sea-ice': 'sea-ice', 'coral-bleaching': 'coral-bleaching',
};

/** The picture glossary: 6 words, each with an icon and one sentence. */
export function openGlossary(onClose?: () => void): void {
  openModal({
    title: 'Picture words',
    body: [h('ul', { class: 'sp-gloss' }, GLOSSARY.map((g) => h('li', null, icon(GLOSSARY_ICON[g.id], { size: 52 }), h('div', null, h('strong', null, g.word), h('span', null, g.text)))))],
    actions: [{ label: 'Close', variant: 'primary' }],
    onClose,
  });
}

export async function openCredits(): Promise<void> {
  const imgs = await loadImages();
  const rows = Object.values(imgs);
  openModal({
    title: 'Credits',
    body: [
      h('p', null, 'Real satellite pictures and data, made into a lesson. All icons and drawings were made for this lesson. No AI pictures.'),
      h('ul', { class: 'sp-credits' },
        rows.length
          ? rows.map((r) => h('li', null, h('strong', null, `${r.id}: `), [r.caption, r.credit, r.licence].filter(Boolean).join(' '), r.sourceUrl ? [' ', h('a', { href: r.sourceUrl, target: '_blank', rel: 'noopener' }, 'source')] : null))
          : h('li', null, 'Picture credits will show here once the satellite pictures are added.'),
        h('li', null, h('strong', null, 'Sea level: '), 'NOAA Laboratory for Satellite Altimetry. Altimetry data are provided by NOAA Laboratory for Satellite Altimetry.'),
        h('li', null, h('strong', null, 'Globe: '), 'Earth imagery from NASA Earth Observatory (public domain).')),
    ],
    actions: [{ label: 'Close', variant: 'primary' }],
  });
}
