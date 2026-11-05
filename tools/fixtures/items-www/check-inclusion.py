"""Unexecuted future comparison of an actual native compiler file listing."""
import json
from pathlib import Path
import sys

root = Path.cwd().resolve()
fixture = root/'tools/fixtures/items-www'
config = json.loads((fixture/'tsconfig.json').read_text())
listing = Path(sys.argv[1]).read_text().splitlines()
actual = {str(Path(line).resolve()) for line in listing if line.strip()}
required = {str((fixture/name).resolve()) for name in config['files']}
missing = sorted(required-actual)
assert not missing, 'Actual compiler inclusion omitted: '+', '.join(missing)
print(json.dumps({'actualInclusion':True,'requiredAuthoredFiles':len(required),'status':'pass'}))
