"""Build public/data/buoy.json: AIMS temperature loggers at Lady Musgrave Reef (Southern GBR) vs NOAA CRW CoralTemp 5 km SST at the same pixel.
Inputs: data-raw/aims-logger/filtered.csv (from fetch_aims_logger.py), data-raw/erddap/CRW_{SST,DHW}_ladymusgrave.csv
Run: python3 -I tools/data/build_buoy.py"""
import csv, json, os, datetime, collections
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
RAW = os.path.join(ROOT, 'data-raw'); OUT = os.path.join(ROOT, 'public', 'data')
T0, T1 = '2023-11-01', '2024-05-31'
MIN_FRAC = 0.7   # keep a day only if >= 70% of its expected readings are QC flag 1 (good)
def aest_date(ts):  # 'YYYY-MM-DD HH:MM:SS+00' UTC -> Queensland local date (UTC+10, no daylight saving)
    d = datetime.datetime.strptime(ts[:19], '%Y-%m-%d %H:%M:%S') + datetime.timedelta(hours=10)
    return d.strftime('%Y-%m-%d')
acc = collections.defaultdict(lambda: collections.defaultdict(list)); allcnt = collections.defaultdict(lambda: collections.Counter())
meta = {}
for r in csv.DictReader(open(os.path.join(RAW, 'aims-logger', 'filtered.csv'))):
    if r['site'] != 'Lady Musgrave': continue
    k = r['subsite']; d = aest_date(r['time'])
    if not (T0 <= d <= T1): continue
    meta[k] = dict(depth=float(r['depth']), lat=float(r['lat']), lon=float(r['lon']), instrument=r['instrument_type'], serial=r['serial_num'], metadata_uuid=r['metadata_uuid'], deployment_id=r['deployment_id'])
    allcnt[k][d] += 1
    if r['qc_flag'] == '1': acc[k][d].append(float(r['cal_val']))
def daily(k):
    out = {}
    for d, v in acc[k].items():
        if len(v) / allcnt[k][d] >= MIN_FRAC and len(v) >= 100: out[d] = sum(v) / len(v)
    return out
deep = daily('LADYSL1'); shallow = daily('LADYFL2')
def erd(f):
    return {r['time'][:10]: float(r[list(r.keys())[3]]) for r in csv.DictReader(open(os.path.join(RAW, 'erddap', f))) if r['time'][0].isdigit()}
