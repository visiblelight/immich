"""Build a compact, offline GeoNames gazetteer. No photo coordinates are sent out."""
import gzip, hashlib, io, json, sys, urllib.request, zipfile
from pathlib import Path
BASE = 'https://download.geonames.org/export/dump/'
MANIFEST = json.loads((Path(__file__).resolve().parents[1] / 'data' / 'places-source.json').read_text())

def download(name):
    data = (Path(sys.argv[1]) / name).read_bytes() if len(sys.argv) > 1 else urllib.request.urlopen(BASE + name, timeout=120).read()
    if hashlib.sha256(data).hexdigest() != MANIFEST['inputs'][name]:
        raise ValueError(name + ': source checksum changed; review and update the manifest deliberately')
    print(name, 'sha256', hashlib.sha256(data).hexdigest())
    return data

admins = {}
for line in download('admin1CodesASCII.txt').decode().splitlines():
    code, name, ascii_name, gid = line.split('\t')
    admins[code] = [gid, ascii_name or name]
raw = download('cities500.zip')
rows = []
with zipfile.ZipFile(io.BytesIO(raw)) as archive:
    for line in archive.read('cities500.txt').decode().splitlines():
        c = line.split('\t')
        # Stable ID, English/ASCII display fallback, aliases, country, admin ID, coordinates.
        admin = admins.get(c[8] + '.' + c[10])
        rows.append([c[0], c[2] or c[1], list(dict.fromkeys([c[1], *c[3].split(',')])) ,c[8],admin[0] if admin else '',float(c[4]),float(c[5])])
output = Path(__file__).resolve().parents[1] / 'data' / 'places.json.gz'
output.parent.mkdir(exist_ok=True)
payload = {'version':'geonames-2026-10-05','admins':{v[0]:[v[1],k.split('.')[0]] for k,v in admins.items()},'cities':rows}
output.write_bytes(gzip.compress(json.dumps(payload,ensure_ascii=False,separators=(',',':')).encode(),mtime=0))
print(len(rows), 'places;', output.stat().st_size, 'bytes')
