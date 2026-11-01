"""Future lease-controlled mutation checks. This authoring unit does not run them."""
import argparse
import hashlib
import json
import re
from pathlib import Path
from qualification import invoke as execute, receipt as execution_receipt

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent

def invoke(command):
    return execution_receipt(execute(command))

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--id', required=True)
    parser.add_argument('--lease', required=True, choices=['coordinator-granted'])
    args = parser.parse_args()
    config = json.loads((HERE / 'controls.json').read_text())
    control = next(row for row in config['controls'] if row['id'] == args.id)
    compiler = config['compilerGate']
    behavioral = config['testPrefix'] + [control['testFile'], '-t', control['testName']]
    saved = {edit['path']: ((ROOT / edit['path']).read_bytes(), (ROOT / edit['path']).stat().st_mode & 0o777) for edit in control['edits']}
    receipt = dict(id=args.id, state='failed', commands=[])
    try:
        baseline = invoke(compiler)
        receipt['commands'].append(baseline)
        if baseline['code'] != 0:
            raise RuntimeError('Baseline compiler gate did not pass')
        baseline_test = invoke(behavioral)
        receipt['commands'].append(baseline_test)
        if baseline_test['code'] != 0:
            raise RuntimeError('Baseline behavior gate did not pass')
        for edit in control['edits']:
            path = ROOT / edit['path']
            source = path.read_text()
            if source.count(edit['old']) != edit.get('count', 1):
                raise RuntimeError('Mutation anchor count differs')
            path.write_text(source.replace(edit['old'], edit['new']))
        compiled = invoke(compiler)
        receipt['commands'].append(compiled)
        if compiled['code'] != 0:
            raise RuntimeError('Mutant compiler failure supplies no behavior credit')
        observed = invoke(behavioral)
        receipt['commands'].append(observed)
        if observed['code'] in [0, 124] or '(fail) ' + control['testName'] not in observed['output']:
            raise RuntimeError('The named behavior assertion did not fail')
        receipt['state'] = 'sensitive-pending-restoration'
    except Exception as error:
        receipt['error'] = str(error)
    finally:
        for name, (data, mode) in saved.items():
            path = ROOT / name
            path.write_bytes(data)
            path.chmod(mode)
            if path.read_bytes() != data or path.stat().st_mode & 0o777 != mode:
                raise RuntimeError('Exact mutation restoration failed')
        restored_compile, restored_test = invoke(compiler), invoke(behavioral)
        receipt['commands'].extend([restored_compile, restored_test])
        receipt['restoredSha256'] = {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in saved}
        if receipt['state'] == 'sensitive-pending-restoration' and restored_compile['code'] == 0 and restored_test['code'] == 0:
            receipt['state'] = 'sensitive-and-restored'
        else:
            receipt['state'] = 'failed'
    print(json.dumps(receipt, indent=2))
    raise SystemExit(0 if receipt['state'] == 'sensitive-and-restored' else 1)

if __name__ == '__main__':
    main()
