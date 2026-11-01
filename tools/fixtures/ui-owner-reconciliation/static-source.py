import hashlib, json, os, shutil, stat, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
AUDIT = ROOT / '.audit/2.0-build-20261029'
EVIDENCE = HERE / 'evidence'
MANIFEST = AUDIT / 'ui-qualified891-reconciliation-input-manifest.json'
def identity(data, mode):
    return dict(mode=mode, bytes=len(data), sha256=hashlib.sha256(data).hexdigest(), gitBlob=hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest())
def tree(entries):
    root = {}
    for path, item in entries.items():
        node = root
        parts = path.split('/')
        for part in parts[:-1]: node = node.setdefault(part, {})
        node[parts[-1]] = item
    def digest(node):
        records = []
        for name, item in node.items():
            directory = 'gitBlob' not in item
            mode, oid = ('40000', digest(item)) if directory else (item['mode'], item['gitBlob'])
            records.append((name.encode()+ (b'/' if directory else b''), mode.encode()+b' '+name.encode()+b'\0'+bytes.fromhex(oid)))
        raw = b''.join(v for k,v in sorted(records))
        return hashlib.sha1(b'tree '+str(len(raw)).encode()+b'\0'+raw).hexdigest()
    return digest(root)
def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2)+'\n')
def install():
    if (EVIDENCE/'installation.json').exists(): raise SystemExit('Input is already installed. Replay the sealed patch in a fresh permitted directory.')
    d = json.loads(MANIFEST.read_text())
    assert tree(d['entries']) == d['sourceTree']
    EVIDENCE.mkdir(exist_ok=True)
    shutil.copyfile(MANIFEST, EVIDENCE/'input-manifest.json')
    fence = json.loads((AUDIT/'ui-qualified878-reconciliation-fence.json').read_text())
    shutil.copyfile(AUDIT/'ui-qualified878-reconciliation-fence.json', EVIDENCE/'fence.json')
    count = 0
    for path, item in d['entries'].items():
        if item.get('identityOnly'): continue
        assert not any(part.startswith('.env') for part in Path(path).parts)
        origin = Path(d['baseSourceRoot'])
        for overlay in d.get('overlays', []):
            if path in overlay['paths']: origin = Path(overlay['sourceRoot'])
        source = origin/path
        data = source.read_bytes()
        mode = '100755' if source.stat().st_mode & stat.S_IXUSR else '100644'
        assert identity(data, mode) == item, path
        for target in (ROOT/path, EVIDENCE/'input'/path):
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data); target.chmod(int(mode[-3:], 8))
        count += 1
    for path, spec in fence['conflicts'].items():
        for source_key, expected_key in [('acceptedSource','left'),('authoredSource','right'),('commonSource','baseline')]:
            source = Path(spec[source_key]); data=source.read_bytes()
            mode = '100755' if source.stat().st_mode & stat.S_IXUSR else '100644'
            assert identity(data, mode) == spec[expected_key], (path, source_key)
    write_json(EVIDENCE/'installation.json', dict(tree=d['sourceTree'], physicalFiles=count, identityOnlySkipped=1, threeWayInputsVerified=21, runtimeExecuted=False))
    print(json.dumps(dict(installed=count, tree=d['sourceTree'], freeBytes=shutil.disk_usage(ROOT).free)))
if __name__ == '__main__':
    assert shutil.disk_usage(ROOT).free >= 2*1024**3
    if sys.argv[1:] == ['install']: install()
