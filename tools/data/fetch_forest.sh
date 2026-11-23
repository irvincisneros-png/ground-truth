#!/bin/zsh
# Download raw inputs for the forest cases into data-raw/ (untrusted scratch). Run from repo root.
set -e
mkdir -p data-raw/hansen data-raw/npws data-raw/slats
H=https://storage.googleapis.com/earthenginepartners-hansen/GFC-2025-v1.13
for t in 30S_150E 20S_140E; do
  [ -f data-raw/hansen/lossyear_$t.tif ] || curl -s --max-time 300 -o data-raw/hansen/lossyear_$t.tif "$H/Hansen_GFC-2025-v1.13_lossyear_$t.tif"
done
# NSW NPWS Fire History (wildfire polygons, 2019-20 season) for the Wollemi window region
U=https://mapprod3.environment.nsw.gov.au/arcgis/rest/services/Fire/NPWS_Fire_History/MapServer/0
curl -sL --max-time 180 -G "$U/query" --data-urlencode "geometry=150.0,-33.95,151.1,-33.0" --data-urlencode "geometryType=esriGeometryEnvelope" --data-urlencode "inSR=4326" --data-urlencode "outSR=4326" --data-urlencode "spatialRel=esriSpatialRelIntersects" --data-urlencode "where=FireYear=201920" --data-urlencode "outFields=FireName,FireNo,FireYear,Label,StartDate,EndDate,AreaHa" --data-urlencode "returnGeometry=true" --data-urlencode "maxAllowableOffset=0.0005" --data-urlencode "f=geojson" -o data-raw/npws/region_201920.geojson
# Queensland SLATS woody-vegetation clearing polygons, periods 2003-04..2007-08, for the QLD window
S=https://spatial-gis.information.qld.gov.au/arcgis/rest/services/Environment/SLATS/MapServer
for i in 216 218 220 222 224; do
  curl -sL --max-time 60 -G "$S/$i/query" --data-urlencode "geometry=145.35,-25.89,145.51,-25.755" --data-urlencode "geometryType=esriGeometryEnvelope" --data-urlencode "inSR=4326" --data-urlencode "outSR=4326" --data-urlencode "spatialRel=esriSpatialRelIntersects" --data-urlencode "where=1=1" --data-urlencode "outFields=*" --data-urlencode "returnGeometry=true" --data-urlencode "maxAllowableOffset=0.0006" --data-urlencode "f=geojson" -o data-raw/slats/l$i.geojson
done
