"""Build public/data/reef.json from NOAA CRW 5 km Regional Virtual Station text files (data-raw/crw-vs)
and published AIMS/GBRMPA 2024 aerial-survey results (transcribed from the AIMS report; see docs/DATA-SOURCES.md).
Run: python3 -I tools/data/build_reef.py"""
import json, os, datetime
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
RAW = os.path.join(ROOT, 'data-raw', 'crw-vs'); OUT = os.path.join(ROOT, 'public', 'data')
RETRIEVED = '2026-11-24'
SERIES_SUMMERS = [2016, 2017, 2020, 2022, 2024, 2025]
PEAK_SUMMERS = list(range(2016, 2027))

def load(name):
    hdr = {}; rows = []; lines = open(os.path.join(RAW, name + '.txt')).read().splitlines()
    hdr['name'] = lines[1].strip(); hdr['lon'] = float(lines[4]); hdr['lat'] = float(lines[7]); hdr['mmm'] = float(lines[10])
    for l in lines:
        p = l.split()
        if len(p) == 10 and len(p[0]) == 4 and p[0].isdigit() and p[1].isdigit():
            rows.append(dict(date=f'{p[0]}-{p[1]}-{p[2]}', y=int(p[0]), m=int(p[1]), sst_90th_hs=float(p[5]), dhw=float(p[8])))
    return hdr, rows

def season(r):  # austral summer label = calendar year in which it ends; Nov..Jun window
    if r['m'] >= 11: return r['y'] + 1
    if r['m'] <= 6: return r['y']
    return None

# Published 2024 aerial survey results (AIMS & GBRMPA, Cantin/James/Stella, 15 Apr 2024), transcribed.
TS_COUNTS = [112, 63, 8, 2, 1, 0]     # Table 1, Torres Strait column, categories 0..5 (186 reefs scored)
TS_TOTAL = sum(TS_COUNTS)
assert TS_TOTAL == 186
REEFS = [
 dict(id='southern-gbr', file='gbr_southern', name='Southern GBR',
      survey2024=dict(category=3, categoryIsMinimum=True, label='High to extreme bleaching (more than 30% of coral cover bleached)',
        distribution=[dict(group='0', pct=3, text='No bleaching'), dict(group='1-2', pct=16, text='Low or medium'), dict(group='3-5', pct=80, text='High to extreme')],
        basis='region-level: share of surveyed reefs in each group, as published (rounded; sums to 99)',
        note='Southern region reefs south of the Whitsundays. 80% of surveyed reefs showed high (31-60%) to extreme (>90%) bleaching; only 3% had none. AIMS reef-level heat stress at surveyed reefs: 6.22-15.55 DHW (highest on the NOAA satellite record 1985-2024).'),
      aimsReefDhwRange2024=[6.22, 15.55]),
 dict(id='central-gbr', file='gbr_central', name='Central GBR',
      survey2024=dict(category=3, categoryIsMinimum=True, label='High to extreme bleaching on most reefs, but more variable than the south',
        distribution=[dict(group='0-1', pct=8.1, text='No or low bleaching'), dict(group='2', pct=15.8, text='Medium'), dict(group='3-5', pct=76.1, text='High to extreme')],
        basis='region-level: share of aerial-survey reefs in each group (AIMS LTMP 2023/24 report)',
        note='Central region, Cooktown to the Whitsundays. 76.1% of aerial-survey reefs had high/very high/extreme bleaching. Bleaching was typically highest on inshore reefs and lower on outer-shelf reefs. AIMS reef-level heat stress: 2.39-11.41 DHW.'),
      aimsReefDhwRange2024=[2.39, 11.41]),
 dict(id='torres-strait', file='torres_strait', name='Torres Strait',
      survey2024=dict(category=0, categoryIsMinimum=False, label='No bleaching (most common score)',
        distribution=[dict(category=i, count=c, pct=round(100 * c / TS_TOTAL, 1)) for i, c in enumerate(TS_COUNTS)],
        basis='region-level: counts of the 186 Torres Strait reefs that received a score (AIMS 2024 report, Table 1); category = most common score',
        note='94% of surveyed Torres Strait reefs had no to low bleaching (scores 0-1). 58 further reefs could not be scored. AIMS reef-level heat stress at surveyed reefs: 0.97-8.94 DHW.'),
      aimsReefDhwRange2024=[0.97, 8.94]),
]

out_reefs = []
for r in REEFS:
    hdr, rows = load(r['file'])
    peaks = {}; peakDates = {}
    for row in rows:
        s = season(row)
        if s in PEAK_SUMMERS and row['dhw'] > peaks.get(s, -1):
            peaks[s] = row['dhw']; peakDates[s] = row['date']   # first date reaching the max
    # series: daily Nov..Jun for selected summers
    ser = []
    for row in rows:
        s = season(row)
        if s in SERIES_SUMMERS:
            ser.append(dict(date=row['date'], dhw_cweeks=round(row['dhw'], 2), sst_c=round(row['sst_90th_hs'], 2)))
    out_reefs.append(dict(id=r['id'], name=r['name'], lat=hdr['lat'], lon=hdr['lon'],
        crwStation=hdr['name'], mmm_c=round(hdr['mmm'], 3), bleachingThreshold_c=round(hdr['mmm'] + 1, 3),
        dhw=ser,
        peakDhwBySummer={str(k): round(v, 2) for k, v in sorted(peaks.items())},
        peakDateBySummer={str(k): v for k, v in sorted(peakDates.items())},
        survey={'2024': r['survey2024']},
        aimsReefDhwRange2024=r['aimsReefDhwRange2024']))

