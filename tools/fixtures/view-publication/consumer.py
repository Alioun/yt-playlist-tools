"""Future complete-EOF check; requires the coordinator's runtime lease."""
import argparse
import hashlib
import json
from pathlib import Path
from qualification import invoke

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--lease', required=True, choices=['coordinator-granted'])
    args = parser.parse_args()
    command = ['timeout', '-k', '10', '45', 'bun', '--no-env-file', '--no-install', 'run',
               'tools/fixtures/view-publication/run.ts']
    result = invoke(command, deadline=60)
    expected = (HERE / 'expected.jsonl').read_bytes()
    passed = result['code'] == 0 and result['stdout'] == expected and result['stderr'] == b''
    print(json.dumps(dict(state='exact-eof' if passed else 'failed', command=command,
                         code=result['code'], observedBytes=len(result['stdout']),
                         observedSha256=hashlib.sha256(result['stdout']).hexdigest(),
                         expectedBytes=len(expected), expectedSha256=hashlib.sha256(expected).hexdigest(),
                         stderrBytes=len(result['stderr']))))
    raise SystemExit(0 if passed else 1)

if __name__ == '__main__':
    main()
