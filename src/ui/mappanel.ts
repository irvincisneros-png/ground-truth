import { h, s, nextId } from './dom';
import { geometryToPath, haversineKm, makeProjection, ringsToPath, type BBox, type Projection } from './map-math';
import type { GeoCollection, GeoFeature, GeoGeometry } from '../data/types';

export interface MapMarker {
  id: string;
  lon: number;
  lat: number;
  label: string;
  color: string;
  ariaLabel?: string;
}
export interface MapPanelOpts {
  bbox: BBox;
  ariaLabel: string;
  /** Flat land rings ([lon,lat,...]) from public/data/geo/au-land.json. */
  land?: number[][];
  width?: number;
  graticuleStep?: number;
  markers?: MapMarker[];
  selectable?: boolean;
  onSelect?: (id: string) => void;
  legend?: { color: string; label: string }[];
  scaleKm?: number;
}
export interface MapPanel {
  el: HTMLElement;
  svg: SVGSVGElement;
  proj: Projection;
  select(id: string | null): void;
  setMarkers(m: MapMarker[]): void;
  addImage(href: string, bounds: BBox, opts?: { opacity?: number; label?: string }): SVGImageElement;
  addOverlay(geom: GeoGeometry | GeoFeature | GeoCollection, style: { stroke: string; fill?: string; label?: string }): SVGGElement;
  layer(name: 'data' | 'overlay'): SVGGElement;
}

const W = 800;

