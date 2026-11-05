import hashlib, json, os, pathlib, sys

# Usage: python3 -I -B apply-case.py <runtime root> (control|probe) <name> (apply|restore)
# Runs only inside a disposable reconstruction. Apply verifies the recorded source identity first and saves the exact
# original bytes and mode beside the root. Restore writes them back and verifies the identity again.
root, kind, name, action = pathlib.Path(sys.argv[1]), sys.argv[2], sys.argv[3], sys.argv[4]
here = pathlib.Path(__file__).parent
table = json.loads((here / ("controls.json" if kind == "control" else "type-probes.json")).read_text())
case = next(c for c in table["controls" if kind == "control" else "probes"] if c["name"] == name)
target = root / case["path"]
saved = root.parent / f"saved-{kind}-{name}"
identity = case["sourceIdentity"]

def check(data: bytes, mode: int) -> None:
    blob = hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()
    if len(data) != identity["bytes"] or hashlib.sha256(data).hexdigest() != identity["sha256"] or blob != identity["gitBlob"]:
        sys.exit("source identity mismatch")
    if ("100755" if mode & 0o111 else "100644") != identity["mode"]:
        sys.exit("source mode mismatch")

if action == "apply":
    data = target.read_bytes(); mode = target.stat().st_mode
    check(data, mode)
    if saved.exists(): sys.exit("saved original already exists")
    saved.write_bytes(data); os.chmod(saved, mode & 0o777)
    text = data.decode()
    if kind == "control":
        for edit in case["edits"]:
            if text.count(edit["before"]) != 1: sys.exit("anchor is not unique")
            text = text.replace(edit["before"], edit["after"])
    else:
        lines = text.split("\n")
        if lines[case["directiveLine"] - 1].strip() != case["directive"]: sys.exit("directive line moved")
        lines[case["directiveLine"] - 1] = "// probe disabled: " + case["name"]
        text = "\n".join(lines)
    target.write_text(text); os.chmod(target, mode & 0o777)
    print("applied", kind, name)
elif action == "restore":
    data = saved.read_bytes(); mode = saved.stat().st_mode
    target.write_bytes(data); os.chmod(target, mode & 0o777)
    check(target.read_bytes(), target.stat().st_mode)
    print("restored", kind, name)
else:
    sys.exit("unknown action")
