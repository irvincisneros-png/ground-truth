"""Sentinel-2 L2A false-colour window (R=B12 SWIR2, G=B11 SWIR1, B=B04 red), fixed stretch so before/after match.
Burnt ground shows brown/dark red, healthy forest shows green.
usage: python forest_s2_fc.py ITEM_ID west south east north out.png [width]"""
import sys, json, urllib.request
import numpy as np, rasterio
from rasterio.windows import from_bounds
from rasterio.warp import transform_bounds
from rasterio.enums import Resampling
from PIL import Image
item_id, w, s, e, n, out = sys.argv[1], *map(float, sys.argv[2:6]), sys.argv[6]
W = int(sys.argv[7]) if len(sys.argv) > 7 else 1200
item = json.load(urllib.request.urlopen(f"https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/{item_id}", timeout=60))
print(item_id, item["properties"]["datetime"])
LO_HI = {"swir22": (0.0, 0.30), "swir16": (0.03, 0.45), "red": (0.0, 0.20)}
chans = []
H = None
for key in ("swir22", "swir16", "red"):
    with rasterio.open(item["assets"][key]["href"]) as ds:
        b = transform_bounds("EPSG:4326", ds.crs, w, s, e, n)
        win = from_bounds(*b, transform=ds.transform)
        if H is None:
            H = int(round(W * win.height / win.width))
        a = ds.read(1, window=win, out_shape=(H, W), resampling=Resampling.average).astype("float32") / 10000.0
    lo, hi = LO_HI[key]
    chans.append(np.clip((a - lo) / (hi - lo), 0, 1) ** 0.8)
Image.fromarray((np.stack(chans, 2) * 255).astype("uint8")).save(out)
print("saved", out, W, H)
