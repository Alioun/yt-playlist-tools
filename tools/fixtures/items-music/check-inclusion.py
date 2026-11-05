import json
from pathlib import Path
import sys

root = Path.cwd().resolve()
config = Path('tools/fixtures/items-music/tsconfig.json')
files = json.loads(config.read_text())['files']
actual = {str(Path(line.strip()).resolve()) for line in Path(sys.argv[1]).read_text().splitlines() if line.strip().endswith(('.ts', '.tsx', '.svelte'))}
required = {str((config.parent / filename).resolve()) for filename in files}
missing = sorted(required - actual)
if missing:
    raise SystemExit('Missing actual compiler inclusion: ' + ', '.join(missing))
print('Actual compiler listing includes all ' + str(len(required)) + ' required sources')
