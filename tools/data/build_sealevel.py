"""Build public/data/sealevel.json.
Satellite GMSL: NOAA Laboratory for Satellite Altimetry multi-mission series (data-raw/star/slr_all66.csv),
  because NASA's PO.DAAC/Earthdata GMSL indicator needs a login (see docs/DATA-SOURCES.md).
Tide gauge: PSMSL RLR annual, Sydney Fort Denison 2 (station 196) (data-raw/psmsl/rlr_annual/data/196.rlrdata).
Cross-check: CU Sea Level Research Group GMSL (data-raw/cu) - used only to compute comparison rates, not bundled.
Run: python3 -I tools/data/build_sealevel.py"""
import json, os, csv
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
RAW = os.path.join(ROOT, 'data-raw'); OUT = os.path.join(ROOT, 'public', 'data')
RETRIEVED = '2026-11-24'

def ols(pts):
    n = len(pts); mt = sum(t for t, _ in pts) / n; mv = sum(v for _, v in pts) / n
    sxx = sum((t - mt) ** 2 for t, _ in pts); sxy = sum((t - mt) * (v - mv) for t, v in pts)
    b = sxy / sxx
    res = [v - (mv + b * (t - mt)) for t, v in pts]
    se = (sum(r * r for r in res) / (n - 2) / sxx) ** 0.5
    return b, se, n

# --- satellite series (average the missions where two overlap)
star = []
for l in open(os.path.join(RAW, 'star', 'slr_all66.csv')):
    if l.startswith('#') or l.startswith('year'): continue
    p = l.strip().split(',')
    v = [float(x) for x in p[1:] if x != '']
    star.append((float(p[0]), sum(v) / len(v)))
base = [v for t, v in star if 1993 <= t < 1994]
off = sum(base) / len(base)       # re-zero so the 1993 mean = 0
gm = [(t, v - off) for t, v in star]
rates = {}
for k, (a, b) in {'1993-2002': (1993, 2003), '2015-2024': (2015, 2025)}.items():
    r, se, n = ols([(t, v) for t, v in gm if a <= t < b])
    rates[k] = round(r, 2); rates[k + '_ols_se'] = round(se, 2); rates[k + '_n'] = n
rate_all, se_all, n_all = ols([(t, v) for t, v in gm if 1993 <= t < 2025])
# annual means (complete calendar years 1993-2024)
ann = {}
for t, v in gm:
    y = int(t)
    if 1993 <= y <= 2024: ann.setdefault(y, []).append(v)
annual = [dict(year=y, gmsl_mm=round(sum(v) / len(v), 1), n=len(v)) for y, v in sorted(ann.items())]
falls = [(annual[i]['year'], annual[i + 1]['year'], round(annual[i + 1]['gmsl_mm'] - annual[i]['gmsl_mm'], 1)) for i in range(len(annual) - 1) if annual[i + 1]['gmsl_mm'] < annual[i]['gmsl_mm']]

# --- CU cross-check
cu = []
for l in open(os.path.join(RAW, 'cu', 'gmsl_2026rel1_seasons_retained.txt')):
    if l.startswith('#'): continue
    t, v = l.split(); cu.append((float(t), float(v)))
cu_rates = {k: round(ols([(t, v) for t, v in cu if a <= t < b])[0], 2) for k, (a, b) in {'1993-2002': (1993, 2003), '2015-2024': (2015, 2025)}.items()}

# --- tide gauge
def psmsl(id_):
    out = []
    for l in open(os.path.join(RAW, 'psmsl', 'rlr_annual', 'data', f'{id_}.rlrdata')):
        y, v, f1, f2 = [x.strip() for x in l.split(';')]
        if int(v) > -90000: out.append((int(y), int(v), f1 == 'Y'))
    return out
tg = psmsl(196)
tgb = [v for y, v, _ in tg if 1993 <= y <= 2012]
tg_off = sum(tgb) / len(tgb)
tg_rate_all = ols([(y, v) for y, v, _ in tg])[0]
tg_rate_9324 = ols([(y, v) for y, v, _ in tg if 1993 <= y <= 2024])[0]
tg_rate_1993_2002 = ols([(y, v) for y, v, _ in tg if 1993 <= y <= 2002])[0]
tg_rate_2015_2024 = ols([(y, v) for y, v, _ in tg if 2015 <= y <= 2024])[0]
booby = psmsl(1268)

