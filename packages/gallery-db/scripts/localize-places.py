"""Extract labelled Chinese/English GeoNames aliases from a local official dump."""
import gzip,hashlib,io,json,sys,zipfile
from pathlib import Path
source=Path(sys.argv[1])
output=Path(__file__).resolve().parents[1]/'data'/'places.json.gz'
digest=hashlib.sha256()
with source.open('rb') as file:
    for block in iter(lambda:file.read(1024*1024),b''):digest.update(block)
checksum=digest.hexdigest()
manifest=json.loads((output.parent/'places-source.json').read_text())
if checksum!=manifest['inputs']['alternateNamesV2.zip']:raise ValueError('Source checksum changed; review the manifest before updating')
data=json.loads(gzip.decompress(output.read_bytes()))
ids={r[0] for r in data['cities']}|set(data['admins'])
names={};scores={}
with zipfile.ZipFile(source) as archive:
    with archive.open('alternateNamesV2.txt') as raw:
        for line in io.TextIOWrapper(raw,encoding='utf-8'):
            cols=line.rstrip('\n').split('\t')
            if len(cols)<8 or cols[1] not in ids or cols[2] not in ('zh','zh-CN','zh-Hans','en') or cols[6]=='1' or cols[7]=='1':continue
            lang='en' if cols[2]=='en' else 'zh'
            score=(int(cols[2] in ('zh-CN','zh-Hans')),int(cols[4]=='1'),int(cols[5]=='1'))
            key=(cols[1],lang)
            if key not in scores or score>scores[key]:
                names.setdefault(cols[1],{})[lang]=cols[3];scores[key]=score
            names.setdefault(cols[1],{}).setdefault('aliases',[]).append(cols[3])
data['localized']=names
output.write_bytes(gzip.compress(json.dumps(data,ensure_ascii=False,separators=(',',':')).encode(),mtime=0))
print('alternateNamesV2.zip sha256',checksum,'localized',len(names),'bytes',output.stat().st_size)
