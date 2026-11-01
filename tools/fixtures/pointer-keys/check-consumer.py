import argparse
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--stdout', type=Path, required=True)
parser.add_argument('--stderr', type=Path, required=True)
args = parser.parse_args()
expected = (Path(__file__).resolve().parent / 'expected.jsonl').read_bytes()
actual = args.stdout.read_bytes()
errors = args.stderr.read_bytes()
record = {'expectedBytes': len(expected), 'actualBytes': len(actual),
          'expectedSha256': hashlib.sha256(expected).hexdigest(),
          'actualSha256': hashlib.sha256(actual).hexdigest(),
          'completeEOFEqual': actual == expected, 'stderrEmpty': len(errors) == 0}
print(json.dumps(record))
raise SystemExit(0 if actual == expected and not errors else 1)
