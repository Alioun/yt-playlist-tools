"""Future exact EOF comparison. Execute only under a separately granted lease."""
from pathlib import Path
import subprocess

here = Path(__file__).resolve().parent
root = here.parents[2]
command = ['timeout', '-k', '10', '120', 'bun', '--no-env-file', '--conditions=browser', '--preload', './tools/fixtures/site-core-lifecycle/preload.ts', './tools/fixtures/site-core-lifecycle/run.ts']
result = subprocess.run(command, cwd=root, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
if result.returncode == 124:
    raise SystemExit('Consumer deadline hit; do not retry unchanged')
if result.returncode:
    raise SystemExit('Consumer failed with code ' + str(result.returncode))
expected = (here / 'expected.jsonl').read_bytes()
if result.stdout != expected:
    raise SystemExit('Consumer EOF bytes differ from the authored expectation')
print('Exact authored lifecycle consumer EOF bytes match')
