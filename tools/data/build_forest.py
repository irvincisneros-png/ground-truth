"""Build public/data/forest.json + public/data/forest/*.png from:
   - Hansen GFC-2025-v1.13 lossyear tiles (data-raw/hansen)
   - NSW NPWS Fire History GeoJSON (data-raw/npws/fire.geojson)
   - QLD SLATS clearing GeoJSON, one file per period (data-raw/slats/l<layer>.geojson)
Run with data-raw/venv/bin/python (needs tifffile, imagecodecs, numpy, pillow)."""
import json, os, sys, datetime
import numpy as np
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(__file__))
from hansen_read import read_window, RES

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
RAW = os.path.join(ROOT, 'data-raw')
OUT = os.path.join(ROOT, 'public', 'data')
os.makedirs(os.path.join(OUT, 'forest'), exist_ok=True)

def cividis_like(f):
    """Piecewise-linear through the endpoints/midpoint of matplotlib's cividis (#00204d, #7c7b78, #fee838)."""
    a = [(0, 32, 77), (124, 123, 120), (254, 232, 56)]
    f = min(max(f, 0), 1) * 2
    i = min(int(f), 1); t = f - i
    return tuple(int(round(a[i][k] + (a[i + 1][k] - a[i][k]) * t)) for k in range(3))

def clip_ring(ring, bb):
    w, s, e, n = bb
    def clip(poly, inside, inter):
        out = []
        for i in range(len(poly)):
            p, q = poly[i - 1], poly[i]
            if inside(q):
                if not inside(p): out.append(inter(p, q))
                out.append(q)
            elif inside(p):
                out.append(inter(p, q))
        return out
    def ix(x):
        return lambda p, q: (x, p[1] + (q[1] - p[1]) * (x - p[0]) / (q[0] - p[0]))
    def iy(y):
        return lambda p, q: (p[0] + (q[0] - p[0]) * (y - p[1]) / (q[1] - p[1]), y)
    poly = [tuple(c[:2]) for c in ring]
    for ins, it in ((lambda p: p[0] >= w, ix(w)), (lambda p: p[0] <= e, ix(e)),
                    (lambda p: p[1] >= s, iy(s)), (lambda p: p[1] <= n, iy(n))):
        if not poly: return []
        poly = clip(poly, ins, it)
    return poly

def ring_area(r):
    return abs(sum(r[i-1][0]*r[i][1]-r[i][0]*r[i-1][1] for i in range(len(r))))/2

def clip_geom(geom, bb):
    polys = geom['coordinates'] if geom['type'] == 'MultiPolygon' else [geom['coordinates']]
    res = []
    for rings in polys:
        outer = clip_ring(rings[0], bb)
        if len(outer) < 3: continue
        new = [outer] + [r for r in (clip_ring(h, bb) for h in rings[1:]) if len(r) >= 3 and ring_area(r) > 4e-8]
        res.append(new)
    return res

def rnd(poly):
    out = []
    for ring in poly:
        r = [[round(x, 5), round(y, 5)] for x, y in ring]
        # drop consecutive duplicates
        d = [r[0]]
        for p in r[1:]:
            if p != d[-1]: d.append(p)
        if d[0] != d[-1]: d.append(d[0])
        if len(d) >= 4: out.append(d)
    return out

def raster(polys, bb, shape):
    h, w = shape
    img = Image.new('L', (w, h), 0); dr = ImageDraw.Draw(img)
    W, S, E, N = bb
    f = lambda x, y: ((x - W) / (E - W) * w, (N - y) / (N - S) * h)
    for rings in polys:
        dr.polygon([f(*p) for p in rings[0]], fill=1)
        for hole in rings[1:]: dr.polygon([f(*p) for p in hole], fill=0)
    return np.array(img, dtype=bool)

