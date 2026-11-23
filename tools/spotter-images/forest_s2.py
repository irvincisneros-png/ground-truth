"""Read a window of Sentinel-2 L2A true-colour (TCI) COGs from the public AWS bucket via STAC.
usage: python forest_s2.py ITEM_ID west south east north out.png [max_px_width]"""
import sys, json, urllib.request
import numpy as np, rasterio
from rasterio.windows import from_bounds
from rasterio.warp import transform_bounds
from PIL import Image
item_id, w, s, e, n, out = sys.argv[1], *map(float, sys.argv[2:6]), sys.argv[6]
maxw = int(sys.argv[7]) if len(sys.argv) > 7 else 1200
url = f"https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/{item_id}"
item = json.load(urllib.request.urlopen(url, timeout=60))
href = item["assets"]["visual"]["href"]
print(item_id, item["properties"]["datetime"], href)
with rasterio.open(href) as ds:
    b = transform_bounds("EPSG:4326", ds.crs, w, s, e, n)
    win = from_bounds(*b, transform=ds.transform)
    aspect = win.width / win.height
    arr = ds.read(window=win, out_shape=(3, int(round(maxw / aspect)), maxw), resampling=rasterio.enums.Resampling.average, boundless=False)
Image.fromarray(np.moveaxis(arr, 0, 2).astype("uint8")).save(out)
print("saved", out, arr.shape)
