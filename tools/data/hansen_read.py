"""Read a lat/lon window from a Hansen GFC GeoTIFF tile (EPSG:4326, 0.00025 deg pixels).
Needs tifffile + imagecodecs (see data-raw/venv; not part of the repo)."""
import os
import numpy as np, tifffile
RES = 0.00025
def tile_origin(name):
    parts = os.path.basename(name).replace('.tif', '').split('_')
    la, lo = parts[-2], parts[-1]
    lat = -int(la[:-1]) if la.endswith('S') else int(la[:-1])
    lon = int(lo[:-1]) if lo.endswith('E') else -int(lo[:-1])
    return lat, lon
_cache = {}
def load_tile(path):
    if path not in _cache:
        _cache.clear()
        _cache[path] = tifffile.imread(path)
    return _cache[path]
def read_window(path, w, s, e, n):
    tlat, tlon = tile_origin(path)
    x0 = int(round((w - tlon) / RES)); x1 = int(round((e - tlon) / RES))
    y0 = int(round((tlat - n) / RES)); y1 = int(round((tlat - s) / RES))
    a = load_tile(path)[y0:y1, x0:x1]
    sn = (tlon + x0 * RES, tlat - y1 * RES, tlon + x1 * RES, tlat - y0 * RES)
    return a, sn