CASES = [
 dict(id='nsw-gospers', tile='30S_150E', bounds=(150.0, -33.439, 150.16, -33.304), focus=(2019, 2020),
      overlayKind='fire', answer='climate-linked', label='Western Wollemi / Gospers Mountain fire edge, NSW (Black Summer 2019-20)',
      overlay=os.path.join(RAW, 'npws', 'region_201920.geojson')),
 dict(id='qld-clearing', tile='20S_140E', bounds=(145.35, -25.89, 145.51, -25.755), focus=(2004, 2008),
      overlayKind='clearing', answer='land-use', label='South-west Queensland (Mitchell grass / mulga country) land clearing',
      overlay=None),
]
SLATS_LAYERS = {216: '2003-04', 218: '2004-05', 220: '2005-06', 222: '2006-07', 224: '2007-08'}

result = {'cases': []}
stats = {}
for c in CASES:
    arr, bb = read_window(os.path.join(RAW, 'hansen', f"lossyear_{c['tile']}.tif"), *c['bounds'])
    years_present = sorted({int(v) + 2000 for v in np.unique(arr) if v > 0})
    f0, f1 = c['focus']
    # palette: index = year-2000 (1..25); 0 = no loss (transparent)
    pal = [0, 0, 0] * 256; alpha = [0] * 256
    legend = []
    for y in range(2001, 2026):
        i = y - 2000
        if f0 <= y <= f1:
            col = cividis_like(0.6 + 0.4 * (y - f0) / max(1, f1 - f0)); a = 255
        else:
            col = (95, 120, 190); a = 140
        pal[i * 3:i * 3 + 3] = col; alpha[i] = a
        if y in years_present:
            legend.append({'year': y, 'hex': '#%02x%02x%02x' % col, 'focus': f0 <= y <= f1})
    im = Image.fromarray(arr.astype(np.uint8), mode='P')
    im.putpalette(pal)
    png = os.path.join(OUT, 'forest', f"{c['id']}-loss.png")
    im.save(png, optimize=True, transparency=bytes(alpha))
    # overlay
    if c['overlayKind'] == 'fire':
        gj = json.load(open(c['overlay']))
        feats = []
        polys_all = []
        for ft in gj['features']:
            cl = clip_geom(ft['geometry'], bb)
            cl = [p for p in (rnd(p) for p in cl) if p]
            if not cl: continue
            p = ft['properties']
            if 'Wildfire' not in (p['Label'] or ''): continue
            ms = lambda v: datetime.datetime.fromtimestamp(v / 1000, datetime.timezone.utc).strftime('%Y-%m-%d') if v else None
            feats.append({'type': 'Feature', 'properties': {'name': p['FireName'], 'fireNo': p['FireNo'], 'season': p['Label'],
                          'start_utc': ms(p['StartDate']), 'end_utc': ms(p['EndDate']), 'wholeFire_ha': round(p['AreaHa'])},
                          'geometry': {'type': 'MultiPolygon', 'coordinates': cl}})
            polys_all += cl
    else:
        feats = []; polys_all = []
        for lid, per in SLATS_LAYERS.items():
            gj = json.load(open(os.path.join(RAW, 'slats', f'l{lid}.geojson')))
            for ft in gj['features']:
                cl = [p for p in (rnd(p) for p in clip_geom(ft['geometry'], bb)) if p]
                if not cl: continue
                pr = ft['properties']
                cls = pr.get('descr') or pr.get('description') or pr.get('class_desc')
                feats.append({'type': 'Feature', 'properties': {'period': per, 'class': cls},
                              'geometry': {'type': 'MultiPolygon', 'coordinates': cl}})
                polys_all += cl
    mask = raster(polys_all, bb, arr.shape)
    focus_loss = (arr >= f0 - 2000) & (arr <= f1 - 2000)
    s = dict(window_px=list(arr.shape[::-1]), pixel_m_approx=round(RES * 111320 * np.cos(np.radians((bb[1] + bb[3]) / 2)), 1),
             loss_all_pct=round(100 * (arr > 0).mean(), 1), focus_loss_pct=round(100 * focus_loss.mean(), 1),
             focus_loss_inside_overlay_pct=round(100 * (focus_loss & mask).sum() / max(1, focus_loss.sum()), 1),
             overlay_area_pct=round(100 * mask.mean(), 1),
             loss_by_year_pct_of_window={y: round(100 * (arr == y - 2000).mean(), 2) for y in years_present})
    stats[c['id']] = s
    result['cases'].append({'id': c['id'], 'label': c['label'], 'bounds': [round(b, 5) for b in bb],
        'lossPng': f"forest/{c['id']}-loss.png", 'lossPngSize': list(arr.shape[::-1]),
        'lossPngEncoding': 'palette PNG; pixel palette index = loss year minus 2000; index 0 (no loss) is transparent; north-up, EPSG:4326, bounds map to the full image edges',
        'lossYears': list(c['focus']), 'lossLegend': legend,
        'overlay': {'type': 'FeatureCollection', 'features': feats}, 'overlayKind': c['overlayKind'],
        'answer': c['answer'], 'stats': s})