sst = erd('CRW_SST_ladymusgrave.csv'); dhw = erd('CRW_DHW_ladymusgrave.csv')
dates = sorted(d for d in deep if d in sst and T0 <= d <= T1)
series = [dict(date=d, logger_c=round(deep[d], 2), satellite_c=round(sst[d], 2), logger_shallow_c=(round(shallow[d], 2) if d in shallow else None), satellite_dhw_cweeks=round(dhw[d], 2)) for d in dates]
diffs = [s['satellite_c'] - s['logger_c'] for s in series]
sd = [s['satellite_c'] - s['logger_shallow_c'] for s in series if s['logger_shallow_c'] is not None]
print('days', len(series), 'first', dates[0], 'last', dates[-1], 'mean sat-deep', round(sum(diffs) / len(diffs), 2), 'mean sat-shallow', round(sum(sd) / len(sd), 2), 'n shallow', len(sd))
pk = max(series, key=lambda s: s['satellite_c']); pl = max(series, key=lambda s: s['logger_c'])
print('peak sat', pk['date'], pk['satellite_c'], 'peak deep logger', pl['date'], pl['logger_c'], 'peak shallow', max(s['logger_shallow_c'] for s in series if s['logger_shallow_c'] is not None))
print('missing days (deep):', sorted(set(sst) - set(deep))[:20], len(set(sst) - set(deep)))
doc = dict(
 site='Lady Musgrave Reef (Capricorn-Bunker Group, Southern Great Barrier Reef)', lat=meta['LADYSL1']['lat'], lon=meta['LADYSL1']['lon'],
 depth_m=meta['LADYSL1']['depth'], depth_shallow_m=meta['LADYFL2']['depth'],
 period=dict(start=dates[0], end=dates[-1], note='Austral summer 2023-24; the Southern GBR reached its record-high heat stress in March 2024.'),
 series=series,
 columns=dict(logger_c='AIMS logger LADYSL1 (reef slope), water temperature at 9.9 m, daily mean of 5-minute readings, degC (QC flag 1 only)',
              logger_shallow_c="AIMS logger LADYFL2 (reef flat), water temperature at 0.3 m, daily mean, degC (QC flag 1 only); null where the day failed QC coverage",
              satellite_c='NOAA Coral Reef Watch CoralTemp v3.1 5 km daily sea surface temperature (night-time geo-polar blended analysis) for the pixel centred at 23.875S 152.425E that contains both loggers, degC',
              satellite_dhw_cweeks='NOAA CRW v3.1 5 km Degree Heating Week for the same pixel, degC-weeks'),
 loggerDetail={k: meta[k] for k in ('LADYSL1', 'LADYFL2')},
 method=f"Logger readings (about every 5 min, UTC) were converted to Queensland local dates (UTC+10) and averaged per day using only readings with AIMS QC flag 1; a day is kept only if at least {int(MIN_FRAC*100)}% of that day's readings are flag 1. Satellite values are the CRW product dated the same calendar day (CRW days are UTC-based, so up to a ten-hour offset). Only days with a valid deep-logger mean are listed.",
 sources=[
  dict(name='AIMS Sea Water Temperature Observing System (AIMS Temperature Logger Program), Lady Musgrave deployments LADYSL1 and LADYFL2 (2023-09-29 to 2024-11-06)',
       url='https://researchdata.edu.au/aims-sea-water-logger-program/677461',
       licence='Creative Commons Attribution 3.0 Australia (http://creativecommons.org/licenses/by/3.0/au/); AIMS use limitation: data provided "as is".',
       citation='Australian Institute of Marine Science (AIMS). (2026). AIMS Sea Water Temperature Observing System (AIMS Temperature Logger Program). doi:10.25845/5b4eb0f9bb848. Subset: Lady Musgrave Reef loggers LADYSL1 and LADYFL2 from temp-logger-data.zip (https://apps.aims.gov.au/data/temperature-loggers/temp-logger-data.zip).',
       retrieved='2026-11-24'),
  dict(name='NOAA Coral Reef Watch Version 3.1 daily global 5 km SST (CRW_SST) and DHW (CRW_DHW), point extract via ERDDAP (NOAA_DHW / PacIOOS dhw_5km)',
       url='https://coastwatch.pfeg.noaa.gov/erddap/griddap/NOAA_DHW.html',
       licence='NOAA CRW: available without restriction, credit NOAA Coral Reef Watch. 2002-onward SST under GHRSST free-and-open statement (the OSTIA academic-only statement applies to 1985-2002 only, outside this period).',
       citation='NOAA Coral Reef Watch. 2018, updated daily. NOAA Coral Reef Watch Version 3.1 Daily Global 5km Satellite Coral Bleaching Heat Stress Monitoring Product Suite (CoralTemp SST, DHW). College Park, Maryland, USA: NOAA Coral Reef Watch. Data set accessed 2026-11-24. De La Cour et al. 2020, doi:10.3390/rs12233856.',
       retrieved='2026-11-24')])
json.dump(doc, open(os.path.join(OUT, 'buoy.json'), 'w'), separators=(',', ':'))
print(os.path.getsize(os.path.join(OUT, 'buoy.json')))
# show extracted summary stats for docs
import statistics
print('deep logger max/min', max(s['logger_c'] for s in series), min(s['logger_c'] for s in series), 'sat max/min', max(s['satellite_c'] for s in series), min(s['satellite_c'] for s in series))
