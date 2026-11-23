"""Build public/data/seaice.json from NSIDC Sea Ice Index v4 (G02135) monthly extent CSVs (data-raw/nsidc).
Run: python3 -I tools/data/build_seaice.py"""
import csv, json, os
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
RAW = os.path.join(ROOT, 'data-raw', 'nsidc'); OUT = os.path.join(ROOT, 'public', 'data')
def load(f):
    return [(int(r[0]), float(r[4]), r[2].strip()) for r in csv.reader(open(os.path.join(RAW, f))) if r[0].strip() != 'year']
def ols(pts):
    n = len(pts); mt = sum(t for t, _ in pts) / n; mv = sum(v for _, v in pts) / n
    return sum((t - mt) * (v - mv) for t, v in pts) / sum((t - mt) ** 2 for t, _ in pts)
files = dict(feb='S_02_extent_v4.0.csv', sep='S_09_extent_v4.0.csv', nsep='N_09_extent_v4.0.csv')
d = {k: load(v) for k, v in files.items()}
def pts(rows): return [dict(year=y, extent_mkm2=e) for y, e, _ in rows]
def pct_per_decade(rows, end):
    base = [e for y, e, _ in rows if 1981 <= y <= 2010]; assert len(base) == 30
    mean = sum(base) / 30
    return round(ols([(y, e) for y, e, _ in rows if y <= end]) * 10 / mean * 100, 2), round(mean, 3)
a26, mean_n = pct_per_decade(d['nsep'], 2026); a24, _ = pct_per_decade(d['nsep'], 2024); a25, _ = pct_per_decade(d['nsep'], 2025)
def ext(rows, y): return [e for yy, e, _ in rows if yy == y][0]
prod = lambda rows: sorted({p for _, _, p in rows})
doc = dict(
 antarctic=dict(feb_min=pts(d['feb']), sep_max=pts(d['sep'])),
 arctic=dict(sep=pts(d['nsep'])),
 trendPctPerDecade=dict(arctic_sep=a26),
 trendDetail=dict(
   method="Least-squares straight-line slope of September Arctic ice extent (million km2) vs year, multiplied by 10 and divided by the 1981-2010 mean September extent (%.3f million km2), as NSIDC does for its percent-per-decade figures." % mean_n,
   period='1979-2026', arctic_sep_pct_per_decade_1979_2024=a24, arctic_sep_pct_per_decade_1979_2025=a25, arctic_sep_pct_per_decade_1979_2026=a26,
   mean_1981_2010_mkm2=mean_n,
   arctic_sep_slope_mkm2_per_decade_1979_2026=round(ols([(y, e) for y, e, _ in d['nsep']]) * 10, 3),
   antarctic_feb_pct_per_decade_1979_2026=pct_per_decade(d['feb'], 2026)[0], antarctic_sep_pct_per_decade_1979_2026=pct_per_decade(d['sep'], 2026)[0]),
 keyValues=dict(
   antarctic_feb_2023_mkm2=ext(d['feb'], 2023), antarctic_feb_record_low=dict(zip(('year', 'extent_mkm2'), min(((y, e) for y, e, _ in d['feb']), key=lambda x: x[1]))),
   antarctic_sep_2014_mkm2=ext(d['sep'], 2014), antarctic_sep_2023_mkm2=ext(d['sep'], 2023),
   antarctic_sep_record_high=dict(zip(('year', 'extent_mkm2'), max(((y, e) for y, e, _ in d['sep']), key=lambda x: x[1]))),
   antarctic_sep_record_low=dict(zip(('year', 'extent_mkm2'), min(((y, e) for y, e, _ in d['sep']), key=lambda x: x[1]))),
   arctic_sep_record_low=dict(zip(('year', 'extent_mkm2'), min(((y, e) for y, e, _ in d['nsep']), key=lambda x: x[1])))),
 note="Monthly mean extent, million km2, NSIDC Sea Ice Index v4 (pixels with at least 15% ice concentration). Pre-2025 values come from SSMIS (NSIDC-0051); from January 2025 NSIDC computes the Index from AMSR2 (NSIDC-0803) because SSMIS data are no longer available, with a preliminary intercalibration, so the 2025 and 2026 points are from a different sensor (NSIDC says this makes the trend slightly more negative).",
 inputProductByYear=dict(SSMIS_NSIDC_0051=[min(y for y, _, p in d['sep'] if p == 'NSIDC-0051'), max(y for y, _, p in d['sep'] if p == 'NSIDC-0051')],
                         AMSR2_NSIDC_0803=[min(y for y, _, p in d['sep'] if p == 'NSIDC-0803'), max(y for y, _, p in d['sep'] if p == 'NSIDC-0803')]),
 sources=[dict(name='Sea Ice Index, Version 4 (G02135): monthly extent, Arctic September (N_09), Antarctic February (S_02) and September (S_09)',
   url='https://nsidc.org/data/g02135/versions/4',
   licence="No separate licence is stated on the product page. NSIDC data policy: 'Most of the data held by NSIDC are government-funded and in the public domain'; copyright restrictions are 'clearly known to potential users in the data set documentation' (none stated for G02135). Citation is required: 'As a condition of using these data, you must cite the use of this data set.' (https://nsidc.org/about/data-policies). Treated as free to redistribute with citation; confirm with nsidc@nsidc.org if publishing widely.",
   citation='Fetterer, F., Knowles, K., Meier, W. N., Savoie, M., Windnagel, A. K. & Stafford, T. (2025). Sea Ice Index (G02135, Version 4) [Data Set]. Boulder, Colorado USA. National Snow and Ice Data Center. https://doi.org/10.7265/a98x-0f50. Subset: monthly extent files N_09_extent_v4.0.csv, S_02_extent_v4.0.csv, S_09_extent_v4.0.csv. Date Accessed 11-23-2026.',
   retrieved='2026-11-24')])
json.dump(doc, open(os.path.join(OUT, 'seaice.json'), 'w'), separators=(',', ':'))
print(json.dumps(doc['trendDetail'], indent=1)); print(doc['keyValues']); print(doc['inputProductByYear'], os.path.getsize(os.path.join(OUT, 'seaice.json')))
