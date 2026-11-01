"""Future child execution only. No gate runs during authoring."""
import hashlib
import json
import shlex
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent

def invoke(command, deadline=190):
    config = json.loads((HERE / 'execution-pins.json').read_text())
    pins = config['executables']
    for row in pins.values():
        path = Path(row['path'])
        data = path.read_bytes()
        mode = '100755' if path.stat().st_mode & 0o111 else '100644'
        if len(data) != row['bytes'] or mode != row['mode'] or hashlib.sha256(data).hexdigest() != row['sha256']:
            raise RuntimeError('Pinned dependency identity differs')
    if not (ROOT / 'node_modules').is_dir() or not (ROOT / '.wxt/wxt.d.ts').is_file():
        raise RuntimeError('Prepared local dependencies and WXT declarations are required')
    if hashlib.sha256((ROOT / '.wxt/wxt.d.ts').read_bytes()).hexdigest() != pins['wxt']['sha256']:
        raise RuntimeError('Prepared WXT identity differs')
    args = list(command)
    aliases = {'timeout': 'timeout', 'node': 'node', 'bun': 'bun', 'python3': 'python'}
    args = [pins[aliases[arg]]['path'] if arg in aliases else pins['typescript']['path'] if arg == 'node_modules/typescript/bin/tsc' else arg for arg in args]
    if pins['bun']['path'] in args:
        index = args.index(pins['bun']['path'])
        for flag in ['--no-env-file', '--no-install']:
            if flag not in args[index + 1:]:
                args.insert(index + 1, flag)
    if pins['timeout']['path'] != args[0] or args[1:3] != ['-k', '10'] or not 0 < int(args[3]) <= 540:
        raise RuntimeError('Every child requires a bounded timeout')
    with tempfile.TemporaryDirectory(prefix='private-skip-gate-', dir='/private/tmp') as scratch:
        base = Path(scratch)
        for name in ['home', 'tmp', 'bin']:
            (base / name).mkdir()
        for alias, key in aliases.items():
            flags = ['--no-env-file', '--no-install'] if key == 'bun' else ['-S'] if key == 'python' else []
            wrapper = base / 'bin' / alias
            wrapper.write_text('#!/bin/sh\nexec ' + shlex.join([pins[key]['path'], *flags]) + ' "$@"\n')
            wrapper.chmod(0o755)
        environment = dict(PATH=str(base / 'bin'), HOME=str(base / 'home'), TMPDIR=str(base / 'tmp'),
                           LC_ALL='C', TZ='UTC', NODE_DISABLE_COMPILE_CACHE='1', PYTHONDONTWRITEBYTECODE='1')
        result = subprocess.run(args, cwd=ROOT, env=environment, stdin=subprocess.DEVNULL,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=deadline)
    return dict(command=args, code=result.returncode, stdout=result.stdout, stderr=result.stderr,
                output=(result.stdout + result.stderr).decode(errors='replace'))

def receipt(result):
    return {key: value for key, value in result.items() if key not in ['stdout', 'stderr']}
