from pathlib import Path
import hashlib
import json
import sys

expected = (Path(__file__).resolve().parent/'expected.jsonl').read_bytes()
if len(sys.argv) != 3 or not expected.endswith(b'\n'):
    raise SystemExit('Expected two complete consumer captures and a final LF')
for name in sys.argv[1:]:
    if Path(name).read_bytes() != expected:
        raise SystemExit('Complete EOF comparison failed')
print(json.dumps({'kind':'complete-eof-comparison','copies':2,'bytes':len(expected),'sha256':hashlib.sha256(expected).hexdigest()}))
