import argparse
import datetime
import hashlib
import json
from pathlib import Path
import stat
import subprocess
import sys

parser = argparse.ArgumentParser()
parser.add_argument('campaign', choices=['types', 'controls'])
parser.add_argument('--runtime-lease', choices=['pointer-keys'], required=True)
parser.add_argument('--launcher', type=Path, required=True)
parser.add_argument('--launcher-sha256', required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
fixture = Path(__file__).resolve().parent
root = fixture.parents[2]
launcher = args.launcher.resolve()
assert root.name not in ('source', 'replay'), 'Never mutate a sealed source or replay'
assert launcher.is_file() and launcher.is_absolute() and not launcher.is_relative_to(root)
assert hashlib.sha256(launcher.read_bytes()).hexdigest() == args.launcher_sha256
output = args.output.resolve()
assert not output.exists(), 'Preserve earlier campaign evidence'
assert not output.is_relative_to(root), 'Keep receipts outside the candidate'
output.mkdir(parents=True)
receipts = []


def save(name, value):
    (output / name).write_text(json.dumps(value, indent=2) + '\n')


def run(label, command):
    assert command[0] in ('bun', 'node', 'python3')
    if command[0] == 'bun':
        assert '--no-env-file' in command and '--no-install' in command
    argv = ['timeout', '-k', '10', '120', sys.executable, '-I', '-B', str(launcher), *command]
    directory = output / f'{len(receipts):03d}-{label}'
    directory.mkdir()
    record = {'command': argv, 'cwd': str(root), 'startUTC': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'launcherSha256': args.launcher_sha256, 'status': 'running'}
    (directory / 'result.json').write_text(json.dumps(record, indent=2) + '\n')
    with (directory / 'stdout').open('wb') as stdout, (directory / 'stderr').open('wb') as stderr:
        process = subprocess.Popen(argv, cwd=root, stdin=subprocess.DEVNULL, stdout=stdout, stderr=stderr)
        record['childPID'] = process.pid
        code = process.wait()
    record.update({'returncode': code, 'childWaited': True, 'status': 'completed',
                   'endUTC': datetime.datetime.now(datetime.timezone.utc).isoformat()})
    for stream in ('stdout', 'stderr'):
        data = (directory / stream).read_bytes()
        record[stream] = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
    (directory / 'result.json').write_text(json.dumps(record, indent=2) + '\n')
    receipts.append({'label': label, 'receipt': directory.name, 'returncode': code})
    save('receipt-index.json', receipts)
    assert code != 124, f'Deadline hit for {label}; do not retry unchanged'
    return code, (directory / 'stdout').read_bytes() + (directory / 'stderr').read_bytes()


compiler = ['node', 'node_modules/@typescript/native/bin/tsc', '--noEmit', '-p', 'tools/fixtures/pointer-keys/tsconfig.json']


def behavior(control):
    return ['bun', 'test', '--no-env-file', '--no-install', '--isolate', '--conditions=browser',
            '--preload', './tools/fixtures/pointer-keys/preload.ts', control['testFile'], '-t', control['test']]


def execute_case(index, case):
    path = root / case['path']
    assert path.is_file() and not path.is_symlink()
    original = path.read_bytes()
    mode = stat.S_IMODE(path.stat().st_mode)
    prefix = f'{index:02d}'
    assert run(prefix + '-baseline-compiler', compiler)[0] == 0
    if args.campaign == 'controls':
        assert run(prefix + '-baseline-behavior', behavior(case))[0] == 0
        changed = original.decode()
        for edit in case['edits']:
            assert changed.count(edit['before']) == 1
            changed = changed.replace(edit['before'], edit['after'], 1)
    else:
        lines = original.decode().splitlines(keepends=True)
        number = case['directiveLine'] - 1
        assert '@ts-expect-error' in lines[number]
        lines[number] = '\n'
        changed = ''.join(lines)
    qualified = False
    try:
        path.write_text(changed)
        path.chmod(mode)
        if args.campaign == 'controls':
            assert run(prefix + '-mutated-compiler', compiler)[0] == 0, 'A compiler failure earns no control credit'
            code, diagnostic = run(prefix + '-mutated-behavior', behavior(case))
            assert code != 0
            assert case['test'].encode() in diagnostic and case['redAssertion'].encode() in diagnostic
        else:
            code, diagnostic = run(prefix + '-intended-line', compiler)
            assert code != 0
            location = f"{case['path']}({case['errorLine']},".encode()
            assert location in diagnostic, 'The diagnostic must name the intended statement'
        qualified = True
    finally:
        path.write_bytes(original)
        path.chmod(mode)
        assert path.read_bytes() == original and stat.S_IMODE(path.stat().st_mode) == mode
        save(prefix + '-restoration.json', {'path': case['path'], 'sha256': hashlib.sha256(original).hexdigest(),
                                          'mode': oct(mode), 'exactRestoration': True})
    assert qualified
    assert run(prefix + '-restored-compiler', compiler)[0] == 0
    if args.campaign == 'controls':
        assert run(prefix + '-restored-behavior', behavior(case))[0] == 0
    return {'case': case.get('name', case.get('expectation')), 'status': 'qualified', 'exactRestoration': True}


inventory = json.loads((fixture / ('controls.json' if args.campaign == 'controls' else 'type-probes.json')).read_text())
cases = inventory['controls' if args.campaign == 'controls' else 'probes']
results = []
try:
    for index, case in enumerate(cases, 1):
        results.append(execute_case(index, case))
        save('results.json', {'campaign': args.campaign, 'cases': results, 'complete': False})
except BaseException:
    save('results.json', {'campaign': args.campaign, 'cases': results, 'complete': False, 'status': 'failed or interrupted'})
    raise
save('results.json', {'campaign': args.campaign, 'cases': results, 'complete': True,
                     'descendantWaitProof': 'Required from the separately approved launcher receipts'})
