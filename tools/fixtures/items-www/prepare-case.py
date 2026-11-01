"""Unexecuted future static mutation tool. It executes no product or compiler code."""
import argparse
import hashlib
import json
from pathlib import Path
import stat

parser = argparse.ArgumentParser()
parser.add_argument('campaign', choices=['types', 'controls'])
parser.add_argument('case')
parser.add_argument('action', choices=['apply', 'restore'])
parser.add_argument('--candidate', type=Path, required=True)
parser.add_argument('--receipt', type=Path, required=True)
args = parser.parse_args()
root = args.candidate.resolve()
receipt = args.receipt.resolve()
assert root.name == 'runtime', 'Only a separately prepared disposable runtime copy is mutable'
assert not receipt.is_relative_to(root), 'Keep restoration evidence outside the candidate'
fixture = root/'tools/fixtures/items-www'
inventory = json.loads((fixture/('controls.json' if args.campaign == 'controls' else 'type-probes.json')).read_text())
cases = inventory['controls' if args.campaign == 'controls' else 'probes']
case = next(case for case in cases if case['name'] == args.case)
path = root/case['path']
assert path.is_file() and not path.is_symlink() and path.resolve().is_relative_to(root)

if args.action == 'apply':
    assert not receipt.exists(), 'Preserve previous evidence'
    receipt.mkdir(parents=True)
    original = path.read_bytes()
    mode = stat.S_IMODE(path.stat().st_mode)
    (receipt/'original').write_bytes(original)
    (receipt/'original.json').write_text(json.dumps({'path':case['path'], 'mode':mode,
        'bytes':len(original), 'sha256':hashlib.sha256(original).hexdigest()}, indent=2)+'\n')
    changed = original.decode()
    if args.campaign == 'controls':
        assert hashlib.sha256(original).hexdigest() == case['sourceIdentity']['sha256']
        for edit in case['edits']:
            assert changed.count(edit['before']) == 1
            changed = changed.replace(edit['before'], edit['after'], 1)
    else:
        lines = changed.splitlines(keepends=True)
        assert '@ts-expect-error '+case['name'] in lines[case['directiveLine']-1]
        assert lines[case['errorLine']-1].rstrip('\n') == case['statement']
        lines[case['directiveLine']-1] = '\n'
        changed = ''.join(lines)
    path.write_text(changed)
    path.chmod(mode)
    (receipt/'prepared.json').write_text(json.dumps({'case':args.case, 'campaign':args.campaign,
        'status':'prepared only; compiler and behavior unexecuted',
        'changedSha256':hashlib.sha256(path.read_bytes()).hexdigest()},indent=2)+'\n')
else:
    original = (receipt/'original').read_bytes()
    record = json.loads((receipt/'original.json').read_text())
    assert record['path'] == case['path'] and hashlib.sha256(original).hexdigest() == record['sha256']
    prepared = json.loads((receipt/'prepared.json').read_text())
    assert hashlib.sha256(path.read_bytes()).hexdigest() == prepared['changedSha256'], 'Preserve unexpected intervening changes'
    path.write_bytes(original)
    path.chmod(record['mode'])
    assert path.read_bytes() == original and stat.S_IMODE(path.stat().st_mode) == record['mode']
    (receipt/'restored.json').write_text(json.dumps({'case':args.case, 'exactByteAndModeRestoration':True,
        'sha256':record['sha256'], 'mode':record['mode']},indent=2)+'\n')
print(json.dumps({'case':args.case,'action':args.action,'runtimeExecuted':False}))
