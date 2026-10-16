#!/usr/bin/env python3
"""Verify retained upstream sources and package this exact application source.

No install or extraction of third-party code is performed. Downloading missing
archives is explicit; existing files must always pass their pinned hashes.
"""
import argparse, gzip, hashlib, io, json, pathlib, tarfile, urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--download-missing',action='store_true')
parser.add_argument('--application-output',type=pathlib.Path)
args=parser.parse_args()
manifest=json.loads((ROOT/'LICENSES/source-manifest.json').read_text())
def derive_source_archive(raw,derivation):
    if derivation['recipe']!='drop-prebuilt-object-files-v1':
        raise SystemExit('Unknown source derivation recipe')
    removed={x['name']:x for x in derivation['removedMembers']}
    destination=io.BytesIO()
    found=set()
    with tarfile.open(fileobj=io.BytesIO(raw),mode='r:*') as source:
        with gzip.GzipFile(filename='',mode='wb',fileobj=destination,mtime=0) as compressed:
            with tarfile.open(fileobj=compressed,mode='w') as archive:
                for member in source:
                    data=source.extractfile(member).read() if member.isfile() else None
                    if member.name in removed:
                        entry=removed[member.name]
                        if data is None or len(data)!=entry['bytes'] or hashlib.sha256(data).hexdigest()!=entry['sha256']:
                            raise SystemExit('Unexpected prebuilt archive member: '+member.name)
                        found.add(member.name)
                        continue
                    archive.addfile(member,io.BytesIO(data) if data is not None else None)
    if found!=set(removed):raise SystemExit('Source derivation member set changed')
    return destination.getvalue()

for entry in manifest['sourceArchives']:
    target=ROOT/entry['path']
    if not target.exists() and args.download_missing:
        target.parent.mkdir(parents=True,exist_ok=True)
        upstream=entry.get('upstreamArchive',entry)
        raw=urllib.request.urlopen(upstream['url'],timeout=120).read()
        if len(raw)!=upstream['bytes'] or hashlib.sha256(raw).hexdigest()!=upstream['sha256']:
            raise SystemExit('Downloaded upstream source integrity mismatch: '+entry['file'])
        if 'derivation' in entry:raw=derive_source_archive(raw,entry['derivation'])
        if len(raw)!=entry['bytes'] or hashlib.sha256(raw).hexdigest()!=entry['sha256']:
            raise SystemExit('Downloaded source integrity mismatch: '+entry['file'])
        target.write_bytes(raw)
    raw=target.read_bytes()
    if len(raw)!=entry['bytes'] or hashlib.sha256(raw).hexdigest()!=entry['sha256']:
        raise SystemExit('Retained source integrity mismatch: '+entry['file'])
print('Verified',len(manifest['sourceArchives']),'retained source archives')
if args.application_output:
    destination=args.application_output.resolve()
    destination.parent.mkdir(parents=True,exist_ok=True)
    roots=['src','core','runtime','scripts','tests','.github','LICENSES']
    names=['LICENSE','THIRD_PARTY_NOTICES.md','README.md','README.zh-CN.md','.gitignore','.gitattributes','package.json','package-lock.json']
    files=set()
    for root in roots:
        p=ROOT/root
        if p.exists(): files.update(x for x in p.rglob('*') if x.is_file() and not x.is_symlink())
    files.update(ROOT/n for n in names if (ROOT/n).is_file())
    # Upstream sources are separately offered next to this application archive.
    files={p for p in files if not p.relative_to(ROOT).parts[:2]==('LICENSES','sources') and not any(x.startswith('._') or x in ['.DS_Store','__pycache__'] for x in p.relative_to(ROOT).parts)}
    with destination.open('wb') as output:
        with gzip.GzipFile(filename='',mode='wb',fileobj=output,mtime=0) as compressed:
            with tarfile.open(fileobj=compressed,mode='w') as archive:
                for p in sorted(files):
                    raw=p.read_bytes();info=tarfile.TarInfo('formula-studio/'+str(p.relative_to(ROOT)))
                    info.size=len(raw);info.mtime=0;info.uid=0;info.gid=0;info.uname='';info.gname='';info.mode=0o644
                    archive.addfile(info,io.BytesIO(raw))
    raw=destination.read_bytes()
    report={'file':destination.name,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'applicationFiles':len(files),'upstreamSources':'../licenses/source-manifest.json','privateInputsIncluded':False}
    destination.with_name('application-source.json').write_text(json.dumps(report,indent=2)+'\n')
    print('Packaged application source:',destination)
