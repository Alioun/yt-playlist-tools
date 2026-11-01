import hashlib
from pathlib import Path
import sys

expected = (Path(__file__).parent / 'expected.jsonl').read_bytes()
if not expected.endswith(b'\n'):
    raise SystemExit('Expected JSONL lacks its final newline')
if len(sys.argv) != 3:
    raise SystemExit('Expected two fresh-process output paths')
for filename in sys.argv[1:]:
    actual = Path(filename).read_bytes()
    if actual != expected:
        raise SystemExit('Complete JSONL differs through EOF: ' + filename)
print('Two complete EOF comparisons passed; expected SHA-256 ' + hashlib.sha256(expected).hexdigest())
