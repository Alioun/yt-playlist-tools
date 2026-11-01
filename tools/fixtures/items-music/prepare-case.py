import argparse
import hashlib
import json
from pathlib import Path
import stat

parser = argparse.ArgumentParser()
parser.add_argument('kind', choices=['controls', 'types'])
parser.add_argument('name')
parser.add_argument('action', choices=['apply', 'restore'])
parser.add_argument('--candidate', required=True)
parser.add_argument('--receipt', required=True)
parser.add_argument('--inventory')
args = parser.parse_args()
root = Path(args.candidate).resolve()
sealed_source = Path('/Users/alioun/.t3/worktrees/yt-playlist-tools/t3-0755f498')
if root == sealed_source or root.name != 'runtime':
    raise SystemExit('A separate disposable runtime candidate is required')
inventory = Path(__file__).parent / ('controls.json' if args.kind == 'controls' else 'type-probes.json')
if args.inventory:
    inventory = Path(args.inventory)
cases = json.loads(inventory.read_text())['controls' if args.kind == 'controls' else 'probes']
case = next(case for case in cases if case['name'] == args.name)
target = (root / case['path']).resolve()
if root not in target.parents:
    raise SystemExit('Case path is outside the disposable candidate')
receipt = Path(args.receipt).resolve()
receipt.mkdir(parents=True, exist_ok=True)
backup = receipt / 'before.bytes'
mode_record = receipt / 'before.mode'
if args.action == 'apply':
    data = target.read_bytes()
    mode = target.stat().st_mode
    expected = case['sourceIdentity']
    actual_mode = '100755' if mode & stat.S_IXUSR else '100644'
    if hashlib.sha256(data).hexdigest() != expected['sha256'] or actual_mode != expected['mode']:
        raise SystemExit('Case source bytes or mode differ from the sealed candidate')
    if backup.exists():
        raise SystemExit('Case backup already exists')
    backup.write_bytes(data)
    mode_record.write_text(str(stat.S_IMODE(mode)))
    text = data.decode()
    if args.kind == 'types':
        lines = text.splitlines(keepends=True)
        line = case['directiveLine'] - 1
        if lines[line].strip() != '// @ts-expect-error ' + case.get('directiveName', args.name):
            raise SystemExit('Intended-line directive moved')
        lines[line] = '\n'
        text = ''.join(lines)
    else:
        for edit in case['edits']:
            if text.count(edit['before']) != 1:
                raise SystemExit('Mutation anchor is not unique')
            text = text.replace(edit['before'], edit['after'], 1)
    target.write_bytes(text.encode())
    target.chmod(int(mode_record.read_text()))
else:
    target.write_bytes(backup.read_bytes())
    target.chmod(int(mode_record.read_text()))
    expected = case['sourceIdentity']
    if hashlib.sha256(target.read_bytes()).hexdigest() != expected['sha256']:
        raise SystemExit('Exact restoration failed')
    actual_mode = '100755' if target.stat().st_mode & stat.S_IXUSR else '100644'
    if actual_mode != expected['mode']:
        raise SystemExit('Mode restoration failed')
print(json.dumps(dict(kind=args.kind, name=args.name, action=args.action, status='source-only')))
