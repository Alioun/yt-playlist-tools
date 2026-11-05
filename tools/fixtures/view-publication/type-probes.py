"""Future intended-line checks. This authoring unit does not run them."""
import argparse
import json
import re
from pathlib import Path
from qualification import invoke, receipt

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent

def compile(command):
    return receipt(invoke(command, deadline=100))

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--id', required=True)
    parser.add_argument('--lease', required=True, choices=['coordinator-granted'])
    args = parser.parse_args()
    manifest = json.loads((HERE / 'type-probes.json').read_text())
    probe = next(row for row in manifest['probes'] if row['id'] == args.id)
    path = ROOT / probe['path']
    saved, mode = path.read_bytes(), path.stat().st_mode & 0o777
    receipts = []
    passed = False
    try:
        baseline = compile(manifest['compilerGate']); receipts.append(baseline)
        if baseline['code'] != 0:
            raise RuntimeError('Baseline compiler gate did not pass')
        lines = saved.decode().splitlines(keepends=True)
        line = lines[probe['directiveLine'] - 1]
        if line.rstrip('\n') != probe['directive']:
            raise RuntimeError('Intended directive identity differs')
        lines[probe['directiveLine'] - 1] = ' ' * len(line.rstrip('\n')) + '\n'
        path.write_text(''.join(lines))
        result = compile(manifest['compilerGate']); receipts.append(result)
        diagnostics = re.findall(r'([^\s()]+\.ts)\((\d+),\d+\): error TS\d+', result['output'])
        expected = [(probe['path'], str(probe['diagnosticLine']))]
        passed = result['code'] not in [0, 124] and bool(diagnostics) and set(diagnostics) == set(expected)
    finally:
        path.write_bytes(saved); path.chmod(mode)
        assert path.read_bytes() == saved and path.stat().st_mode & 0o777 == mode
        restored = compile(manifest['compilerGate']); receipts.append(restored)
        passed = passed and restored['code'] == 0
    print(json.dumps(dict(id=args.id, state='intended-line-and-restored' if passed else 'failed', commands=receipts), indent=2))
    raise SystemExit(0 if passed else 1)

if __name__ == '__main__':
    main()
