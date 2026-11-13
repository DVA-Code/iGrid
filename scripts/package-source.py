"""Build distinct developer, hosting and public-source archives from allowlists."""
from pathlib import Path
from zipfile import ZipFile,ZIP_DEFLATED
import json,hashlib
root=Path(__file__).resolve().parents[1]
assets={'.html','.js','.css','.png','.jpg','.jpeg','.webp','.svg','.ico','.glb','.woff','.woff2','.ttf','.json','.txt'}
def collect(folder,suffixes):
    selected=[]
    for p in (root/folder).rglob('*'):
        rel=p.relative_to(root)
        if not p.is_file() or p.suffix not in suffixes:continue
        if any(x.startswith('.') or x in {'__pycache__','node_modules'} for x in rel.parts):continue
        if rel.as_posix().startswith('server/data/'):continue
        selected.append(p)
    return selected
shared=[root/p for p in ['passenger_wsgi.py','requirements.txt','CPANEL.md','SECURITY_REVIEW.md','LICENSE']]
production=collect('dist',assets)+collect('python_backend',{'.py','.txt'})+collect('deploy',{'.py','.example'})+shared+[root/'server/meters.json']
source=collect('src',{'.ts','.tsx','.css','.png','.svg'})+collect('public',assets)+collect('scripts',{'.mjs','.py'})+collect('server',{'.js'})+collect('docs',{'.md','.svg','.png','.jpg','.pdf'})+collect('python_backend',{'.py','.txt'})+collect('deploy',{'.py','.example'})+shared
source += [root/p for p in ['.gitignore','package.json','package-lock.json','server/package.json','server/package-lock.json','server/.env.example','server/meters.example.json','index.html','vite.config.ts','tsconfig.json','tailwind.config.js','postcss.config.js','README.md','softwaredetails.md','START_HERE.md']]
for p in set(source+production):
    if not p.is_file():raise SystemExit('Required packaging file missing: '+str(p.relative_to(root)))
private=[m['sn'].encode() for m in json.loads((root/'server/meters.json').read_text())]
credentials=[]
if (root/'server/.env').exists():
    for line in (root/'server/.env').read_text().splitlines():
        key,sep,value=line.partition('=')
        if sep and key.strip() in ('MQTT_USERNAME','MQTT_PASSWORD') and value.strip():credentials.append(value.strip().strip('\"\'').encode())
for p in collect('dist',{'.js','.html','.json'}):
    if any(x in p.read_bytes() for x in private+credentials):raise SystemExit('Private value in public build; packaging stopped')
outputs=[]
for name,files,prefix,is_public in [
 ('GML_Developer_Complete.zip',source+collect('dist',assets)+[root/'server/meters.json'],'iGrid',False),
 ('gml-cpanel-v8.zip',production,'gml-console',False),
 ('GML_GitHub_Ready.zip',source,'iGrid',True),
]:
    target=root.parent/name
    with ZipFile(target,'w',ZIP_DEFLATED) as archive:
        for p in sorted(set(files)):
            rel=p.relative_to(root).as_posix();data=p.read_bytes()
            if any(x in data for x in credentials+(private if is_public else [])):
                raise SystemExit('Private credential/identifier match; packaging stopped')
            archive.writestr(prefix+'/'+rel,data)
    with ZipFile(target) as archive:
        names=archive.namelist()
        assert archive.testzip() is None
        assert not any('/node_modules/' in n or '/.runtime/' in n or '/server/data/' in n or n.endswith('/.env') or '.sqlite' in n for n in names)
        if is_public:assert prefix+'/server/meters.json' not in names
        if name!='gml-cpanel-v8.zip':
            assert prefix+'/src/lib/data/demo.ts' in names
            assert prefix+'/requirements.txt' in names
            assert prefix+'/docs/assets/grid-map-preview.svg' in names
        print(name+': '+str(len(names))+' files; validated')
    outputs.append(hashlib.sha256(target.read_bytes()).hexdigest()+'  '+name)
(root.parent/'GML_Release_SHA256.txt').write_text('\n'.join(outputs)+'\n')
print('Archive CRC, required-source and private-value checks passed.')
