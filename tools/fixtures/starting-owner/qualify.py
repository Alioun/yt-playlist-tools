import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[3]
HERE = ROOT / 'tools/fixtures/starting-owner'
AUDIT = ROOT / '.audit/starting-owner-qualification'
PYTHON = '/opt/homebrew/Caskroom/miniconda/base/bin/python3'
NODE = '/usr/local/bin/node'
BUN = '/opt/homebrew/lib/node_modules/bun/bin/bun.exe'
TIMEOUT = '/usr/bin/timeout'
PREPARED = ROOT / 'node_modules'
GENERATED = ROOT / '.wxt'
COMPILER = [NODE, 'node_modules/@typescript/native/bin/tsc', '--project', 'tools/fixtures/starting-owner/qualification.tsconfig.json', '--noEmit', '--pretty', 'false', '--incremental', 'false']
TEST = 'src/background/adapters/starting-owner.bun-test.ts'

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def pin(manifest):
    for path, expected in manifest['entries'].items():
        assert 'missing' not in expected, path
        current = Path(path)
        assert current.is_file() and current.stat().st_size == expected['bytes'] and digest(current) == expected['sha256'], path

def prepare():
    modules = ROOT / 'node_modules'
    assert not modules.is_symlink(), 'Use local per-package links rather than a whole node_modules link'
    modules.mkdir(exist_ok=True)
    for entry in PREPARED.iterdir():
        if entry.name.startswith('.'):
            continue
        if entry.name.startswith('@'):
            scope = modules / entry.name
            scope.mkdir(exist_ok=True)
            packages = list(entry.iterdir())
        else:
            packages = [entry]
        for package in packages:
            relative = package.relative_to(PREPARED)
            destination = modules / relative
            if destination.exists() or destination.is_symlink():
                assert destination.is_symlink() and destination.resolve() == package.resolve(), str(relative)
            else:
                destination.symlink_to(package.resolve(), target_is_directory=package.is_dir())
    names = ['tsconfig.json', 'wxt.d.ts', 'types/paths.d.ts', 'types/i18n.d.ts', 'types/imports-module.d.ts', 'types/globals.d.ts']
    for name in names:
        destination = ROOT / '.wxt' / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        data = (GENERATED / name).read_bytes()
        if destination.exists():
            assert destination.read_bytes() == data, name
        else:
            destination.write_bytes(data)
    print(json.dumps({'prepared': True, 'network': False, 'install': False}))

def source_identity():
    manifest = json.loads((AUDIT / 'input-manifest.json').read_text())
    entries = {}
    blobs = AUDIT / 'source-blobs'
    manifests = AUDIT / 'source-manifests'
    blobs.mkdir(exist_ok=True); manifests.mkdir(exist_ok=True)
    tree = {}
    for name, entry in manifest['entries'].items():
        if entry.get('identityOnly'):
            entries[name] = entry
        else:
            path = ROOT / name
            data = path.read_bytes()
            sha = hashlib.sha256(data).hexdigest()
            entries[name] = {'sha256': sha, 'mode': '100755' if path.stat().st_mode & 0o111 else '100644',
                             'gitBlob': hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest(), 'bytes': len(data)}
            saved = blobs / sha
            if not saved.exists(): saved.write_bytes(data)
        node = tree
        parts = name.split('/')
        for part in parts[:-1]: node = node.setdefault(part, {})
        node[parts[-1]] = (entries[name]['mode'], entries[name]['gitBlob'])
    def tree_hash(node):
        data = b''
        for name, value in sorted(node.items(), key=lambda item: item[0] + ('/' if isinstance(item[1], dict) else '')):
            mode, blob = ('40000', tree_hash(value)) if isinstance(value, dict) else value
            data += mode.encode() + b' ' + name.encode() + b'\0' + bytes.fromhex(blob)
        return hashlib.sha1(b'tree ' + str(len(data)).encode() + b'\0' + data).hexdigest()
    identity = tree_hash(tree)
    destination = manifests / (identity + '.json')
    if not destination.exists(): destination.write_text(json.dumps({'sourceTree': identity, 'entries': entries}, indent=2) + '\n')
    return identity

