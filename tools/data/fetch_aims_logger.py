"""Stream the AIMS temperature-logger bulk CSV (1.4 GB zip) over HTTP and keep only
rows for the sites we need. Output: data-raw/aims-logger/filtered.csv (untrusted scratch)."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from httpzip import open_zip
URL = "https://apps.aims.gov.au/data/temperature-loggers/temp-logger-data.zip"
SITES = [b",Lady Musgrave,"]
PERIODS = [b",2023-09-29,2024-11-06,"]
out = sys.argv[1]
z = open_zip(URL)
with z.open("temp-logger-data.csv") as f, open(out, "wb") as o:
    o.write(f.readline())
    n = 0
    for line in f:
        n += 1
        h = line[:140]
        if any(s in h for s in SITES) and any(q in line[:200] for q in PERIODS):
            o.write(line)
        if n % 50_000_000 == 0:
            print(n, flush=True)
print("done", n)
