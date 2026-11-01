import argparse, datetime, hashlib, json, shutil, stat, tarfile
from pathlib import Path

def hashed(stream, length, mode):
    sha=hashlib.sha256();blob=hashlib.sha1();blob.update(('blob '+str(length)+'\0').encode())
    count=0
    while True:
        part=stream.read(65536)
        if not part: break
        count+=len(part);sha.update(part);blob.update(part)
    assert count==length
    return {'mode':mode,'bytes':count,'sha256':sha.hexdigest(),'gitBlob':blob.hexdigest()}

def virtual(entries):
    directories={''}
    files={}
    for name,item in entries.items():
        parts=name.split('/')
        for i in range(1,len(parts)): directories.add('/'.join(parts[:i]))
        parent='/'.join(parts[:-1]);files.setdefault(parent,[]).append((parts[-1],item['mode'],item['gitBlob'],False))
    computed={}
    for directory in sorted(directories,key=lambda d:len(d.split('/')) if d else 0,reverse=True):
        children=list(files.get(directory,[]))
        for child,oid in computed.items():
            parent,_,leaf=child.rpartition('/')
            if parent==directory: children.append((leaf,'40000',oid,True))
        raw=b''.join(mode.encode()+b' '+name.encode()+b'\0'+bytes.fromhex(oid)
            for name,mode,oid,isdir in sorted(children,key=lambda t:(t[0]+('/' if t[3] else '')).encode()))
        computed[directory]=hashlib.sha1(('tree '+str(len(raw))+'\0').encode()+raw).hexdigest()
    return computed['']

def check_directory(root, expected, suffix):
    observed={};physical=set()
    for name,item in expected.items():
        if item.get('identityOnly'):
            observed[name]=item;continue
        path=root/(name+suffix);assert path.is_file() and not path.is_symlink(),str(path)
        mode='100755' if stat.S_IMODE(path.stat().st_mode)&0o100 else '100644'
        with path.open('rb') as stream: value=hashed(stream,path.stat().st_size,mode)
        assert value==item,name;observed[name]=value;physical.add(name+suffix)
    actual={str(p.relative_to(root)) for p in root.rglob('*') if p.is_file()}
    assert physical==actual
    return observed

def check_archive(path, expected):
    physical={name for name,item in expected.items() if not item.get('identityOnly')};observed={};seen=set()
    with tarfile.open(path,'r:') as archive:
        for member in archive:
            assert member.isfile() and member.name in physical and member.name not in seen,member.name
            assert not any(part.startswith('.env') for part in Path(member.name).parts)
            stream=archive.extractfile(member);assert stream
            value=hashed(stream,member.size,'100755' if member.mode&0o100 else '100644')
            assert value==expected[member.name],member.name
            observed[member.name]=value;seen.add(member.name)
    assert seen==physical
    observed.update({name:item for name,item in expected.items() if item.get('identityOnly')})
    return observed

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--seal',type=Path,required=True);args=parser.parse_args()
    folder=args.seal.resolve();root=Path(__file__).resolve().parents[3]
    manifest=json.loads((folder/'manifest.json').read_text());before=json.loads((folder/'input-manifest.json').read_text())
    entries=manifest['entries'];checks={}
    for label,location in [('source',folder/'source'),('replay',folder/'replay')]:
        observed=check_directory(location,entries,'.source')
        checks[label]=virtual(observed);assert checks[label]==manifest['sourceTree']
    for name in ['candidate.tar','replay.tar']:
        observed=check_archive(folder/name,entries);checks[name]=virtual(observed);assert checks[name]==manifest['sourceTree']
    observed=check_archive(folder/'input.tar',before['entries']);checks['input.tar']=virtual(observed)
    assert checks['input.tar']==before['sourceTree']=='8ecd30d88a56b8945b0b360d4c900e5aae8e1af7'
    checkout_count=0
    for name,item in entries.items():
        if item.get('identityOnly'):continue
        path=root/name;assert path.is_file() and not path.is_symlink()
        with path.open('rb') as stream: actual=hashed(stream,path.stat().st_size,'100755' if path.stat().st_mode&stat.S_IXUSR else '100644')
        assert actual==item,name;checkout_count+=1
    artifacts=json.loads((folder/'artifact-identities.json').read_text())
    for name,item in artifacts.items():
        path=folder/name
        with path.open('rb') as stream:
            sha=hashlib.file_digest(stream,'sha256').hexdigest()
        assert path.stat().st_size==item['bytes'] and sha==item['sha256'],name
    seal=json.loads((folder/'seal.json').read_text())
    assert hashlib.sha256((folder/'manifest.json').read_bytes()).hexdigest()==seal['manifestSha256']
    assert hashlib.sha256((folder/'candidate.patch').read_bytes()).hexdigest()==seal['patchSha256']
    record={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'kind':'separate-process-independent-streaming-implementation',
        'sourceTree':manifest['sourceTree'],'observedTrees':checks,'sourceAndReplayPhysicalInventoryExact':True,
        'sourceFiles':checkout_count,'checkoutClaim':'Only every manifested source path was checked. No complete checkout inventory is claimed.',
        'artifactIdentitiesChecked':len(artifacts),'identityOnlySkipped':1,'runtimeExecuted':False,
        'authorship':'Same implementation worker. Separate process and algorithm, no independent reviewer or runtime witness.',
        'freeBytes':shutil.disk_usage(root).free}
    (folder/'independent-rehash.json').write_text(json.dumps(record,indent=2)+'\n')
    print(json.dumps(record))

if __name__=='__main__':main()