def run(label, argv, seconds=45):
    scratch = AUDIT / 'scratch'
    for name in ['home', 'tmp', 'bin']:
        (scratch / name).mkdir(parents=True, exist_ok=True)
    launcher = scratch / 'bin/bun'
    launcher.write_text('#!/bin/sh\nexec ' + BUN + ' --no-env-file --no-install "$@"\n')
    launcher.chmod(0o755)
    env = {'PATH': str(AUDIT / 'runtime-bin') + ':/usr/bin:/bin', 'HOME': str(AUDIT / 'home'), 'TMPDIR': str(AUDIT / 'tmp'),
           'LANG': 'C', 'LC_ALL': 'C', 'CI': '1', 'NO_COLOR': '1', 'TZ': 'UTC', 'DO_NOT_TRACK': '1', 'BUN_TELEMETRY_DISABLE': '1', 'WXT_TELEMETRY_DISABLED': '1'}
    assert 1 <= seconds <= 540
    assert time.time() + seconds + 15 < 1793322750, 'Forty-minute cap leaves no command budget'
    assert not (AUDIT / 'lease-release.json').exists(), 'Runtime lease released'
    if argv[0] == BUN:
        assert '--no-env-file' in argv and '--no-install' in argv
        argv = [argv[0], '--config=' + str(AUDIT / 'bunfig.toml'), '--preload=' + str(AUDIT / 'synthetic-preload.ts')] + argv[1:]
    before = source_identity()
    helper_identities = {}
    versions = AUDIT / 'helper-versions'
    versions.mkdir(exist_ok=True)
    for helper in [Path(__file__).resolve(), AUDIT / 'bunfig.toml', AUDIT / 'synthetic-preload.ts', *sorted((AUDIT / 'runtime-bin').glob('*'))]:
        data = helper.read_bytes()
        sha = hashlib.sha256(data).hexdigest()
        helper_identities[str(helper)] = {'sha256': sha, 'bytes': len(data), 'mode': helper.stat().st_mode & 0o777}
        saved = versions / sha
        if not saved.exists(): saved.write_bytes(data)

    command = [TIMEOUT, '-k', '10', str(seconds)] + argv
    started = time.monotonic()
    commands = AUDIT / 'commands'
    commands.mkdir(exist_ok=True)
    invocation = Path(tempfile.mkdtemp(prefix=label + '-', dir=commands))
    stdout_path, stderr_path = invocation / 'stdout', invocation / 'stderr'
    with stdout_path.open('xb') as stdout, stderr_path.open('xb') as stderr:
        child = subprocess.Popen(command, cwd=ROOT, env=env, stdin=subprocess.DEVNULL, start_new_session=True, stdout=stdout, stderr=stderr)
        status = child.wait()
    try:
        os.killpg(child.pid, 0)
        group = 'present'
    except ProcessLookupError:
        group = 'absent'
    record = {'controllingHelpers': helper_identities, 'beforeSourceManifest': str(AUDIT / 'source-manifests' / (before + '.json')), 'beforeSource': before, 'afterSource': source_identity(), 'environmentNames': sorted(env), 'boundaryLauncherSha256': digest(AUDIT / 'runtime-bin/bun'), 'stdinClosed': True, 'label': label, 'argv': command, 'pid': child.pid, 'waitReturned': status, 'immediateOwnedGroupStatus': group,
              'elapsedSeconds': time.monotonic() - started, 'completeDescendantEnumerationClaimed': False,
              'stdout': {'path': str(stdout_path), 'bytes': stdout_path.stat().st_size, 'sha256': digest(stdout_path)},
              'stderr': {'path': str(stderr_path), 'bytes': stderr_path.stat().st_size, 'sha256': digest(stderr_path)}}
    with (invocation / 'receipt.json').open('x') as handle:
        json.dump(record, handle, indent=2); handle.write('\n')
    with (AUDIT / 'children.jsonl').open('a') as handle:
        handle.write(json.dumps(record) + '\n')
    assert group == 'absent', 'Owned group remains present; stop and report without polling'
    assert status != 124, 'Deadline reached; report final output rather than retrying unchanged'
    output = stdout_path.read_text() + stderr_path.read_text()
    return status, output

def passed(label, argv):
    status, output = run(label, argv)
    assert status == 0, label + '\n' + output
    return output

def behavior(pattern=None, paths=None):
    result = [BUN, '--no-env-file', '--no-install', 'test', '--isolate', '--conditions=browser']
    result += ['./' + path for path in (paths or [TEST])]
    if pattern:
        result += ['--test-name-pattern', pattern]
    return result

