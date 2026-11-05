from pathlib import Path
import json, sys
root=Path(__file__).resolve().parents[3]
fixture=Path(__file__).resolve().parent
required=set(json.loads((fixture/'future-gates.json').read_text())['sourceInclusion'])
if len(sys.argv)!=3: raise SystemExit('Expected scoped and whole complete native listFilesOnly captures')
for captured in sys.argv[1:]:
    listed={str(Path(line).resolve()) for line in Path(captured).read_text().splitlines()}
    missing=sorted(path for path in required if str((root/path).resolve()) not in listed)
    if missing: raise SystemExit('Missing compiler inclusion: '+json.dumps(missing))
print(json.dumps({'required':len(required),'scopedAndWholeIncluded':True}))
