"""Crop the NOAA CRW 5km DHW global 'plain' map (7200x3600, 0.05 deg, lon -180..180, lat 90..-90) to the
Great Barrier Reef / Coral Sea, upscale 3x (nearest, so the real 5 km pixels stay visible), and stack the
REAL title strip and colour legend cropped from NOAA's matching 'browse' image under/over it.
usage: python reef_compose.py YYYYMMDD out.png   (expects data-raw/spotter/reef/plain_YYYYMMDD.png + dhw_global_YYYYMMDD.png)"""
import sys
from PIL import Image
d, out = sys.argv[1], sys.argv[2]
R = "data-raw/spotter/reef/"
LON0, LON1, LAT0, LAT1 = 139.5, 159.5, -8.0, -28.0
SC = 3
plain = Image.open(f"{R}plain_{d}.png").convert("RGBA")
box = (round((LON0 + 180) / 0.05), round((90 - LAT0) / 0.05), round((LON1 + 180) / 0.05), round((90 - LAT1) / 0.05))
m = plain.crop(box)
bg = Image.new("RGBA", m.size, (255, 255, 255, 255)); bg.alpha_composite(m)
m = bg.convert("RGB").resize((m.width * SC, m.height * SC), Image.NEAREST)
W = m.width
browse = Image.open(f"{R}dhw_global_{d}.png").convert("RGB")
title = browse.crop((360, 4, 1430, 40))
legend = browse.crop((100, 998, 1745, 1086))
legend = legend.resize((W, round(legend.height * W / legend.width)), Image.LANCZOS)
H = 50 + m.height + 10 + legend.height + 10
canvas = Image.new("RGB", (W, H), (255, 255, 255))
canvas.paste(title, ((W - title.width) // 2, 6))
canvas.paste(m, (0, 50))
canvas.paste(legend, (0, 50 + m.height + 10))
canvas.save(out)
print(out, canvas.size)