def types(case):
    probes = json.loads((HERE / 'type-probes.json').read_text())['probes']
    probe = probes[int(case) - 1]
    path = ROOT / probe['path']
    original, mode = path.read_bytes(), path.stat().st_mode & 0o777
    passed('types-baseline', COMPILER)
    lines = original.decode().splitlines(keepends=True)
    assert lines[probe['directiveLine'] - 1].strip() == probe['directive']
    lines[probe['directiveLine'] - 1] = '\n'
    try:
        path.write_text(''.join(lines))
        status, output = run('intended-negative', COMPILER)
        diagnostics = re.findall(r'([^\n]+?)\((\d+),\d+\): error (TS\d+):', output)
        assert status != 0 and diagnostics, output
        assert all(name.endswith(probe['path']) and int(line) == probe['diagnosticLine'] and code != 'TS2578' for name, line, code in diagnostics), output
    finally:
        path.write_bytes(original); path.chmod(mode)
        assert path.read_bytes() == original and path.stat().st_mode & 0o777 == mode
    passed('types-restored', COMPILER)
    print(json.dumps({'case': case, 'intendedLine': probe['diagnosticLine'], 'restored': True}))

def control(name):
    controls = json.loads((HERE / 'controls.json').read_text())['controls']
    proposal = next(item for item in controls if item['name'] == name)
    argv = behavior(re.escape(proposal['test']))
    passed('control-baseline-compiler', COMPILER)
    passed('control-baseline-behavior', argv)
    originals = {}
    try:
        for edit in proposal['edits']:
            path = ROOT / edit['path']
            if path not in originals:
                originals[path] = (path.read_bytes(), path.stat().st_mode & 0o777)
            source = path.read_text()
            assert source.count(edit['before']) == 1, edit['path']
            path.write_text(source.replace(edit['before'], edit['after'], 1))
        passed('control-mutant-compiler', COMPILER)
        status, output = run('control-mutant-behavior', argv)
        assert status != 0 and proposal['test'] in output and 'expect(' in output and re.search(r'\b1 fail\b', output), output
        assert not re.search(r'Cannot find|ModuleNotFound|SyntaxError|ReferenceError|timed out', output), output
    finally:
        for path, (data, mode) in originals.items():
            path.write_bytes(data); path.chmod(mode)
            assert path.read_bytes() == data and path.stat().st_mode & 0o777 == mode
    passed('control-restored-compiler', COMPILER)
    passed('control-restored-behavior', argv)
    print(json.dumps({'control': name, 'compiledMutant': True, 'observableAssertionFailed': proposal['expectedAssertion'], 'restored': True}))

def inclusion():
    output = passed('compiler-inclusion', COMPILER + ['--listFiles'])
    listed = set(line.strip() for line in output.splitlines())
    manifest = json.loads((AUDIT / 'input-manifest.json').read_text())
    expected = [name for name, entry in manifest['entries'].items() if not entry.get('identityOnly') and name.endswith(('.ts', '.tsx', '.mts', '.cts'))]
    missing = [name for name in expected if str(ROOT / name) not in listed]
    assert not missing, missing
    print(json.dumps({'includedSourceFiles': len(expected), 'missing': missing}))

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('stage', choices=['prepare', 'compiler', 'inclusion', 'focused', 'architecture', 'consumer', 'adjacent', 'types', 'control'])
    parser.add_argument('--case')
    parser.add_argument('--toolchain', required=True)
    args = parser.parse_args()
    AUDIT.mkdir(parents=True, exist_ok=True)
    pin(json.loads(Path(args.toolchain).read_text()))
    if args.stage == 'prepare': prepare()
    elif args.stage == 'compiler': passed('compiler', COMPILER)
    elif args.stage == 'inclusion': inclusion()
    elif args.stage == 'focused': passed('focused', behavior())
    elif args.stage == 'architecture': passed('architecture', behavior(paths=['tests/guards/architecture.test.ts']))
    elif args.stage == 'consumer': passed('consumer', [BUN, '--no-env-file', '--no-install', '--conditions=browser', 'tools/fixtures/starting-owner/run.ts'])
    elif args.stage == 'adjacent': passed('adjacent', behavior(paths=[
        'src/background/adapters/local-filter-writer.bun-test.ts', 'src/background/adapters/startup-source.bun-test.ts',
        'src/background/adapters/runtime.bun-test.ts', 'src/background/adapters/sender-origin.bun-test.ts',
        'src/background/store/session-memory.bun-test.ts', 'src/background/store/store-composition.bun-test.ts',
        'src/background/router/first-run.bun-test.ts', 'src/background/store/setup-edit.bun-test.ts',
        'src/background/tabs/tabs.bun-test.ts']))
    elif args.stage == 'types': types(args.case)
    elif args.stage == 'control': control(args.case)

if __name__ == '__main__':
    main()
