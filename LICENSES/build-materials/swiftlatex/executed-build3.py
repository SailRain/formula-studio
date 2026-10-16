#!/usr/bin/env python3
"""Build the pinned engines and every historical prebuilt library from source.

Needs the unmodified Emscripten 3.1.4 SDK, CMake 3.x, make, Python 3, and the
retained LICENSES/sources archives. Outputs candidates, never replaces runtime.
"""
import argparse, concurrent.futures, hashlib, json, os, pathlib, re, shutil, subprocess, tarfile, time

ROOT = pathlib.Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output-dir', type=pathlib.Path, default=ROOT/'.qa/swiftlatex-rebuild')
parser.add_argument('--jobs', type=int, default=2)
args = parser.parse_args()
output = args.output_dir.resolve()
if not 1 <= args.jobs <= 16: parser.error('--jobs must be 1–16')
if output.exists(): parser.error('output directory must not exist; choose a new directory')
manifest = json.loads((ROOT/'LICENSES/source-manifest.json').read_text())
archives = {x['file']: x for x in manifest['sourceArchives']}
for program in ['emcc', 'em++', 'emar', 'emcmake', 'cmake', 'make']:
    if not shutil.which(program): parser.error('Missing '+program+'; activate the pinned build toolchain first')
emversion = subprocess.check_output(['emcc', '--version'], text=True)
if not re.search(r'\b3\.1\.4\b', emversion): parser.error('This recipe requires Emscripten 3.1.4')
output.mkdir(parents=True)
commands=[]
started=time.time()
def run(command, cwd=None):
    commands.append({'argv': [str(x).replace(str(output), '<build>') for x in command], 'cwd': str(cwd or output).replace(str(output), '<build>')})
    subprocess.run([str(x) for x in command], cwd=cwd or output, check=True)
def unpack(filename):
    entry=archives[filename]; p=ROOT/entry['path']; raw=p.read_bytes()
    if len(raw)!=entry['bytes'] or hashlib.sha256(raw).hexdigest()!=entry['sha256']: raise RuntimeError('Source integrity mismatch: '+filename)
    target=output/'source'/filename; target.mkdir(parents=True)
    with tarfile.open(p) as archive:
        for member in archive:
            destination=(target/member.name).resolve()
            if not destination.is_relative_to(target.resolve()): raise RuntimeError('Unsafe archive member')
            if member.issym() or member.islnk():
                link=(destination.parent/member.linkname).resolve() if member.issym() else (target/member.linkname).resolve()
                if not link.is_relative_to(target.resolve()): raise RuntimeError('Unsafe archive link')
        archive.extractall(target)
    children=[x for x in target.iterdir() if x.is_dir()]
    if len(children)!=1: raise RuntimeError('Unexpected source root: '+filename)
    return children[0]

# Emscripten 3.1.4 supports EM_PORTS. Populate its ordinary source cache
# from our pinned, retained full archives so the ports never require a network
# request. The original recipes and SHA-512 hashes are retained alongside them.
ports=output/'ports';ports.mkdir()
os.environ['EM_PORTS']=str(ports)
for port_name,filename in [('freetype','freetype-version_1.zip'),('icu','icu4c-68_2-src.zip'),('libpng','libpng-1.6.37.tar.gz'),('zlib','zlib-1.2.11.zip')]:
    entry=archives[filename];source=ROOT/entry['path'];raw=source.read_bytes()
    if len(raw)!=entry['bytes'] or hashlib.sha256(raw).hexdigest()!=entry['sha256'] or hashlib.sha512(raw).hexdigest()!=entry['sha512']:
        raise RuntimeError('Pinned Emscripten port integrity mismatch: '+filename)
    target=ports/port_name;target.mkdir()
    shutil.unpack_archive(str(source),str(target))
    (target/'.emscripten_url').write_text(entry['url']+'\n')

swift=unpack('swiftlatex-v20022022-source.tar.gz')
graphite=unpack('graphite2-1.3.14.tgz')
harfbuzz=unpack('harfbuzz-3.2.0.tar.xz')
# No historical .a enters the candidate build. Each library below is generated.
for p in swift.rglob('*.a'): p.unlink()
# The original Graphite library exports call_machine, so keep that VM type.
graphite_build=output/'graphite-build'
run(['emcmake','cmake','-S',graphite,'-B',graphite_build,'-DBUILD_SHARED_LIBS=OFF','-DCMAKE_BUILD_TYPE=Release','-DGRAPHITE2_VM_TYPE=call','-DGRAPHITE2_NTRACING=ON','-DGRAPHITE2_NFILEFACE=OFF'])
run(['cmake','--build',graphite_build,'--target','graphite2','--parallel',args.jobs])
graphite_lib=graphite_build/'src/libgraphite2.a'
shutil.copyfile(graphite_lib,swift/'xetex.wasm/graphite2/libgraphite2.a')

