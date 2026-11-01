import json
import pathlib
import re
import sys

fixture = pathlib.Path(__file__).resolve().parent
expected = [json.loads(line) for line in (fixture / "expected.jsonl").read_text(encoding="utf-8").splitlines()]
eof = expected[-1]
if eof.get("kind") != "eof" or eof.get("tests") != len(expected) - 1:
    sys.exit("E_EXPECTED_EOF")
report = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
results = {}
for match in re.finditer(r"^\((pass|fail)\) (.+?)(?: \[[0-9.]+m?s\])?$", report, re.M):
    results.setdefault(match.group(2).split(" > ")[-1], []).append(match.group(1))
missing = [record["name"] for record in expected[:-1] if results.get(record["name"]) != [record["expected"]]]
extra = sorted(set(results) - {record["name"] for record in expected[:-1]})
print(json.dumps({"expected": len(expected) - 1, "missingOrWrong": missing, "unexpected": extra}))
sys.exit(1 if missing or extra else 0)
