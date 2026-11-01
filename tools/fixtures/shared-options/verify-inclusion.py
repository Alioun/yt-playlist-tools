import json
from pathlib import Path
import sys

root = Path.cwd().resolve()
required = json.loads(Path(__file__).with_name('future-gates.json').read_text())['requiredSourceInclusion']
if len(sys.argv) != 3:
    raise SystemExit('Scoped and whole compiler listFilesOnly captures are required')
for capture in sys.argv[1:]:
    paths = {str(Path(line.strip()).resolve()) for line in Path(capture).read_text().splitlines() if line.strip()}
    missing = [name for name in required if str((root / name).resolve()) not in paths]
    if missing:
        raise SystemExit('Compiler inclusion is incomplete: ' + ', '.join(missing))
print(json.dumps({'state': 'both-inclusion-lists-complete', 'sourceFiles': len(required)}))
