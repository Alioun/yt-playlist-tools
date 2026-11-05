import argparse, datetime, difflib, hashlib, importlib.util, json, re, shutil, stat, subprocess, sys, tarfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
EVIDENCE = HERE/'evidence'
SUFFIX = '.source'
START = '2026-10-30T01:02:06+00:00'
DEADLINE = datetime.datetime.fromisoformat('2026-10-30T01:37:06+00:00')
spec = importlib.util.spec_from_file_location('static_source', HERE/'static-source.py')
assert spec and spec.loader
helper = importlib.util.module_from_spec(spec); spec.loader.exec_module(helper)
identity, tree, write_json = helper.identity, helper.tree, helper.write_json

def now(): return datetime.datetime.now(datetime.timezone.utc)
def mode(path): return '100755' if path.stat().st_mode & stat.S_IXUSR else '100644'
def safe(path):
    assert not path.is_symlink(), str(path)
    return path.read_bytes()
def verify(root, entries, suffix=''):
    for path, expected in entries.items():
        if expected.get('identityOnly'): continue
        physical=root/(path+suffix)
        assert identity(safe(physical), mode(physical)) == expected, str(physical)
    expected={path+suffix for path,item in entries.items() if not item.get('identityOnly')}
    actual={str(path.relative_to(root)) for path in root.rglob('*') if path.is_file()}
    assert actual==expected, (sorted(actual-expected), sorted(expected-actual))
    return len(expected)
def archive(target, root, entries, suffix):
    with tarfile.open(target, 'w') as output:
        for path, item in sorted(entries.items()):
            if item.get('identityOnly'): continue
            physical=root/(path+suffix)
            info=tarfile.TarInfo(path); info.mode=int(item['mode'][-3:],8); info.size=item['bytes']; info.mtime=0
            with physical.open('rb') as stream: output.addfile(info,stream)
