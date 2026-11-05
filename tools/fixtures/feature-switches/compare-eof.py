import hashlib, sys
from pathlib import Path
expected = Path(__file__).with_name("expected.jsonl").read_bytes()
actual = Path(sys.argv[1]).read_bytes()
if not expected.endswith(b"\n") or actual != expected:
    raise SystemExit("Complete consumer output differs, including EOF")
print("complete-eof", len(actual), hashlib.sha256(actual).hexdigest())
