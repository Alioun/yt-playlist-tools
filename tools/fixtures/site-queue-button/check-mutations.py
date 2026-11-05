import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
fixture = root / "tools/fixtures/site-queue-button"
mutations = json.loads((fixture / "mutations.json").read_text(encoding="utf-8"))
tests = {}
for line in (fixture / "expected.jsonl").read_text(encoding="utf-8").splitlines():
    record = json.loads(line)
    if record.get("kind") == "test":
        tests[record["name"]] = record

problems = []
for mutation in mutations["mutations"]:
    source = (root / mutation["file"]).read_text(encoding="utf-8")
    if source.count(mutation["anchor"]) != 1:
        problems.append([mutation["id"], "anchor-count", source.count(mutation["anchor"])])
    if mutation["anchor"] == mutation["replacement"]:
        problems.append([mutation["id"], "no-change"])
    for name in mutation["expectedRed"]:
        if name not in tests:
            problems.append([mutation["id"], "unknown-test", name])
print(json.dumps({"mutations": len(mutations["mutations"]), "problems": problems}))
sys.exit(1 if problems else 0)
