# Ground Truth: data sources, licences, processing and gaps

All files in `public/data/` were built on 2026-11-24 from open downloads by the scripts in `tools/data/` (`fetch_all.sh` repeats every download into the gitignored `data-raw/`; the `build_*.py` scripts write the JSON/PNG files). No number in these files was invented or estimated: each is either computed from a downloaded dataset or transcribed from a cited official report. Where something could not be obtained it is listed under "Gaps" below.

Total size of `public/data/` that this work added: about 0.43 MB (limit 3 MB). (`public/data/geo/` belongs to another builder.)

| File | Size | Built by |
|---|---|---|
| `reef.json` | 236 KB | `build_reef.py` |
| `buoy.json` | 27 KB | `build_buoy.py` |
| `sealevel.json` | 63 KB | `build_sealevel.py` |
| `seaice.json` | 7 KB | `build_seaice.py` |
| `forest.json` | 229 KB | `build_forest.py` |
| `forest/nsw-gospers-loss.png`, `forest/qld-clearing-loss.png` | 28 KB, 24 KB | `build_forest.py` |

---
## 1. `reef.json`: NOAA Coral Reef Watch heat stress and the AIMS 2024 aerial survey

**Sources**
- NOAA Coral Reef Watch (CRW) Version 3.1 daily 5 km **Regional Virtual Station** text files (`https://coralreefwatch.noaa.gov/product/vs/data/{torres_strait,gbr_central,gbr_southern}.txt`; also downloaded: `gbr_northern`, `gbr_far_northern`, used here only for the context table below).
  Licence: CRW states its data "are available for use without restriction" and asks for credit and citation (https://coralreefwatch.noaa.gov/satellite/docs/recommendations_crw_citation.php). Citation used: *NOAA Coral Reef Watch. 2019, updated daily. NOAA Coral Reef Watch Version 3.1 Daily 5km Satellite Regional Virtual Station Time Series Data for ...; accessed 2026-11-24; method De La Cour et al. 2020, Remote Sens. 12, 3856.*
  Note: the 1985 to 2002 part of the CoralTemp record is based on UK Met Office OSTIA, whose usage statement is "pure academic research only". **We only use 2015 onward** (NOAA geo-polar blended SST, GHRSST "free and open"), so that restriction does not apply. The station files also contain the 1985-2002 rows; they are not copied.
- AIMS and GBRMPA, *Aerial surveys of the 2024 mass coral bleaching event on the Great Barrier Reef* (Cantin, James, Stella; 15 April 2024; doi:10.25845/n00q-z603) and AIMS LTMP Annual Summary Report 2023/24. Numbers transcribed with attribution. Licence of these PDFs was not verified (AIMS publications are normally CC BY 4.0).

**What the reefs are.** The three `reefs` are NOAA **regional** virtual stations (Southern GBR, Central GBR, Torres Strait), each marked at the polygon's middle (lat/lon from the file header). A station's DHW is computed from the 90th-percentile HotSpot of the pixels in the region polygon, so it describes the hot end of the region, not one reef. `mmm_c` is the station's "Averaged Maximum Monthly Mean" (Southern 27.657, Central 28.342, Torres Strait 28.895 degC); bleaching threshold = MMM + 1.

**Processing.**
- A summer is labelled by the year it ends (Nov to Jun). `dhw[]` holds the daily `DHW_from_90th_HS>1` value (degC-weeks) and the `SST@90th_HS` value (`sst_c`) for 1 Nov to 30 Jun of the summers 2016, 2017, 2020, 2022, 2024, 2025.
- `peakDhwBySummer` = maximum daily DHW in the Nov-Jun window, for 2016 to 2026; `peakDateBySummer` = the first date that maximum was reached.

**Key numbers (peak DHW, degC-weeks)**

| Summer | Southern GBR | Central GBR | Torres Strait | (Northern GBR) | (Far Northern GBR) |
|---|---|---|---|---|---|
| 2016 | 2.54 | 5.95 | 13.27 | 11.70 | 15.47 |
| 2017 | 10.74 | 10.50 | 9.41 | 13.59 | 15.32 |
| 2020 | 11.80 | 10.61 | 10.75 | 10.75 | 14.21 |
| 2022 | 7.42 | 10.91 | 10.77 | 7.98 | 11.84 |
| **2024** | **14.57** (8 Mar) | **12.03** (7 Mar) | **13.80** (17 Mar) | 13.55 | 12.18 |
| 2025 | 4.52 | 7.91 | 15.18 | 10.21 | 13.84 |

The Northern and Far Northern columns are context only (not in `reef.json`). The 2026 summer (Nov 2025 to Jun 2026) peaks are in the file (Southern 0.99, Central 2.20, Torres Strait 8.89).

**2024 aerial survey (real, region-level).**
- AIMS scale is **0 to 5** (0 none, 1 <10%, 2 11-30%, 3 31-60%, 4 61-90%, 5 >90% of shallow coral cover bleached). The spec said 0-4: that was the older 2016/2017 scale, which merged 4 and 5. `surveyScale` in the file has the six categories.
- **Per-reef scores were not obtainable** as machine-readable data (AIMS publishes a report with a static map; I found no per-reef download for 2024). So `survey["2024"]` is **region-level**, and says so in `basis`:
  - Torres Strait: Table 1 counts of 186 scored reefs, categories 0 to 5 = 112, 63, 8, 2, 1, 0. Most common score = 0, so `category: 0`. 94% of scored reefs were 0-1.
  - Southern GBR: published shares 3% none, 16% low or medium, 80% high to extreme. No single category exists; `category: 3` with `categoryIsMinimum: true` means "most reefs scored 3 or higher".
  - Central GBR: published shares 8.1% none/low, 15.8% medium, 76.1% high/very high/extreme. `category: 3`, `categoryIsMinimum: true`.
- `aimsReefDhwRange2024` = the range of DHW AIMS reports **at the individually surveyed reefs**: Torres Strait 0.97 to 8.94, Central 2.39 to 11.41, Southern 6.22 to 15.55.

**Reef pair chosen and why.** I recommend **Southern GBR vs Torres Strait** for the predict-and-reveal beat: their regional peak DHW in 2024 is nearly the same (14.57 vs 13.80, ratio 1.06), yet 80% of Southern reefs were highly to extremely bleached while 94% of Torres Strait reefs showed none or low bleaching. Central GBR (12.03; 76% high to extreme) is a third option and behaves like the south.
**Important caveat, do not hide it from students or teachers:** the Torres Strait regional station shows DHW of 8 to 13 in nearly every summer since 2016 (peaks 9.03, 7.98, 8.98, 8.44 in 2018, 2019, 2021, 2023), while AIMS found only 0.97 to 8.94 DHW at the reefs actually surveyed there in 2024. So part of the "mismatch" comes from the regional 90th-percentile metric, not only from reef biology. AIMS says that at reef scale the bleaching was "largely consistent" with DHW. This is a good "limits of the evidence" point ("DHW predicts risk, not outcome; region vs reef scale"), but the game should not claim DHW failed at reef scale.

**Was 2025 a GBR mass bleaching year? Yes.** AIMS ("Coral bleaching events", https://www.aims.gov.au/research-topics/environmental-issues/coral-bleaching/coral-bleaching-events, read 2026-11-24): "A mass bleaching event occurred across the Central and Northern regions of the Great Barrier Reef in 2025. The event was the sixth since 2016 and, while less extensive and less intense than the bleaching event in 2024 ..., it was the second time the Reef has experienced consecutive heat waves causing severe bleaching and some mortality (2016-2017 & 2024-2025)." Aerial surveys in March 2025 covered 281 reefs (Torres Strait, Northern, and Central north of Townsville); "No survey reefs exhibited extremely high bleaching (more than 90% bleached) and 30 reefs had very high bleaching prevalence (between 61 and 90% bleached). ... only 6% of the surveyed reefs had no signs of bleaching." The AIMS LTMP 2024/25 report (https://www.aims.gov.au/sites/default/files/2025-08/AIMS_LTMP_Report_GBR_coral_status_2024_2025_final_web.pdf) gives overlapping but differently-counted figures (258 reefs surveyed, 9% very high). AIMS lists full-scale mass-bleaching surveys in 1998, 2002, 2016, 2017, 2020, 2022, 2024 and 2025. Consistent with this, the CRW regional peaks for 2025 are high in the north (Torres Strait 15.18, Far Northern 13.84) and low in the south (4.52). I did **not** verify whether a 2026 summer event was declared.

---
## 2. `buoy.json`: AIMS logger vs CRW satellite SST

- **Site:** Lady Musgrave Reef, Capricorn-Bunker Group, Southern GBR (-23.8835, 152.4198; inside the Southern GBR station region). Period 2023-11-01 to 2024-05-31, 212 daily rows (every day passed QC).
- **Logger:** AIMS Sea Water Temperature Observing System, deployment LADYSL1 (reef slope), water temperature at **9.9 m** (`depth_m`), RBRsolo3, 5-minute readings. A second logger at the same reef, LADYFL2 (reef flat, **0.3 m**), is included as `logger_shallow_c`.
- **Satellite:** CRW CoralTemp v3.1 5 km SST for the pixel centred -23.875, 152.425 (contains both loggers), extracted through ERDDAP (`NOAA_DHW`, redirects to PacIOOS `dhw_5km`), plus the pixel's DHW. This is "night-time geo-polar blended SST", a near-surface/bulk-type value, not a pure skin temperature.
- **Processing:** UTC readings to Queensland local dates (UTC+10), mean of QC-flag-1 readings per day (days with <70% good readings dropped; none dropped for the deep logger). The satellite day is the UTC-dated CRW day, so a few hours of offset exist.
- **Licence:** AIMS Temperature Logger Program: **CC BY 3.0 Australia**; AIMS use limitation: data "as is". Citation in file (doi:10.25845/5b4eb0f9bb848). NOAA CRW as above.
- **Results:** satellite minus 9.9 m logger: mean +0.27 degC, RMS 0.34, range -0.38 to +0.85. Satellite minus 0.3 m logger: mean +0.24. 0.3 m minus 9.9 m logger: mean +0.03 (range -0.39 to +0.59). Peak satellite SST 29.18 degC (2024-01-29) vs 28.89 degC at 9.9 m the same day. Pixel DHW peaked at 11.42 on 2024-03-07 (AIMS reports 10.9-11.7 DHW for the Capricorn-Bunker sector).
- **Caveat for the lesson:** the real differences are small (a few tenths of a degree). The satellite and the logger agree well; the teaching point is "satellite estimate validated by in-water logger, with a depth/time/pixel-size offset", not "they disagree".

---
## 3. `sealevel.json`: global sea level from altimetry and a tide gauge

- **Satellite series: NOAA Laboratory for Satellite Altimetry, not NASA.** NASA's GMSL indicator (PO.DAAC `NASA_SSH_GMSL_INDICATOR` / `GMSL_TPJAOS_5.2`) and the climate.nasa.gov download now require a free NASA Earthdata login (HTTP Basic Auth). I am not allowed to create accounts or enter credentials, so I did **not** get the NASA file. I used the NOAA/LSA multi-mission series `slr_sla_gbl_free_all_66.csv` (TOPEX/Poseidon, Jason-1/2/3, Sentinel-6MF; 66S-66N; annual and semi-annual signals removed; no GIA correction), 1992.96 to 2025.13, 1,557 samples. Licence: US Government data; required acknowledgement "Altimetry data are provided by NOAA Laboratory for Satellite Altimetry." Where two missions overlap I averaged them (the overlaps agree to a few mm). Re-zeroed so the 1993 mean is 0. **The orchestrator can swap in the NASA file later: the contract is identical.**
- **Rates (least squares, mm/yr):** 1993-2002 = **2.71** (n=361); 2015-2024 = **3.73** (n=517). Method: OLS fit of gmsl_mm against t_year over 1993-01-01 to <2003-01-01 and 2015-01-01 to <2025-01-01 (naive standard errors 0.06 and 0.04 mm/yr, which understate the true uncertainty). Whole 1993-2024: 3.23. Cross-check with the CU Sea Level Research Group 2026_rel1 series (not bundled; no licence statement found): 2.92 and 3.95.
- **These do not reproduce the WMO figures** (2.1 and 4.7 mm/yr, WMO State of the Global Climate 2024, WMO-No. 1368, https://wmo.int/sites/default/files/2025-03/WMO-1368-2024_en.pdf). Both datasets I could access show acceleration (+38% and +35%), but a smaller one. Short-window rates depend on altimetry processing (especially early TOPEX/Poseidon drift corrections) and ENSO. The file stores the WMO numbers under `ratesDetail.wmo_state_of_global_climate_2024` as a quoted comparison, clearly marked as not computed here. **Do not write "2.1 to 4.7" in the game as if the data gave it; say "what this data gives", or cite WMO.**
- **ENSO trap pair:** `annual[]` gives annual means 1993-2024 (re-zeroed). Annual means that fell year to year: 1997 to 1998 (-0.9 mm), 1998 to 1999 (-0.8 mm), **2010 to 2011 (-1.7 mm; the 2010-12 La Nina)**. 2010 to 2011 is the best "wrong-way pair".
- **Tide gauge: Sydney, Fort Denison 2 (PSMSL RLR station 196), 1915-2024** (107 annual values; 1930, 1941, 2000 missing). Chosen because it is the longest continuous record on the east coast with annual RLR data (about 110 years), near the students; it is also the Sydney reference gauge. Booby Island (Torres Strait, PSMSL 1268) has only 33 values in 1972-2022 with gaps, so it was not used. `msl_mm` is relative to the gauge's own 1993-2012 mean. This is sea level relative to land (includes land movement). Fort Denison trends: 1.17 mm/yr (1915-2024), 3.75 (1993-2024), 4.58 (2015-2024); the 1993-2002 value (7.38 mm/yr) is a 10-point fit and should not be shown as a trend.
- **Licence:** PSMSL has no formal licence text; data are freely available; citation requested (Holgate et al. 2013; PSMSL). Original data from the Australian National Tide Centre (BoM).

---
## 4. `forest.json` and `forest/*.png`: Hansen tree-cover loss with fire and clearing overlays

- **Hansen/UMD Global Forest Change, GFC-2025-v1.13** (latest available on 2026-11-24; loss years 2001-2025), `lossyear` tiles `30S_150E` and `20S_140E` (each about 21 MB). Licence **CC BY 4.0**; the changes made are recorded in the file: cropped to ~15 km windows, loss pixels recoloured by year, saved as palette PNGs. Citation: Hansen et al. 2013, Science 342, 850-853.
- **PNG format:** 640 x 540 px, palette-indexed, index 0 = no loss (transparent), **palette index = loss year minus 2000**; focus years use a cividis-like ramp, other years a dim blue. `lossLegend` lists the colours. North-up EPSG:4326; `bounds` [west, south, east, north] map to the image edges.
- **(a) `nsw-gospers`**: bounds [150.0, -33.439, 150.16, -33.304] (western edge of the Wollemi/Gospers Mountain fire, NSW). Overlay: NSW NPWS Fire History wildfire polygons for the 2019-20 season (Gospers Mountain fire, plus the small View St, Lidsdale fire), CC BY 4.0, clipped and simplified. NPWS record for Gospers Mountain: 2019-10-25 to 2020-02-09 (UTC dates), 479,514 ha. **I used the NPWS fire-history perimeters, not NSW FESM 2019/20**, because FESM is a raster only (no polygons without converting it). Result: 39.7% of the window shows 2019-2020 loss and **98.6% of those loss pixels are inside the fire perimeters**, which cover 52.5% of the window. Loss by year in the window: 2019 35.7%, 2020 2.8%, all other years about 4% in total.
- **(b) `qld-clearing`**: bounds [145.35, -25.89, 145.51, -25.755] (south-west Queensland, east of Charleville). Overlay: Queensland **SLATS** woody-vegetation clearing polygons, periods 2003-04 to 2007-08 (685 polygons, all classed "Pasture"), CC BY 4.0 (State of Queensland), clipped and simplified. Result: 17.2% of the window has 2004-2008 loss (2006 alone 12.19%) and 93.5% of it lies inside SLATS polygons. The loss is rectangular blocks. **This clearing is from 2004-2008, not recent**: a coarse scan of the 140-150 E tile did not turn up a comparably clean, dense block-clearing site after 2012. The tile scan was coarse (0.15 degree cells) and not exhaustive; more recent clearing exists in Queensland, including east of 150 E (tile 20S_150E, not downloaded).
- **Attribution note** (in `note`): van Oldenborgh et al. 2021, NHESS 21, 941-960, doi:10.5194/nhess-21-941-2021: fire-weather risk increased (a significant increase of at least 30% in climate models; large trend in ERA5). It does not say climate change caused each fire. "Burnt eucalypt forest often resprouts" is stated as general ecology (not measured here).
- **Caveats:** Hansen "loss" is stand-replacement canopy loss at 30 m and is not a causal label; the perimeter/polygon is what distinguishes fire from clearing. SLATS periods run roughly mid-year to mid-year, so they match Hansen calendar years only approximately. The Hansen tiles were not available as COGs; the full tiles were downloaded and cropped locally.

---
## 5. `seaice.json`: NSIDC Sea Ice Index v4

- **Data:** NSIDC Sea Ice Index v4 (G02135) monthly extent: `N_09_extent_v4.0.csv`, `S_02_extent_v4.0.csv`, `S_09_extent_v4.0.csv` (https://noaadata.apps.nsidc.org/NOAA/G02135/), 1979 to 2026 (48 values each). Extent in million km2 (15% concentration threshold).
- **LICENCE FINDING (open check from the pitch): no explicit licence is stated for G02135.** The product page (https://nsidc.org/data/g02135/versions/4) has no licence field; its only condition is the citation requirement ("As a condition of using these data, you must cite the use of this data set"). NSIDC's Data Policies (https://nsidc.org/about/data-policies) say "Most of the data held by NSIDC are government-funded and in the public domain" and that copyright restrictions are "clearly known to potential users in the data set documentation" (none are stated for G02135). My reading: free to use and redistribute **with the NSIDC citation**, but it is not a formal open licence. If you want certainty, ask nsidc@nsidc.org. The file carries the required citation (Fetterer et al. 2025, doi:10.7265/a98x-0f50). The dataset is on "Basic" level of service (funding change).
- **Sensor change:** from January 2025 NSIDC builds the Index from AMSR2 (NSIDC-0803) instead of SSMIS (NSIDC-0051 and -0081), because SSMIS data are no longer available; NSIDC says the intercalibration is preliminary and the change makes the trend "slightly more negative". So the 2025 and 2026 points come from a different sensor. `inputProductByYear` records this.
- **Arctic September trend:** least-squares slope of extent vs year x 10, divided by the 1981-2010 mean (6.413 million km2), as NSIDC does. `trendPctPerDecade.arctic_sep` = **-11.56** %/decade (1979-2026; -0.741 million km2 per decade). The same method gives -12.14 (1979-2024, before the sensor change) and -11.86 (1979-2025). So "about -12 % per decade" holds up to 2024; the 2025-26 recovery years and the sensor change pull the 1979-2026 figure to -11.6.
- **Antarctic values:** February: 2023 = **1.98** (record low in the series), 2024 = 2.19, 2025 = 2.22, 2026 = 2.91, 2014 = 3.84. September: 2014 = **19.76** (record high), 2023 = **16.89** (record low), 2024 = 17.15, 2025 = 17.64, 2026 = 17.32. Arctic September record low: 2012 = 3.57. Trends 1979-2026: Antarctic February -2.39 %/decade, Antarctic September -0.37 %/decade (weak and sensitive to end year: -0.12 for 1979-2024).

---
## Gaps and uncertainties (honest list)
1. **No per-reef survey scores.** Survey outcomes are region-level (Torres Strait counts; Southern and Central as published percentages). Reef-level 2024 aerial scores exist only as a static map in the AIMS report.
2. **No survey categories for 2016, 2017, 2020, 2022.** A per-reef 2016 aerial dataset exists (Hughes et al., JCU, doi:10.4225/28/5A725EE7548A7, **CC BY-NC 4.0**, scale 0-4); I did not download or bundle it because of the non-commercial licence and because it is per-reef 2016 only. Nothing machine-readable was found for 2017, 2020, 2022.
3. **Scale is 0-5** for 2024 (not 0-4 as in the spec); `category` is a minimum for Southern and Central.
4. **NASA GMSL not obtained** (Earthdata login). NOAA/LSA used instead. Rates 2.71 and 3.73 mm/yr differ from WMO's 2.1 and 4.7.
5. **Torres Strait regional DHW is high every year** and over-represents the hot end versus the reefs AIMS surveyed (0.97-8.94 DHW). See the reef caveat.
6. **AIMS report/LTMP report licences** not verified for the PDFs (values transcribed as facts with citation). SLATS 2003-08 layer licence line not separately verified (CC BY 4.0 confirmed for the 2018 SLATS datasets on data.qld.gov.au). NSIDC: no explicit licence (see above). PSMSL: no formal licence text.
7. **QLD clearing example is 2004-2008**, not a recent event.
8. **2026 summer bleaching status not checked.**
9. Buoy: the satellite-logger differences are small (mean +0.27 degC); the "why do they differ" prompt should be framed as depth, time of day and pixel size, not a large disagreement.
10. `public/data/geo/au-land.json` was created by someone else and is not covered here.

---
## Satellite Spotter images (`public/spotter/*.webp`, `images.json`)

Retrieved 2026-11-24. Scripts in `tools/spotter-images/` (`forest_s2_fc.py`, `reef_compose.py`, `finalize.py`); raw downloads in `data-raw/spotter/` (gitignored). All files are webp, quality 80, each at most 350 KB.

**Ice: `ice-before.webp` (Sep 1984) / `ice-after.webp` (Sep 2024)**, 840 x 1000 px.
- **Source:** NOAA/NSIDC Sea Ice Index v4 (G02135) monthly concentration maps: `https://noaadata.apps.nsidc.org/NOAA/G02135/north/monthly/images/09_Sep/N_198409_conc_v4.0.png` and `N_202409_conc_v4.0.png`. Original size 420 x 500, upscaled 2x (Lanczos) with no other change. The maps carry the NSIDC title, the 0 to 100 % legend and the 1981-2010 median ice edge (pink line).
- **Why not NASA SVS:** svs.gsfc.nasa.gov (the first choice) did not respond from this network, and NASA Earth Observatory's World of Change series starts in 1990. The NSIDC pair has identical framing and projection and covers 1984 vs 2024.
- **Licence:** same finding as section 5: **no explicit licence**; NSIDC says most data are government-funded and public domain, and the only condition is the citation (Fetterer et al. 2025, doi:10.7265/a98x-0f50). The sea-ice map frames are monthly means, not a single-day minimum. The image text says "Total Area" while the product's headline numbers elsewhere in this file use extent; the map is of concentration.
- **Sensors:** 1984 is from SMMR/SSM/I-era passive microwave, 2024 from SSMIS (AMSR2 from 2025).

**Forest: `forest-before.webp` (22 Oct 2019) / `forest-after.webp` (20 Mar 2020)**, 1200 x 810 px.
- **Source:** Copernicus Sentinel-2A L2A, tile 56HKJ, items `S2A_56HKJ_20191022_0_L2A` and `S2A_56HKJ_20200320_0_L2A`, read from the public AWS bucket via the Element 84 Earth Search STAC (`https://earth-search.aws.element84.com/v1`; collection `sentinel-2-l2a`, DOI 10.5270/S2_-742ikth). Cloud cover 0.1 % and 0.0004 %.
- **Processing (mine, not NASA/ESA):** window lon 150.05 to 150.60, lat -33.285 to -32.979 (Wollemi National Park / Capertee Valley edge near Lithgow, NSW; inside the 2019-20 Gospers Mountain fire area). False colour R = band 12 (SWIR 2.2 um), G = band 11 (SWIR 1.6 um), B = band 4 (red), same fixed reflectance stretch (gamma 0.8) for both dates, resampled to 1200 px by area averaging. Burnt ground shows brown to red-brown; healthy forest is dark green. The bright green paddocks at the top left of the "after" image are pasture that greened after rain, not forest.
- **Licence:** Copernicus Sentinel Data Legal Notice (free, full and open, attribution required). Credit: "Contains modified Copernicus Sentinel data 2019 and 2020".
- **Not checked:** I did not overlay the NPWS fire perimeter on this exact window (section 4 does for the nearby Gospers window), so "burnt" is shown by the image itself, not by an independent fire-boundary check. The SVS/NASA Earth Observatory 2019-20 image pairs searched for did not exist as before/after pairs for NSW.

**Reef: `reef-before.webp` (15 Mar 2023) / `reef-after.webp` (15 Mar 2024)**, 1200 x 1334 px.
- **Source:** NOAA Coral Reef Watch CoralTemp v3.1 Daily 5 km Degree Heating Weeks, archived at NOAA NCEI: plain map `https://www.ncei.noaa.gov/data/oceans/crw/5km/v3.1/image_plain/daily/dhw/png/{2023,2024}/ct5km_dhw_v3.1_{20230315,20240315}.png` (7200 x 3600) and annotated map `.../image_browse/daily/dhw/png/{year}/ct5km_dhw_v3.1_global_{date}.png`.
- **Processing:** the plain map cropped to lon 139.5 to 159.5, lat -8 to -28 (Cape York to Fraser Island and the Coral Sea), upscaled 3x nearest-neighbour so the real 5 km pixels stay visible. NOAA's own title strip and colour legend are cropped from the annotated map of the same date and stacked above and below. Nothing was redrawn. Grey is land. There are no coastline lines or place names on the NOAA plain map.
- **Calm year choice:** 15 Mar 2021 was checked and rejected (high DHW across much of the Coral Sea); March 2023 is mostly 0 to 3 degC-weeks over the reef, with a few higher patches near Papua New Guinea (top) and the far south-east corner.
- **Licence:** NOAA is a US Government work, public domain. **The CRW pages checked state no licence or credit line**, so this is my reading; the CRW "How to cite" page was not fetched. Credit given as NOAA Coral Reef Watch.