json.dump(stats, open(os.path.join(RAW, 'forest_stats.json'), 'w'), indent=1)
# ---- notes (every number below comes from `stats`, the overlay properties or a cited source)
import collections
nsw, qld = result['cases']
fire = [f['properties'] for f in nsw['overlay']['features'] if f['properties']['name'] == 'Gospers Mountain'][0]
sn, sq = stats['nsw-gospers'], stats['qld-clearing']
cls = collections.Counter(f['properties']['class'] for f in qld['overlay']['features'])
nsw['note'] = (f"Hansen/UMD tree-cover loss {nsw['lossYears'][0]}-{nsw['lossYears'][1]} inside the NSW NPWS fire perimeters for the 2019-20 season (mainly the Gospers Mountain fire, with NPWS record dates {fire['start_utc']} to {fire['end_utc']} (UTC) and {fire['wholeFire_ha']:,} ha in total). "
  f"In this {sn['window_px'][0]}x{sn['window_px'][1]}-pixel window (about 15 km square), {sn['focus_loss_pct']}% of the area shows 2019-2020 loss and {sn['focus_loss_inside_overlay_pct']}% of those loss pixels fall inside the mapped fire perimeters (which cover {sn['overlay_area_pct']}% of the window): the loss follows the fire edge, as a wide, irregular patchwork across forested ridges and gullies. "
  "Black Summer attribution: the research does not say climate change caused each fire. van Oldenborgh et al. (2021, NHESS 21, 941-960) found fire-weather conditions had become more likely (a significant increase of at least 30% in climate models, and a large trend in the ERA5 reanalysis, driven mainly by hotter extremes), so the risk of such a fire season rose. Burnt eucalypt forest often resprouts, so fire loss can be temporary (general ecology, not measured here). Hansen loss is canopy loss and cannot say what caused it: the fire perimeter is what shows the cause.")
qld['note'] = (f"Hansen/UMD tree-cover loss {qld['lossYears'][0]}-{qld['lossYears'][1]} with Queensland SLATS woody-vegetation clearing polygons for the periods 2003-04 to 2007-08 (SLATS replacement-land-cover class: {', '.join(f'{k} {v} polygons' for k, v in cls.most_common())}). "
  f"In this {sq['window_px'][0]}x{sq['window_px'][1]}-pixel window (about 15 km square) {sq['focus_loss_pct']}% of the area has 2004-2008 loss (2006 alone: {sq['loss_by_year_pct_of_window'][2006]}%), and {sq['focus_loss_inside_overlay_pct']}% of it falls inside SLATS clearing polygons. The loss comes as large rectangular blocks with straight edges, not a fire-shaped patchwork. "
  "SLATS records the replacement land cover as pasture, so this is land-use change by clearing, decided by people; it is not a climate effect. (Hansen years and SLATS reporting periods, which run roughly mid-year to mid-year, line up only approximately.)")
for c in result['cases']:
    c['lossLegendNote'] = 'Colour: focus years (lossYears) use a cividis-like ramp; other years are shown in a dim blue. The legend lists only years present in the window.'
    c.pop('stats', None)
    c['stats'] = stats[c['id']]