doc = dict(
 gmsl=[dict(t_year=round(t, 4), gmsl_mm=round(v, 1)) for t, v in gm],
 gmslNote="Global mean sea level from satellite radar altimetry (TOPEX/Poseidon, Jason-1/2/3, Sentinel-6 Michael Freilich; 66S-66N; annual and semi-annual cycles removed; no glacial-isostatic-adjustment correction). Re-zeroed so the 1993 average is 0 mm. About 10-day sampling. Where two satellites overlapped the values were averaged.",
 annual=annual,
 annualFallsNote="Years where the annual-mean GMSL fell compared with the year before (from_year, to_year, change_mm): " + json.dumps(falls),
 tideGauge=dict(station='Sydney, Fort Denison 2 (PSMSL station 196)', lat=-33.854667, lon=151.225778,
   series=[dict(year=y, msl_mm=v - round(tg_off)) for y, v, _ in tg],
   referenceNote=f"msl_mm = PSMSL RLR annual mean sea level relative to the station's own 1993-2012 mean ({tg_off:.1f} mm on the RLR scale). This measures sea level relative to the land the gauge sits on. Years with no data (1930, 1941, 2000) are omitted.",
   flaggedYears=[y for y, _, f in tg if f]),
 rates={'1993-2002': rates['1993-2002'], '2015-2024': rates['2015-2024']},
 ratesDetail=dict(
   method="Ordinary least-squares straight-line fit of GMSL (mm) against time (years) to all ~10-day values with 1993-01-01 <= t < 2003-01-01 and 2015-01-01 <= t < 2025-01-01. The ols_se values are the naive regression standard errors and ignore autocorrelation, so the true uncertainty is larger.",
   units='mm per year', thisDataset=rates, whole_1993_2024_mm_per_yr=round(rate_all, 2),
   crossCheck_CU_SeaLevelResearchGroup_2026rel1_mm_per_yr=cu_rates,
   wmo_state_of_global_climate_2024=dict(**{'1993-2002': 2.1, '2015-2024': 4.7}, source='WMO-No. 1368 State of the Global Climate 2024, https://wmo.int/sites/default/files/2025-03/WMO-1368-2024_en.pdf', note='Quoted for comparison, not computed here. The NOAA series used in this file gives a smaller increase (about 2.7 to 3.7 mm/yr, up roughly 38%) than the WMO figures (more than doubled). Short-window rates depend on the altimetry processing (for example drift corrections to the early TOPEX/Poseidon data) and on El Nino / La Nina years, so do not mix the two sets of numbers.'),
   tideGauge_SydneyFortDenison2_mm_per_yr={'1915-2024': round(tg_rate_all, 2), '1993-2024': round(tg_rate_9324, 2), '1993-2002': round(tg_rate_1993_2002, 2), '2015-2024': round(tg_rate_2015_2024, 2)}),
 sources=[
  dict(name='NOAA Laboratory for Satellite Altimetry - Sea Level Rise: global mean sea level anomaly (66S-66N), multi-mission',
       url='https://www.star.nesdis.noaa.gov/socd/lsa/SeaLevelRise/slr/slr_sla_gbl_free_all_66.csv',
       licence="US Government (NOAA) data, no copyright restriction; NOAA requests the acknowledgment: 'Altimetry data are provided by NOAA Laboratory for Satellite Altimetry.'",
       citation='NOAA Laboratory for Satellite Altimetry. Sea Level Rise. https://www.star.nesdis.noaa.gov/socd/lsa/SeaLevelRise/ ; Radar Altimeter Database System (RADS). Altimetry data are provided by NOAA Laboratory for Satellite Altimetry.',
       retrieved=RETRIEVED),
  dict(name='PSMSL Revised Local Reference annual mean sea level, Sydney Fort Denison 2 (station 196)',
       url='https://psmsl.org/data/obtaining/stations/196.php',
       licence='PSMSL: freely available for use; no formal licence text found; PSMSL asks users to cite Holgate et al. (2013) and PSMSL (2018). Original data: Australian National Tide Centre (Bureau of Meteorology).',
       citation='Holgate, S.J. et al. (2013) New data systems and products at the Permanent Service for Mean Sea Level. Journal of Coastal Research 29(3), 493-504, doi:10.2112/JCOASTRES-D-12-00175.1. PSMSL (2018) Permanent Service for Mean Sea Level, Tide Gauge Data, retrieved 24 Nov 2026 from https://psmsl.org/data/obtaining/.',
       retrieved=RETRIEVED),
  dict(name='CU Sea Level Research Group GMSL release 2026_rel1 (cross-check of rates only; series not bundled)',
       url='https://sealevel.colorado.edu/files/2026_rel1/gmsl_2026rel1_seasons_retained.txt',
       licence='No licence statement found on the CU site; not redistributed here, only rates computed from it are quoted.',
       citation='Nerem, R.S., et al. CU Sea Level Research Group, University of Colorado (2026 release 1). GMSL, seasonal signals retained, GIA removed.',
       retrieved=RETRIEVED),
  dict(name='WMO State of the Global Climate 2024 (for the 2.1 and 4.7 mm/yr comparison figures)',
       url='https://wmo.int/sites/default/files/2025-03/WMO-1368-2024_en.pdf',
       licence='WMO publication (cited, not redistributed)', citation='WMO (2025). State of the Global Climate 2024. WMO-No. 1368, Geneva.',
       retrieved=RETRIEVED)])
json.dump(doc, open(os.path.join(OUT, 'sealevel.json'), 'w'), separators=(',', ':'))
print(json.dumps(doc['ratesDetail'], indent=1)); print('falls', falls); print('tg', tg[0], tg[-1], len(tg), 'tg_off', tg_off, 'booby', booby[0], booby[-1], len(booby))
print(os.path.getsize(os.path.join(OUT, 'sealevel.json')))
print(annual[:3], annual[-3:])
