"""Future runtime executor only. This flag records a lease; it does not grant one."""
import argparse
import json
import os
from pathlib import Path
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]

def run(command):
    result = subprocess.run(['timeout', '-k', '10', '120', *command], cwd=ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    if result.returncode == 124:
        raise RuntimeError('Deadline hit; do not retry unchanged: ' + ' '.join(command))
    return result.returncode, result.stdout

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--runtime-lease', required=True)
    args = parser.parse_args()
    if not args.runtime_lease.strip():
        raise SystemExit('An externally granted runtime lease is required')
    controls = json.loads((HERE / 'controls.json').read_text())
    compiler = controls['compiler']
    records = []
    for control in controls['controls']:
        path = ROOT / control['path']
        original = path.read_bytes()
        mode = path.stat().st_mode & 0o777
        status, output = run(compiler)
        if status: raise RuntimeError('Baseline compiler failed\n' + output)
        status, output = run(control['behavior'])
        if status: raise RuntimeError('Baseline behavior failed\n' + output)
        changed = original.decode()
        for edit in control['edits']:
            if changed.count(edit['before']) != 1:
                raise RuntimeError('Mutation is not unique: ' + control['name'])
            changed = changed.replace(edit['before'], edit['after'], 1)
        try:
            path.write_text(changed)
            os.chmod(path, mode)
            status, output = run(compiler)
            if status: raise RuntimeError('Compiler failure grants no behavior credit\n' + output)
            status, output = run(control['behavior'])
            if status != 1 or control['test'] not in output or control['redAssertion'] not in output:
                raise RuntimeError('Required observable red assertion missing\n' + output)
            records.append({'name': control['name'], 'compiles': True, 'observableRed': control['redAssertion']})
        finally:
            path.write_bytes(original)
            os.chmod(path, mode)
            if path.read_bytes() != original or path.stat().st_mode & 0o777 != mode:
                raise RuntimeError('Exact restoration failed')
        status, output = run(compiler)
        if status: raise RuntimeError('Restored compiler failed\n' + output)
        status, output = run(control['behavior'])
        if status: raise RuntimeError('Restored behavior failed\n' + output)
    print(json.dumps({'lease': args.runtime_lease, 'controls': records}, separators=(',', ':')))

if __name__ == '__main__':
    main()