export function createMapPanel(o: MapPanelOpts): MapPanel {
  const proj = makeProjection(o.bbox, o.width ?? W);
  const gid = nextId('sea');
  const svg = s('svg', { viewBox: `0 0 ${proj.width} ${proj.height.toFixed(1)}`, role: 'group', 'aria-label': o.ariaLabel });
  svg.append(s('defs', null, s('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 }, s('stop', { offset: '0', 'stop-color': '#0a1a33' }), s('stop', { offset: '1', 'stop-color': '#08142a' }))));
  svg.append(s('rect', { width: proj.width, height: proj.height, fill: `url(#${gid})` }));

  // graticule
  const step = o.graticuleStep ?? ((o.bbox[2] - o.bbox[0]) > 25 ? 5 : (o.bbox[2] - o.bbox[0]) > 8 ? 2 : (o.bbox[2] - o.bbox[0]) > 2 ? 1 : 0.5);
  const grat = s('g', { class: 'graticule', 'aria-hidden': 'true' });
  for (let lon = Math.ceil(o.bbox[0] / step) * step; lon <= o.bbox[2]; lon += step) {
    const [x] = proj.project(lon, o.bbox[1]);
    grat.append(s('line', { x1: x, x2: x, y1: 0, y2: proj.height }));
    grat.append(s('text', { x: x + 3, y: proj.height - 5 }, `${Math.abs(Math.round(lon * 10) / 10)}°${lon >= 0 ? 'E' : 'W'}`));
  }
  for (let lat = Math.ceil(o.bbox[1] / step) * step; lat <= o.bbox[3]; lat += step) {
    const [, y] = proj.project(o.bbox[0], lat);
    grat.append(s('line', { x1: 0, x2: proj.width, y1: y, y2: y }));
    grat.append(s('text', { x: 4, y: y - 3 }, `${Math.abs(Math.round(lat * 10) / 10)}°${lat >= 0 ? 'N' : 'S'}`));
  }
  svg.append(grat);

  if (o.land) svg.append(s('path', { class: 'land', d: ringsToPath(o.land, proj), 'aria-hidden': 'true' }));

  const dataLayer = s('g', { class: 'data-layer' });
  const overlayLayer = s('g', { class: 'overlay-layer' });
  const markerLayer = s('g', { class: 'markers' });
  svg.append(dataLayer, overlayLayer, markerLayer);

  // scale bar
  if (o.scaleKm) {
    const midLat = (o.bbox[1] + o.bbox[3]) / 2;
    const kmPerDeg = haversineKm(0, midLat, 1, midLat);
    const [x0, y] = [proj.project(o.bbox[0], o.bbox[1])[0] + 14, proj.height - 24];
    const lenPx = (o.scaleKm / kmPerDeg) * (proj.width / (o.bbox[2] - o.bbox[0]));
    svg.append(s('g', { class: 'scale', 'aria-hidden': 'true' },
      s('line', { x1: x0, x2: x0 + lenPx, y1: y, y2: y, 'stroke-width': 2 }),
      s('line', { x1: x0, x2: x0, y1: y - 4, y2: y + 4 }), s('line', { x1: x0 + lenPx, x2: x0 + lenPx, y1: y - 4, y2: y + 4 }),
      s('text', { x: x0, y: y - 8 }, `${o.scaleKm} km`)));
  }

  let selected: string | null = null;
  const nodes = new Map<string, SVGGElement>();
  function setMarkers(ms: MapMarker[]) {
    markerLayer.textContent = '';
    nodes.clear();
    for (const m of ms) {
      const [x, y] = proj.project(m.lon, m.lat);
      const g = s('g', { class: 'marker', transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})`, tabindex: o.selectable ? '0' : undefined, role: o.selectable ? 'button' : 'img', 'aria-label': m.ariaLabel ?? m.label, 'aria-pressed': o.selectable ? 'false' : undefined },
        s('circle', { class: 'halo', r: 15 }),
        s('circle', { class: 'ring', r: 8, stroke: m.color }),
        s('circle', { r: 3, fill: m.color }),
        s('text', { class: 'lab', x: 14, y: 4 }, m.label));
      if (o.selectable) {
        const pick = () => { o.onSelect?.(m.id); };
        g.addEventListener('click', pick);
        g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
      }
      nodes.set(m.id, g);
      markerLayer.append(g);
    }
    select(selected);
  }
  function select(id: string | null) {
    selected = id;
    for (const [k, g] of nodes) {
      g.classList.toggle('selected', k === id);
      if (o.selectable) g.setAttribute('aria-pressed', String(k === id));
    }
  }
  setMarkers(o.markers ?? []);

  const el = h('div', null,
    h('div', { class: 'map' }, svg),
    o.legend ? h('div', { class: 'map-legend', role: 'list', 'aria-label': 'Map legend' }, o.legend.map((l) => h('span', { class: 'item', role: 'listitem' }, h('span', { class: 'sw', style: `background:${l.color}` }), l.label))) : null);

  return {
    el, svg, proj, select, setMarkers,
    layer: (n) => (n === 'data' ? dataLayer : overlayLayer),
    addImage(href, b, io = {}) {
      const [x0, y0] = proj.project(b[0], b[3]);
      const [x1, y1] = proj.project(b[2], b[1]);
      const img = s('image', { href, x: x0, y: y0, width: x1 - x0, height: y1 - y0, opacity: io.opacity ?? 1, preserveAspectRatio: 'none', role: 'img', 'aria-label': io.label ?? 'Map data layer' });
      dataLayer.append(img);
      return img;
    },
    addOverlay(geom, style) {
      const g = s('g', { class: 'footprint', role: 'img', 'aria-label': style.label ?? 'Overlay' });
      const geoms: GeoGeometry[] = [];
      const g0 = geom as any;
      if (g0.type === 'FeatureCollection') for (const f of g0.features as GeoFeature[]) geoms.push(f.geometry);
      else if (g0.type === 'Feature') geoms.push(g0.geometry);
      else geoms.push(g0 as GeoGeometry);
      for (const gg of geoms) g.append(s('path', { d: geometryToPath(gg, proj), fill: style.fill ?? 'none', stroke: style.stroke, 'stroke-width': 2.5, 'vector-effect': 'non-scaling-stroke', 'stroke-linejoin': 'round', 'fill-rule': 'evenodd' }));
      overlayLayer.append(g);
      return g;
    },
  };
}