# Build the exact 3.2.0 sources using the source list and options in the retained
# unmodified Emscripten 3.1.4 HarfBuzz port recipe. USE_FREETYPE resolves the same
# pinned Emscripten port headers; no native host FreeType or fonts are linked.
# XeTeX additionally requires the Graphite backend, built from our pinned headers.
import runpy
port_recipe=ROOT/'LICENSES/build-materials/swiftlatex/emscripten-3.1.4-harfbuzz.py'
port=runpy.run_path(str(port_recipe))
if port['VERSION']!='3.2.0': raise RuntimeError('Unexpected HarfBuzz port recipe')
hb_build=output/'harfbuzz-build';hb_build.mkdir()
cflags=['-DHAVE_FREETYPE','-DHAVE_GRAPHITE2','-I'+str(graphite/'include'),'-DHAVE_ATEXIT','-DHAVE_FALLBACK','-DHAVE_FT_SET_VAR_BLEND_COORDINATES','-DHAVE_INTEL_ATOMIC_PRIMITIVES','-DHAVE_MMAP','-DHAVE_MPROTECT','-DHAVE_OT','-DHAVE_STRTOD_L','-DHAVE_SYSCONF','-DHAVE_UCDN','-DHAVE_UNIST_H','-DHAVE_XLOCALE_H','-DHAVE_SYS_MMAN_H','-DHAVE_UNISTD_H','-DHB_NO_MT','-fno-rtti','-fno-exceptions','-O3','-DNDEBUG','-sUSE_FREETYPE=1']
# Populate the pinned FreeType cache before parallel compilers use it.
probe=hb_build/'freetype-probe.c';probe.write_text('#include <ft2build.h>\n#include FT_FREETYPE_H\n')
run(['emcc','-c',probe,'-sUSE_FREETYPE=1','-o',hb_build/'freetype-probe.o'])
objects=[hb_build/(name+'.o') for name in port['srcs']]
def compile_hb(pair):
    source,obj=pair
    run(['em++','-c',harfbuzz/'src'/source,'-o',obj,*cflags])
with concurrent.futures.ThreadPoolExecutor(max_workers=args.jobs) as pool:
    list(pool.map(compile_hb,zip(port['srcs'],objects)))
run(['emar','rcs',swift/'xetex.wasm/harfbuzz/libharfbuzz.a',*objects])

# The tag includes complete Xpdf 4.02 implementation sources in pdftex.wasm.
# XeTeX's header subset is identical except these three documented headers.
# Overlay its actual headers onto those implementation sources before compiling.
xpdf=swift/'pdftex.wasm/xpdf'
for name in ['aconf.h','xpdf/GlobalParams.h','xpdf/config.h']:
    shutil.copyfile(swift/'xetex.wasm/xpdf'/name,xpdf/name)
run(['make','-C',xpdf,'-j'+str(args.jobs),'xpdflib','DEBUGFLAGS=-O3 -flto=thin'])
shutil.copyfile(xpdf/'xpdf.a',swift/'xetex.wasm/xpdf/xpdf.a')
run(['make','-C',swift/'xetex.wasm','-j'+str(args.jobs)])
run(['make','-C',swift/'dvipdfm.wasm','-j'+str(args.jobs)])

artifacts=output/'artifacts';artifacts.mkdir()
files=[]
for engine,directory in [('xetex','xetex.wasm'),('dvipdfm','dvipdfm.wasm')]:
    for suffix in ['js','wasm']:
        name='swiftlatex'+engine+'.'+suffix
        dest=artifacts/name;shutil.copyfile(swift/directory/name,dest)
        raw=dest.read_bytes();files.append({'file':name,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()})
libraries=[]
for name in ['harfbuzz/libharfbuzz.a','graphite2/libgraphite2.a','xpdf/xpdf.a']:
    p=swift/'xetex.wasm'/name;raw=p.read_bytes();libraries.append({'file':name,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()})
report={'recipe':'scripts/rebuild-swiftlatex.py','sourceVersion':'v20022022','emscriptenVersion':emversion.strip(),'cmakeVersion':subprocess.check_output(['cmake','--version'],text=True).splitlines()[0],'elapsedSeconds':round(time.time()-started,2),'sourceArchives':[archives[n] for n in ['swiftlatex-v20022022-source.tar.gz','graphite2-1.3.14.tgz','harfbuzz-3.2.0.tar.xz']],'libraries':libraries,'artifacts':files,'commands':commands,'outputRegressionPassed':False,'note':'Candidate engines are not promoted to runtime by this script. Run the formula baseline and retain its evidence before marking the release gate ready.'}
(output/'build-report.json').write_text(json.dumps(report,indent=2)+'\n')
print('Candidate build complete:',artifacts)
