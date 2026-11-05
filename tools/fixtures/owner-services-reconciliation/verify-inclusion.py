from pathlib import Path
import json
import sys

root = Path(__file__).resolve().parents[3]
fixture = Path(__file__).resolve().parent
config = json.loads((fixture/'tsconfig.json').read_text())
scoped = {str((fixture/name).resolve()) for name in config['files']}
whole = {str(path.resolve()) for path in fixture.glob('*.ts')}
whole.update(str(root/name) for name in ['src/background/store/local-filter-writer.ts', 'src/background/store/local-filter-writer.type-test.ts', 'src/background/adapters/starting-owner.ts'])
for captured, required in zip(sys.argv[1:], [scoped, whole]):
    listed = set(Path(captured).read_text().splitlines())
    missing = sorted(required-listed)
    if missing:
        raise SystemExit('Missing compiler inclusion: '+json.dumps(missing))
if len(sys.argv) != 3:
    raise SystemExit('Expected both complete compiler inclusion captures')
print(json.dumps({'kind':'compiler-inclusion','scopedRoots':len(scoped),'wholeRequiredRoots':len(whole)}))
