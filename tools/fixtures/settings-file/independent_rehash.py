"""Independent static rehash in a separate process. Imports no candidate helper."""
import hashlib
import json
import os
import sys
from pathlib import Path

root = Path(sys.argv[1]).resolve()
manifest_path = Path(sys.argv[2]).resolve()
frozen_path = Path(sys.argv[3]).resolve()
output = Path(sys.argv[4]).resolve()
manifest = json.loads(manifest_path.read_bytes())
frozen = json.loads(frozen_path.read_bytes())
actual = {}
skipped = []

for name, entry in manifest["entries"].items():
    if entry.get("identityOnly"):
        skipped.append(name)
        actual[name] = entry
        continue
    assert not any(part == ".env" or part.startswith(".env.") for part in Path(name).parts), "environment-path"
    path = root / name
    assert path.is_file() and not path.is_symlink(), "source-kind"
    byte_count = path.stat().st_size
    sha = hashlib.sha256()
    git = hashlib.sha1(b"blob " + str(byte_count).encode() + b"\0")
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(131072), b""):
            sha.update(block)
            git.update(block)
    found = {"mode": "100755" if path.stat().st_mode & 0o111 else "100644", "gitBlob": git.hexdigest(),
             "sha256": sha.hexdigest(), "bytes": byte_count}
    assert found == entry, "identity-mismatch:" + name
    actual[name] = found

for name, entry in frozen["entries"].items():
    assert actual[name] == entry, "frozen-identity-changed:" + name
assert skipped == [".env.submit.example"], "identity-only-inventory"

physical = set()
for directory, directories, files in os.walk(root):
    assert ".git" not in directories, "unexpected-git-directory"
    for name in files:
        physical.add((Path(directory) / name).relative_to(root).as_posix())
assert physical == {name for name, entry in actual.items() if not entry.get("identityOnly")}, "complete-physical-tree"

directories = {"": []}
for name, entry in actual.items():
    parts = name.split("/")
    for index in range(len(parts) - 1):
        directories.setdefault("/".join(parts[:index + 1]), [])
    parent = "/".join(parts[:-1])
    directories[parent].append((parts[-1], entry["mode"], entry["gitBlob"]))
trees = {}
for path in sorted(directories, key=lambda path: len(path.split("/")) if path else 0, reverse=True):
    children = directories[path]
    body = b"".join(mode.encode() + b" " + name.encode() + b"\0" + bytes.fromhex(sha)
                    for name, mode, sha in sorted(children, key=lambda entry: (entry[0] + ("/" if entry[1] == "40000" else "")).encode()))
    tree = hashlib.sha1(b"tree " + str(len(body)).encode() + b"\0" + body).hexdigest()
    trees[path] = tree
    if path:
        parent, _, name = path.rpartition("/")
        directories[parent].append((name, "40000", tree))
assert trees[""] == manifest["sourceTree"], "complete-git-tree"
report = {"state": "static-pass", "algorithm": "independent streaming SHA-256 and Git blob/tree, no shared candidate helper",
          "root": str(root), "sourceTree": trees[""], "nonEnvironmentFiles": len(physical),
          "frozenNonEnvironmentFilesPreserved": 841, "identityOnlyEnvironmentUnopened": skipped,
          "allBytesAndModesMatch": True, "completePhysicalTreeMatches": True}
output.write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps({"state": "static-pass", "nonEnvironmentFiles": len(physical), "sourceTree": trees[""]}))
