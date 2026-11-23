"""Convert prepared PNGs to the final webp files in public/spotter/. Run from the project root: python3 -I tools/spotter-images/finalize.py"""
from PIL import Image
import os
R = "data-raw/spotter/"
jobs = {
 "ice-before": (R + "ice-nsidc/N_198409.png", 840),
 "ice-after":  (R + "ice-nsidc/N_202409.png", 840),
 "forest-before": (R + "forest/fc3_before.png", None),
 "forest-after":  (R + "forest/fc3_after.png", None),
 "reef-before": (R + "reef/comp_20230315.png", None),
 "reef-after":  (R + "reef/comp_20240315.png", None),
}
os.makedirs("public/spotter", exist_ok=True)
for name, (src, w) in jobs.items():
    im = Image.open(src).convert("RGB")
    if w: im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
    p = f"public/spotter/{name}.webp"
    q = 80
    while True:
        im.save(p, "WEBP", quality=q, method=6)
        if os.path.getsize(p) <= 350_000 or q <= 50: break
        q -= 5
    print(name, im.size, q, os.path.getsize(p))
