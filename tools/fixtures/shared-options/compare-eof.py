import hashlib
import json
from pathlib import Path
import sys

expected = Path(__file__).with_name('expected.jsonl').read_bytes()
if len(sys.argv) != 3 or not expected.endswith(b'\n'):
    raise SystemExit('Two complete captures and a final LF are required')
rows = expected.splitlines()
if len(rows) != 60:
    raise SystemExit('The independent expectation must contain all sixty rows')
for row in rows:
    json.loads(row)
for capture in sys.argv[1:]:
    actual = Path(capture).read_bytes()
    if actual != expected:
        raise SystemExit('Complete consumer bytes differ before EOF or at EOF')
print(json.dumps({'state': 'complete-eof-equality', 'captures': 2, 'rows': 60, 'bytes': len(expected), 'sha256': hashlib.sha256(expected).hexdigest()}))