doc = dict(
 baseline=("Heat stress is measured against the Maximum Monthly Mean (MMM): the average temperature of the hottest month, from 1985-2012 satellite data. "
           "Bleaching threshold = MMM + 1 degC. Degree Heating Weeks (DHW, degC-weeks) add up every day's HotSpot (temperature above MMM) that is at least 1 degC, over the last 12 weeks. "
           "About 4 DHW: significant bleaching likely; 8 DHW or more: widespread bleaching and some mortality likely (NOAA Coral Reef Watch). "
           "Each reef entry is a NOAA 5 km Regional Virtual Station (a whole GBR region), not a single reef: its DHW is computed from the 90th-percentile HotSpot of the pixels in the region polygon, so it describes the hot end of the region."),
 summerLabelNote="A summer is labelled by the year it ends: '2024' = November 2023 to June 2024. dhw[] covers 1 Nov to 30 Jun for the summers 2016, 2017, 2020, 2022, 2024 and 2025; peaks are given for 2016 to 2026. sst_c is the CRW 'SST at 90th-percentile HotSpot' (degC).",
 reefs=out_reefs,
 surveyScale=[
  dict(category=0, label='No bleaching', description='No bleached coral seen.'),
  dict(category=1, label='Low', description='1-10% of coral cover bleached.'),
  dict(category=2, label='Medium', description='11-30% bleached.'),
  dict(category=3, label='High', description='31-60% bleached.'),
  dict(category=4, label='Very high', description='61-90% bleached.'),
  dict(category=5, label='Extreme', description='More than 90% bleached.')],
 surveyScaleNote="AIMS/GBRMPA 2024 aerial surveys use six categories, 0 to 5. (The 2016 and 2017 surveys by Hughes et al. merged categories 4 and 5 into one '4 = more than 60%', giving 0-4.)",
 sources=[
  dict(name='NOAA Coral Reef Watch 5 km Regional Virtual Station time series (Version 3.1): Torres Strait, Central GBR, Southern GBR',
       url='https://coralreefwatch.noaa.gov/product/vs/data.php',
       licence='NOAA CRW: data available for use without restriction; users should credit NOAA Coral Reef Watch (https://coralreefwatch.noaa.gov/satellite/docs/recommendations_crw_citation.php). Satellite SST inputs for 2002 onward are GHRSST free and open.',
       citation='NOAA Coral Reef Watch. 2019, updated daily. NOAA Coral Reef Watch Version 3.1 Daily 5km Satellite Regional Virtual Station Time Series Data for Torres Strait, Central GBR and Southern GBR, 1 Nov 2015 - 30 Jun 2026 (summers used). College Park, Maryland, USA: NOAA Coral Reef Watch. Data set accessed 2026-11-24. Method: De La Cour et al. 2020, Remote Sens. 12, 3856, doi:10.3390/rs12233856.',
       retrieved=RETRIEVED),
  dict(name='AIMS and GBRMPA (2024) Aerial surveys of the 2024 mass coral bleaching event on the Great Barrier Reef (Cantin, James & Stella), 15 April 2024',
       url='https://www.aims.gov.au/sites/default/files/2024-04/FINAL-Aerial%20Bleaching%20GBR2024Report_AIMS_Final_15Apr2024_0.pdf',
       licence='Published report; catalogued by AIMS/AODN (data.gov.au record: https://data.gov.au/data/dataset/report-aerial-surveys-of-the-2024-mass-coral-bleaching-event-on-the-great-barrier-reef). AIMS publications are generally CC BY 4.0, but the licence line was not verified for this specific PDF. Values are facts transcribed with attribution.',
       citation='Cantin, N., James, N. & Stella, J. (2024). Aerial surveys of the 2024 mass coral bleaching event on the Great Barrier Reef. AIMS and GBRMPA, Townsville. doi:10.25845/n00q-z603',
       retrieved=RETRIEVED),
  dict(name='AIMS Long-Term Monitoring Program Annual Summary Report of Coral Reef Condition 2023/24 (Central GBR aerial survey percentages)',
       url='https://www.aims.gov.au/sites/default/files/2024-08/AIMS_LTMP_Report_GBR_coral_status_2023_2024_final.pdf',
       licence='AIMS publication (CC BY 4.0 per AIMS data policy; not verified for this PDF)',
       citation='Australian Institute of Marine Science (2024). Annual Summary Report of Coral Reef Condition 2023/24: Coral cover remains high while impacts of mass bleaching and cyclones start to appear. Townsville.',
       retrieved=RETRIEVED)])
json.dump(doc, open(os.path.join(OUT, 'reef.json'), 'w'), separators=(',', ':'))
for r in out_reefs:
    print(r['id'], r['lat'], r['lon'], 'MMM', r['mmm_c'], 'points', len(r['dhw']))
    print('  peaks', r['peakDhwBySummer']); print('  dates', {k: r['peakDateBySummer'][k] for k in ('2016', '2017', '2020', '2022', '2024', '2025')})
print(os.path.getsize(os.path.join(OUT, 'reef.json')))
