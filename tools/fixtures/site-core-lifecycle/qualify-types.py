"""Future intended-line diagnostic checks. Requires an external runtime lease."""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]

def run(command):
    result = subprocess.run(['timeout', '-k', '10', '120', *command], cwd=ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    if result.returncode == 124:
        raise RuntimeError('Compiler deadline hit; do not retry unchanged')
    return result.returncode, result.stdout

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--runtime-lease', required=True)
    args = parser.parse_args()
    if not args.runtime_lease.strip(): raise SystemExit('An externally granted runtime lease is required')
    manifest = json.loads((HERE / 'type-probes.json').read_text())
    records = []
    for probe in manifest['probes']:
        path = ROOT / probe['path']
        original = path.read_bytes()
        mode = path.stat().st_mode & 0o777
        command = manifest['compilers'][probe['compiler']]
        status, output = run(command)
        if status: raise RuntimeError('Baseline compiler failed\n' + output)
        lines = original.decode().splitlines(keepends=True)
        if '@ts-expect-error' not in lines[probe['directiveLine'] - 1]: raise RuntimeError('Probe line changed')
        lines[probe['directiveLine'] - 1] = '// Diagnostic probe, line numbering preserved.\n'
        try:
            path.write_text(''.join(lines))
            os.chmod(path, mode)
            status, output = run(command)
            line = probe['errorLine']
            # Native TypeScript and svelte-check use these two location formats.
            location = re.escape(path.name) + r'(?:\(' + str(line) + r',\d+\)|:' + str(line) + r':\d+)'
            if status == 0 or not re.search(location, output):
                raise RuntimeError('Intended-line diagnostic was not observed\n' + output)
            records.append({'path': probe['path'], 'line': line, 'diagnosticObserved': True})
        finally:
            path.write_bytes(original)
            os.chmod(path, mode)
            if path.read_bytes() != original or path.stat().st_mode & 0o777 != mode: raise RuntimeError('Exact restoration failed')
        status, output = run(command)
        if status: raise RuntimeError('Restored compiler failed\n' + output)
    print(json.dumps({'lease': args.runtime_lease, 'probes': records}, separators=(',', ':')))

if __name__ == '__main__':
    main()
