import argparse, hashlib, json, os, pathlib, re, subprocess

ROOT = pathlib.Path(__file__).resolve().parents[3]
parser = argparse.ArgumentParser()
parser.add_argument('kind', choices=['types', 'control'])
parser.add_argument('case')
parser.add_argument('--evidence', required=True)
args = parser.parse_args()
evidence = ROOT / args.evidence
evidence.mkdir(parents=True, exist_ok=True)
compiler = ['/usr/local/bin/node', 'node_modules/@typescript/native/bin/tsc', '--project', 'tools/fixtures/first-run-backend/qualification.tsconfig.json', '--noEmit', '--pretty', 'false', '--incremental', 'false']
bun = '/opt/homebrew/lib/node_modules/bun/bin/bun.exe'
records = []

def run(stage, argv, seconds=120):
    command = ['timeout', '-k', '10', str(seconds)] + argv
    with (evidence / (stage + '.stdout')).open('wb') as out, (evidence / (stage + '.stderr')).open('wb') as err:
        child = subprocess.Popen(command, cwd=ROOT, stdout=out, stderr=err)
        code = child.wait()
    record = {'stage': stage, 'argv': command, 'pid': child.pid, 'exit': code, 'waited': True}
    records.append(record)
    (evidence/'children.json').write_text(json.dumps(records, indent=2)+'\n')
    return code, (evidence/(stage+'.stdout')).read_text()+(evidence/(stage+'.stderr')).read_text()

def expect_pass(stage, argv):
    code, output = run(stage, argv)
    assert code == 0, stage + '\n' + output

def behavior(case):
    return [bun, 'test', '--no-env-file', '--no-install', '--isolate', '--conditions=browser', './src/background/router/first-run.bun-test.ts', '--test-name-pattern', case['test']]

if args.kind == 'control':
    controls = json.loads((ROOT/'tools/fixtures/first-run-backend/qualification-controls.json').read_text())['controls']
    control = next(x for x in controls if x['name'] == args.case)
    path = ROOT/control['path']
    original = path.read_bytes(); mode = path.stat().st_mode & 0o777
    expect_pass('baseline-compiler', compiler)
    expect_pass('baseline-behavior', behavior(control))
    text = original.decode()
    assert text.count(control['before']) >= control['replaceCount']
    try:
        path.write_text(text.replace(control['before'], control['after'], control['replaceCount']))
        expect_pass('mutant-compiler', compiler)
        code, output = run('mutant-behavior', behavior(control))
        assert code not in [0,124] and control['test'] in output and 'expect(' in output and re.search(r'\n\s*1 fail\b',output), output
        assert not re.search(r'Cannot find|ModuleNotFound|SyntaxError|ReferenceError|timed out', output), output
    finally:
        path.write_bytes(original); path.chmod(mode)
        assert path.read_bytes() == original and path.stat().st_mode & 0o777 == mode
    expect_pass('restored-compiler', compiler)
    expect_pass('restored-behavior', behavior(control))
    print(json.dumps({'case': args.case, 'compiled': True, 'targetFailed': True, 'restoredCompiler': True, 'restoredBehavior': True, 'sha256': hashlib.sha256(original).hexdigest(), 'mode': oct(mode)}))
else:
    category, label = args.case.split(':',1)
    sources = {'backend': 'src/ui/backend/backend.type-test.ts', 'owner': 'src/ui/onboarding/owner.type-test.ts', 'i18n': 'src/shared/i18n/i18n.type-test.ts', 'svelte': 'tools/fixtures/ui-foundation/ApiChecks.svelte'}
    path = ROOT/sources[category]
    original = path.read_bytes(); mode = path.stat().st_mode & 0o777
    lines = original.decode().splitlines(keepends=True)
    positions = [i for i,line in enumerate(lines) if '@ts-expect-error' in line]
    if label == 'positive':
        expect_pass('positive', compiler)
        print(json.dumps({'case':args.case,'passed':True}))
    else:
        position = next((i for i in positions if 'negative: '+label+'.' in lines[i] or '@ts-expect-error '+label+'.' in lines[i]), None) if not label.isdigit() else positions[int(label)-1]
        assert position is not None
        lines[position] = '\n'
        argv = compiler
        if category == 'svelte':
            argv = ['/usr/local/bin/node','node_modules/svelte-check/bin/svelte-check','--workspace','.', '--tsconfig','tools/fixtures/ui-foundation/tsconfig.json','--fail-on-warnings','--output','machine']
        try:
            path.write_text(''.join(lines))
            code, output = run('intended-negative', argv)
            if category == 'svelte':
                diagnostics = [line for line in output.splitlines() if re.search(r' ERROR ',line)]
                intended = len(diagnostics)==1 and path.name in diagnostics[0] and f' {position+2}:' in diagnostics[0]
            else:
                diagnostics = re.findall(r'([^\n]+?)\((\d+),\d+\): error (TS\d+):',output)
                intended = len(diagnostics)==1 and diagnostics[0][0].endswith(sources[category]) and int(diagnostics[0][1])==position+2 and diagnostics[0][2]!='TS2578'
            assert code not in [0,124] and intended, output
            print(json.dumps({'case':args.case,'passed':True,'line':position+2,'diagnostics':diagnostics}))
        finally:
            path.write_bytes(original); path.chmod(mode)
            assert path.read_bytes()==original and path.stat().st_mode & 0o777==mode