result['sources'] = [
 dict(name='Hansen/UMD/Google/USGS/NASA Global Forest Change, GFC-2025-v1.13, lossyear layer (tiles 30S_150E and 20S_140E)',
      url='https://storage.googleapis.com/earthenginepartners-hansen/GFC-2025-v1.13/download.html',
      licence='Creative Commons Attribution 4.0 International (https://creativecommons.org/licenses/by/4.0/). CHANGES MADE: cropped to two ~15 km windows; loss pixels re-coloured by year and saved as small palette PNGs with transparent background; original 30 m values kept (nominal 0.00025 degree pixels). Not endorsed by the authors.',
      citation='Hansen, M. C., P. V. Potapov, R. Moore, M. Hancher, S. A. Turubanova, A. Tyukavina, D. Thau, S. V. Stehman, S. J. Goetz, T. R. Loveland, A. Kommareddy, A. Egorov, L. Chini, C. O. Justice, and J. R. G. Townshend. 2013. "High-Resolution Global Maps of 21st-Century Forest Cover Change." Science 342 (15 November): 850-53. Data available on-line from: https://glad.earthengine.app/view/global-forest-change.',
      retrieved='2026-11-24'),
 dict(name='NSW NPWS Fire History - Wildfires and Prescribed Burns (2019-20 wildfire polygons), NSW Department of Climate Change, Energy, the Environment and Water',
      url='https://datasets.seed.nsw.gov.au/dataset/fire-history-wildfires-and-prescribed-burns-1e8b6',
      licence='Creative Commons Attribution 4.0 (as listed on NSW SEED). CHANGES MADE: clipped to the window, geometry simplified (about 55 m tolerance), tiny holes dropped, coordinates rounded to 5 decimals.',
      citation='NSW National Parks and Wildlife Service (NPWS), NSW Department of Climate Change, Energy, the Environment and Water. NPWS Fire History - Wildfires and Prescribed Burns. NSW SEED. Service: https://mapprod3.environment.nsw.gov.au/arcgis/rest/services/Fire/NPWS_Fire_History/MapServer/0',
      retrieved='2026-11-24'),
 dict(name='Queensland SLATS (Statewide Landcover and Trees Study) woody vegetation clearing polygons, periods 2003-04 to 2007-08, Queensland Department of the Environment, Tourism, Science and Innovation',
      url='https://www.data.qld.gov.au/dataset/slats-2018-baseline',
      licence='Creative Commons Attribution 4.0 (Queensland Government open data; the 2018 SLATS datasets are CC BY 4.0 on data.qld.gov.au, and the map service carries the same State of Queensland copyright; the licence line for these specific historical layers was not separately verified). CHANGES MADE: clipped to the window, simplified (about 65 m tolerance), tiny holes dropped, five periods merged.',
      citation='State of Queensland (Department of Natural Resources and Mines, Manufacturing and Regional and Rural Development) 2026. Statewide Landcover and Trees Study (SLATS): woody vegetation clearing. Service: https://spatial-gis.information.qld.gov.au/arcgis/rest/services/Environment/SLATS/MapServer (layers 216, 218, 220, 222, 224)',
      retrieved='2026-11-24'),
 dict(name='van Oldenborgh et al. (2021) Attribution of the Australian bushfire risk to anthropogenic climate change (cited, not redistributed)',
      url='https://nhess.copernicus.org/articles/21/941/2021/', licence='Open access (Copernicus, CC BY 4.0)',
      citation='van Oldenborgh, G. J., Krikken, F., Lewis, S., Leach, N. J., Lehner, F., Saunders, K. R., van Weele, M., Haustein, K., Li, S., Wallom, D., Sparrow, S., Arrighi, J., et al. (2021). Attribution of the Australian bushfire risk to anthropogenic climate change. Natural Hazards and Earth System Sciences, 21, 941-960. doi:10.5194/nhess-21-941-2021',
      retrieved='2026-11-24')]
json.dump(result, open(os.path.join(OUT, 'forest.json'), 'w'), separators=(',', ':'))
print(os.path.getsize(os.path.join(OUT, 'forest.json')))
print(nsw['note']); print(qld['note'])
