import json
from pathlib import Path
import sys

root = Path.cwd().resolve()
listing = {str(Path(line.strip()).resolve()) for line in Path(sys.argv[1]).read_text().splitlines() if line.strip().endswith(('.ts', '.tsx'))}
config = root / 'tools/fixtures/music-ad-transport/tsconfig.json'
if sys.argv[2] == 'scoped':
    required = {str((config.parent / name).resolve()) for name in json.loads(config.read_text())['files']}
elif sys.argv[2] == 'whole':
    manifest = json.loads(Path(sys.argv[3]).read_text())
    required = {str(root / name) for name in manifest['entries'] if name.startswith('src/') and name.endswith(('.ts', '.tsx'))}
else:
    raise SystemExit('Expected scoped or whole inclusion')
missing = sorted(required - listing)
if missing:
    raise SystemExit('Missing actual compiler inclusion: ' + ', '.join(missing))
print(json.dumps({'status': 'actual compiler inclusion', 'files': len(required)}))
