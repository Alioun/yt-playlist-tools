#!/usr/bin/env python3
"""Apply a complete source patch and explicit modes without Git."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import stat
import subprocess


def verify(root, manifest):
    expected = set()
    for relative, identity in manifest["entries"].items():
        if identity.get("identityOnly"):
            continue
        path = root / relative
        if path.is_symlink() or not path.is_file():
            raise RuntimeError(f"Non-regular source path: {relative}")
        data = path.read_bytes()
        mode = "100755" if path.stat().st_mode & stat.S_IXUSR else "100644"
        blob = hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()
        if (hashlib.sha256(data).hexdigest(), len(data), blob, mode) != (
                identity["sha256"], identity["bytes"], identity["gitBlob"], identity["mode"]):
            raise RuntimeError(f"Source identity differs: {relative}")
        expected.add(relative)
    actual = {str(path.relative_to(root)) for path in root.rglob("*") if path.is_file()}
    if actual != expected:
        raise RuntimeError("Complete replay path inventory differs")
    return len(expected)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--input-manifest", type=Path, required=True)
    parser.add_argument("--patch", type=Path, required=True)
    parser.add_argument("--modes", type=Path, required=True)
    parser.add_argument("--candidate-manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--record", type=Path, required=True)
    args = parser.parse_args()
    before = json.loads(args.input_manifest.read_text())
    after = json.loads(args.candidate_manifest.read_text())
    input_count = verify(args.input, before)
    args.output.mkdir(parents=True, exist_ok=False)
    for relative, identity in before["entries"].items():
        if identity.get("identityOnly"):
            continue
        target = args.output / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(args.input / relative, target)
        target.chmod(0o755 if identity["mode"] == "100755" else 0o644)
    command = ["/usr/bin/timeout", "-k", "10", "120", "/usr/bin/patch", "-p1", "--batch", "--forward", "-i", str(args.patch.resolve())]
    result = subprocess.run(command, cwd=args.output, stdin=subprocess.DEVNULL, capture_output=True,
                            env={"PATH": "/usr/bin:/bin", "LC_ALL": "C"}, check=False)
    args.record.with_suffix(".stdout").write_bytes(result.stdout)
    args.record.with_suffix(".stderr").write_bytes(result.stderr)
    if result.returncode != 0:
        raise RuntimeError(f"Complete patch replay exit {result.returncode}")
    operations = json.loads(args.modes.read_text())
    for operation in operations:
        path = args.output / operation["path"]
        if operation["after"] is not None:
            path.chmod(0o755 if operation["after"] == "100755" else 0o644)
    output_count = verify(args.output, after)
    args.record.write_text(json.dumps({"command": command, "patchExit": result.returncode,
        "inputFiles": input_count, "candidateFiles": output_count, "modeOperations": len(operations),
        "completeBytesModesBlobsAndHashes": True, "environmentEntry": "identity-only-unopened"}, indent=2) + "\n")


if __name__ == "__main__":
    main()
