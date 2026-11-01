import json,sys
from pathlib import Path

root=Path.cwd().resolve()
listed={str(Path(line.strip()).resolve()) for line in Path(sys.argv[1]).read_text().splitlines() if line.strip()}
required=[]
for prefix in ['src/site/kit/toaster','src/site/kit/feedback','src/site/kit/layer-host','src/site/core/notice']:
    required.extend(str(p.resolve()) for p in (root/prefix).rglob('*.ts'))
required.extend(str((root/p).resolve()) for p in ['src/site/core/keys.ts','src/site/core/scope.ts','src/site/kit/scope-mount.ts','src/shared/copy/index.ts','src/shared/rules/outcomes.ts','tools/fixtures/site-toaster/consumer.ts'])
missing=sorted(set(required)-listed)
print(json.dumps({'required':len(set(required)),'missing':missing}))
sys.exit(bool(missing))
