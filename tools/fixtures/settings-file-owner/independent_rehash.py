"""Separate-process rehash. Imports no candidate helper or product module."""
import hashlib
import json
import os
import sys
from pathlib import Path

root = Path(sys.argv[1]).resolve()
manifest = json.loads(Path(sys.argv[2]).read_bytes())
frozen = json.loads(Path(sys.argv[3]).read_bytes())
output = Path(sys.argv[4])
actual = {}
for name, expected in manifest["entries"].items():
    if expected.get("identityOnly"):
        assert name == ".env.submit.example"
        actual[name] = expected
        continue
    assert not any(part == ".env" or part.startswith(".env.") or part == ".envrc" or part.endswith(".env") for part in Path(name).parts)
    path = root / name
    assert path.is_file() and not path.is_symlink()
    size = path.stat().st_size
    sha = hashlib.sha256()
    blob = hashlib.sha1(b"blob " + str(size).encode() + b"\0")
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(131072), b""):
            sha.update(block)
            blob.update(block)
    actual[name] = {"mode": "100755" if path.stat().st_mode & 0o111 else "100644", "sha256": sha.hexdigest(), "gitBlob": blob.hexdigest(), "bytes": size}
    assert actual[name] == expected, "identity-mismatch:" + name
changed = [name for name, entry in frozen["entries"].items() if actual[name] != entry]
assert changed == ["src/background/store/local-filter-writer.ts"]
added = sorted(set(actual) - set(frozen["entries"]))
store_added = [name for name in added if not name.startswith("tools/fixtures/settings-file-owner/")]
assert store_added == sorted([
    "src/background/store/settings-file-read.ts", "src/background/store/settings-file-read.bun-test.ts",
    "src/background/store/settings-file-read.type-test.ts", "src/background/store/settings-file-read.README.md",
    "src/background/store/settings-file-owner.bun-test.ts", "src/background/store/settings-file-owner.type-test.ts"])
physical = set()
for directory, dirs, files in os.walk(root):
    assert ".git" not in dirs and "node_modules" not in dirs
    for name in files:
        physical.add((Path(directory) / name).relative_to(root).as_posix())
assert physical == {name for name, entry in actual.items() if not entry.get("identityOnly")}, "complete-physical-tree"
directories = {"": []}
for name, entry in actual.items():
    parts = name.split("/")
    for index in range(len(parts) - 1):
        directories.setdefault("/".join(parts[:index + 1]), [])
    directories["/".join(parts[:-1])].append((parts[-1], entry["mode"], entry["gitBlob"]))
trees = {}
for path in sorted(directories, key=lambda name: len(name.split("/")) if name else 0, reverse=True):
    body = b"".join(mode.encode() + b" " + name.encode() + b"\0" + bytes.fromhex(sha)
                    for name, mode, sha in sorted(directories[path], key=lambda entry: (entry[0] + ("/" if entry[1] == "40000" else "")).encode()))
    trees[path] = hashlib.sha1(b"tree " + str(len(body)).encode() + b"\0" + body).hexdigest()
    if path:
        parent, _, name = path.rpartition("/")
        directories[parent].append((name, "40000", trees[path]))
assert trees[""] == manifest["sourceTree"]
output.write_text(json.dumps({"state": "static-pass", "root": str(root), "sourceTree": trees[""],
    "algorithm": "independent streaming SHA-256, Git blob, and bottom-up Git tree",
    "nonEnvironmentFiles": len(physical), "protectedNonEnvironmentFilesPreserved": 865,
    "changedExistingPaths": changed, "addedPaths": added,
    "allBytesAndModesMatch": True, "completePhysicalTreeMatches": True,
    "identityOnlyEnvironmentUnopened": [".env.submit.example"], "productExecution": "none"}, indent=2) + "\n")
print(json.dumps({"state": "static-pass", "sourceTree": trees[""], "files": len(physical)}))