def static_checks(before, after, fence, changes):
    allowed=set(fence['existingCode']+fence['existingMetadata'])
    assert all(path in allowed or path.startswith(fence['allowedNewPrefix']) for path in changes)
    assert len([p for p in changes if p in fence['existingCode']])==7
    originals={}
    negatives=[]; controls=[]
    for folder in ['ui-read-playlist-bridge','ui-playlist-progressive']:
        path=f'tools/fixtures/{folder}/gates.json'
        original=json.loads((EVIDENCE/'input'/(path+SUFFIX)).read_text())
        current=json.loads((ROOT/path).read_text())
        old={g['id']:g for g in original['gates']}; new={g['id']:g for g in current['gates']}
        assert old.keys()<=new.keys()
        for key, gate in old.items():
            a={k:v for k,v in gate.items() if k not in ('annotationLine','intendedLine')}
            b={k:v for k,v in new[key].items() if k not in ('annotationLine','intendedLine')}
            assert a==b,(path,key)
        originals[folder]=len(old)
        for gate in current['gates']:
            if gate['category']=='intended-line-negative': negatives.append(gate)
        path=f'tools/fixtures/{folder}/controls.json'
        assert (EVIDENCE/'input'/(path+SUFFIX)).read_bytes()==(ROOT/path).read_bytes()
        controls.extend(json.loads((ROOT/path).read_text())['controls'])
    negatives.extend(g for g in json.loads((HERE/'gates.json').read_text())['gates'] if g['category']=='intended-line-negative')
    for gate in negatives:
        lines=(ROOT/gate['path']).read_text().splitlines()
        assert gate['annotation'] in lines[gate['annotationLine']-1],gate['id']
        assert gate['intendedLine']==gate['annotationLine']+1
        assert '@ts-expect-error' not in lines[gate['intendedLine']-1]
    for control in controls:
        text=(ROOT/control['path']).read_text()
        for replacement in control['replacements']:
            assert text.count(replacement['before'])==1,control['id']
            text=text.replace(replacement['before'],replacement['after'],1)
    native=before['changedPaths']
    assert len(native)==15
    for path in native: assert before['entries'][path]==after['entries'][path],path
    cache=set()
    for overlay in before['overlays']:
        if 'playlists-cache-qualified-returned' in overlay['sourceRoot']: cache.update(overlay['paths'])
    assert len(cache)==19
    for path in cache: assert before['entries'][path]==after['entries'][path],path
    proof_path='src/ui/backend/backend.type-test.ts'
    current_proof=(ROOT/proof_path).read_text()
    for side in ['acceptedSource','authoredSource']:
        original_proof=Path(fence['conflicts'][proof_path][side]).read_text()
        assert set(re.findall(r'@ts-expect-error negative: ([^.]+)',original_proof)) <= set(re.findall(r'@ts-expect-error negative: ([^.]+)',current_proof))
    for path in ['src/background/router/first-run.ts','src/shared/contracts/first-run.ts']:
        accepted=Path(fence['conflicts'][path]['acceptedSource']).read_text()
        assert (ROOT/path).read_text()==accepted.replace('UiMessages','FirstRunMessages')
    core=(ROOT/'src/ui/backend/core.ts').read_text()
    authored=Path(fence['conflicts']['src/ui/backend/core.ts']['authoredSource']).read_text()
    start='  function creation(';end='  function playlistList('
    assert core[core.index(start):core.index(end)]==authored[authored.index(start):authored.index(end)]
    assert core.count('createRpcCaller<UiMessages>')==1
    assert 'contract: uiContract' in core
    router=(ROOT/'src/background/router/ui-playlists/index.ts').read_text()
    assert 'return firstRun.receiver.handlers["ui.change"](payload, context.ui)' in router
    assert 'firstRun.dispose(); unhandle(); rpc.dispose()' in router
    harness=(ROOT/'tools/fixtures/first-run-backend/harness.ts').read_text()
    assert 'createStartingLocalFilterWriter' in harness and 'createUiRouter({' in harness
    assert 'createTabs({' in harness and 'createPlaylists({' in harness
    assert 'rpc.handle(' not in harness and 'createFirstRunReceiver({' not in harness
    for proposal in json.loads((HERE/'protected-repairs.json').read_text())['repairs']:
        assert hashlib.sha256((ROOT/proposal['path']).read_bytes()).hexdigest()==proposal['beforeSha256']
        assert hashlib.sha256((ROOT/proposal['proposedSource']).read_bytes()).hexdigest()==proposal['afterSha256']
    return dict(kind='static-source-checks-only', originalGateCounts=originals, uniqueOriginalControls=len({v['id'] for v in controls}),
        uniqueIntendedLineNegatives=len({(v['path'],v['annotationLine']) for v in negatives}),
        native891PathsPreserved=15, cachePathsPreserved=19, acceptedAutoAddReceiverAndGuardsPreserved=True,
        authoredCreationFunctionUnchanged=True, allAcceptedAndAuthoredBackendNegativeLabelsRetained=True, singleBackendCaller=True, fullRouterDelegatesAutoAddToFirstRun=True,
        protectedProposalsUnapplied=3, runtimeExecuted=False)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--output',required=True);args=parser.parse_args()
    out=Path(args.output).resolve();assert out.is_relative_to(EVIDENCE.resolve())
    assert now()<DEADLINE
    assert shutil.disk_usage(ROOT).free>=2*1024**3
    out.mkdir(exist_ok=False,parents=True)
    before=json.loads((EVIDENCE/'input-manifest.json').read_text())
    fence=json.loads((EVIDENCE/'fence.json').read_text())
    assert tree(before['entries'])==before['sourceTree']=='8ecd30d88a56b8945b0b360d4c900e5aae8e1af7'
    baseline=EVIDENCE/'input'
    for path,item in before['entries'].items():
        if item.get('identityOnly'): continue
        plain=baseline/path; stored=baseline/(path+SUFFIX)
        if plain.exists():
            assert not stored.exists(); plain.rename(stored)
    assert verify(baseline,before['entries'],SUFFIX)==925
    entries=dict(before['entries'])
    for path,item in entries.copy().items():
        if not item.get('identityOnly'): entries[path]=identity(safe(ROOT/path),mode(ROOT/path))
    for path in HERE.rglob('*'):
        if not path.is_file() or path.is_relative_to(EVIDENCE): continue
        relative=str(path.relative_to(ROOT))
        assert not any(part.startswith('.env') for part in path.relative_to(ROOT).parts)
        assert path.suffix!='.pyc'
        entries[relative]=identity(safe(path),mode(path))
    changes={path:{'before':before['entries'].get(path),'after':item} for path,item in entries.items() if item!=before['entries'].get(path)}
    after=dict(sourceTree=tree(entries), inputTree=before['sourceTree'], state='authored-unexecuted-protected-repairs-pending', entries=entries)
    checks=static_checks(before,after,fence,changes)
    write_json(out/'manifest.json',after);write_json(out/'changes.json',changes)
    write_json(out/'input-manifest.json',before);write_json(out/'fence.json',fence);write_json(out/'static-check.json',checks)
    source=out/'source';source.mkdir()
    for path,item in entries.items():
        if item.get('identityOnly'): continue
        target=source/(path+SUFFIX);target.parent.mkdir(parents=True,exist_ok=True)
        target.write_bytes(safe(ROOT/path));target.chmod(int(item['mode'][-3:],8))
    count=verify(source,entries,SUFFIX)
    patches=[];modes=[]
    for path,change in sorted(changes.items()):
        old=(baseline/(path+SUFFIX)).read_bytes() if change['before'] else b''
        new=(source/(path+SUFFIX)).read_bytes()
        assert old.endswith(b'\n') or not old, path
        assert new.endswith(b'\n'),path
        patches.extend(difflib.unified_diff(old.decode().splitlines(True),new.decode().splitlines(True),
            fromfile='a/'+path if change['before'] else '/dev/null',tofile='b/'+path,n=3))
        modes.append(dict(path=path,before=change['before']['mode'] if change['before'] else None,after=change['after']['mode']))
    (out/'candidate.patch').write_text(''.join(patches));write_json(out/'mode-operations.json',modes)
    replay=out/'replay';replay.mkdir()
    for path,item in before['entries'].items():
        if item.get('identityOnly'): continue
        target=replay/path;target.parent.mkdir(parents=True,exist_ok=True)
        shutil.copyfile(baseline/(path+SUFFIX),target);target.chmod(int(item['mode'][-3:],8))
    command=['/usr/bin/timeout','-k','10','120','/usr/bin/patch','-p1','--batch','--forward','--fuzz=0','-i',str(out/'candidate.patch')]
    result=subprocess.run(command,cwd=replay,stdin=subprocess.DEVNULL,capture_output=True,
        env={'PATH':'/usr/bin:/bin','LC_ALL':'C'},timeout=135,check=False)
    (out/'replay.stdout').write_bytes(result.stdout);(out/'replay.stderr').write_bytes(result.stderr)
    assert result.returncode==0,(result.returncode,result.stderr.decode())
    assert b'fuzz' not in result.stdout.lower() and b'offset' not in result.stdout.lower()
    for operation in modes: (replay/operation['path']).chmod(int(operation['after'][-3:],8))
    assert verify(replay,entries)==count
    write_json(out/'replay.json',dict(at=now().isoformat(),command=command,exit=result.returncode,inputFiles=925,
        candidateFiles=count,completeBytesModesHashesAndBlobs=True,zeroFuzz=True,offsets=0,modeOperations=len(modes),
        virtualTree=after['sourceTree'],runtimeExecuted=False))
    archive(out/'input.tar',baseline,before['entries'],SUFFIX)
    archive(out/'candidate.tar',source,entries,SUFFIX)
    archive(out/'replay.tar',replay,entries,'')
    for path,item in entries.items():
        if item.get('identityOnly'): continue
        (replay/path).rename(replay/(path+SUFFIX))
    assert verify(replay,entries,SUFFIX)==count
    unchanged={path:item for path,item in entries.items() if item==before['entries'].get(path) and not item.get('identityOnly')}
    package=json.loads((ROOT/'package.json').read_text())
    dependency_paths=[p for p in before['entries'] if Path(p).name in ['package.json','bun.lock','bun.lockb','package-lock.json','pnpm-lock.yaml']]
    static_tools={}
    for name,path in [('python',Path(sys.executable)),('patch',Path('/usr/bin/patch')),('timeout',Path('/usr/bin/timeout'))]:
        with path.open('rb') as stream: digest=hashlib.file_digest(stream,'sha256').hexdigest()
        static_tools[name]=dict(path=str(path),sha256=digest,bytes=path.stat().st_size,mode=mode(path))
    write_json(out/'dependencies.json',dict(staticTools=static_tools,pythonVersion=sys.version,unchangedSourceDependencies=unchanged,
        packageAndLocks={p:entries[p] for p in dependency_paths},packageManager=package.get('packageManager'),
        declaredVersions={k:v for section in ['dependencies','devDependencies'] for k,v in package.get(section,{}).items() if k in ['@typescript/native','typescript','svelte','svelte-check','@types/bun']},
        preparedRuntime='Not supplied. No executable or dependency installation was inspected or run.',
        preservedNative891={p:entries[p] for p in before['changedPaths']},qualifiedNativeAcceptedTree='38db3e9072710fc14ae4a35ab0abd5460b1654c4'))
    write_json(out/'source-storage.json',dict(suffix=SUFFIX,logicalInventory='manifest.json',source='source',replay='replay',input='../input',
        archives=['input.tar','candidate.tar','replay.tar'],environment='identity-only-unopened-uninstalled',
        physicalSourceInventory=sorted(str(p.relative_to(source)) for p in source.rglob('*') if p.is_file()),
        physicalReplayInventory=sorted(str(p.relative_to(replay)) for p in replay.rglob('*') if p.is_file())))
    write_json(out/'unexecuted-gates.json',dict(status='unexecuted',lease='none',inventories={
        p:json.loads((ROOT/p).read_text()) for p in ['tools/fixtures/ui-owner-reconciliation/gates.json','tools/fixtures/ui-playlist-progressive/gates.json','tools/fixtures/ui-read-playlist-bridge/gates.json']},
        blockers=json.loads((HERE/'protected-repairs.json').read_text()),
        requiredNext='Reconcile unapplied protected repairs and subsequently accepted native/publication source, seal exact resulting tree, obtain sole runtime lease and prepared runtime identity inventory before any gate.'))
    hashes={str(p.relative_to(out)):dict(sha256=hashlib.sha256(p.read_bytes()).hexdigest(),bytes=p.stat().st_size) for p in out.iterdir() if p.is_file()}
    write_json(out/'artifact-identities.json',hashes)
    write_json(out/'seal.json',dict(at=now().isoformat(),firstToolCall=START,deadline=DEADLINE.isoformat(),
        elapsedSeconds=(now()-datetime.datetime.fromisoformat(START)).total_seconds(),sourceTree=after['sourceTree'],inputTree=before['sourceTree'],
        sourceFiles=count,identityOnlySkipped=1,changedPaths=len(changes),existingCodeChanges=7,
        newSourcePaths=len(changes)-7,freeBytes=shutil.disk_usage(ROOT).free,
        manifestSha256=hashes['manifest.json']['sha256'],patchSha256=hashes['candidate.patch']['sha256'],
        storageSuffix=SUFFIX,actualReplay=True,independentRehash='pending separate process',runtimeExecuted=False,
        review='not requested',state='authoring-only-unqualified-protected-repairs-pending'))
    assert now()<DEADLINE
    print(json.dumps(dict(output=str(out),tree=after['sourceTree'],files=count,changes=len(changes),checks=checks)))

if __name__=='__main__': main()
