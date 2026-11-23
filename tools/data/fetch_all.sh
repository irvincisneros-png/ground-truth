#!/bin/zsh
# Reproduce every download into data-raw/ (untrusted scratch, gitignored). Run from the repo root, then the build scripts:
#   python3 -I tools/data/build_reef.py; python3 -I tools/data/build_buoy.py; python3 -I tools/data/build_sealevel.py; python3 -I tools/data/build_seaice.py
#   data-raw/venv/bin/python tools/data/build_forest.py      (venv needs: pip install tifffile imagecodecs zarr numpy pillow)
# Retrieved 2026-11-24.
set -e
mkdir -p data-raw/{crw-vs,aims-report,ltmp,nsidc,star,cu,psmsl,erddap,aims-logger}
for s in torres_strait gbr_far_northern gbr_northern gbr_central gbr_southern; do
  curl -s -o data-raw/crw-vs/$s.txt "https://coralreefwatch.noaa.gov/product/vs/data/$s.txt"
done
curl -sL -o data-raw/aims-report/report.pdf "https://www.aims.gov.au/sites/default/files/2024-04/FINAL-Aerial%20Bleaching%20GBR2024Report_AIMS_Final_15Apr2024_0.pdf"
curl -sL -o data-raw/ltmp/r2324.pdf "https://www.aims.gov.au/sites/default/files/2024-08/AIMS_LTMP_Report_GBR_coral_status_2023_2024_final.pdf"
curl -sL -o data-raw/ltmp/r2425.pdf "https://www.aims.gov.au/sites/default/files/2025-08/AIMS_LTMP_Report_GBR_coral_status_2024_2025_final_web.pdf"
for f in north/monthly/data/N_09_extent_v4.0.csv south/monthly/data/S_02_extent_v4.0.csv south/monthly/data/S_09_extent_v4.0.csv; do
  curl -sL -o data-raw/nsidc/$(basename $f) "https://noaadata.apps.nsidc.org/NOAA/G02135/$f"
done
curl -sL -o data-raw/star/slr_all66.csv "https://www.star.nesdis.noaa.gov/socd/lsa/SeaLevelRise/slr/slr_sla_gbl_free_all_66.csv"
curl -sL -A Mozilla/5.0 -o data-raw/cu/gmsl_2026rel1_seasons_retained.txt "https://sealevel.colorado.edu/files/2026_rel1/gmsl_2026rel1_seasons_retained.txt"
curl -sL -o data-raw/psmsl/rlr_annual.zip "https://psmsl.org/data/obtaining/rlr.annual.data/rlr_annual.zip" && (cd data-raw/psmsl && unzip -o -q rlr_annual.zip)
# CRW 5 km pixel SST/DHW at the Lady Musgrave loggers (ERDDAP redirects to PacIOOS)
for v in CRW_SST CRW_DHW; do
  curl -sL -o data-raw/erddap/${v}_ladymusgrave.csv "https://coastwatch.pfeg.noaa.gov/erddap/griddap/NOAA_DHW.csv?${v}%5B(2023-11-01T12:00:00Z):1:(2024-05-31T12:00:00Z)%5D%5B(-23.89):1:(-23.89)%5D%5B(152.42):1:(152.42)%5D"
done
# AIMS logger bulk file: streamed by HTTP range requests, filtered to Lady Musgrave (takes ~10 min, reads 1.4 GB)
python3 -I tools/data/fetch_aims_logger.py data-raw/aims-logger/filtered.csv
zsh tools/data/fetch_forest.sh
