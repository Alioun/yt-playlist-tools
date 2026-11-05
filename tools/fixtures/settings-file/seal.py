"""Seal authored bytes and perform static complete replay. Executes no product code."""
import difflib
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from static_support import git_tree, identity

root = Path(__file__).resolve().parents[3]
fixture = root / "tools/fixtures/settings-file"
seal = fixture / "seal"
assert not seal.exists(), "already-sealed"
assert shutil.disk_usage(root).free >= 2 * 1024**3, "free-space-floor"
frozen_path = fixture / "settings-file-authoring-input-manifest.json"
frozen = json.loads(frozen_path.read_text())
assert frozen["sourceTree"] == git_tree(frozen["entries"]) == "a2add5de6833696e0d725771304f7779aef744ce"
entries = dict(frozen["entries"])
for name, entry in entries.items():
    if not entry.get("identityOnly"):
        assert identity(root / name) == entry, "protected-frozen-identity"
added = []
for directory in [root / "src/shared/settings-file", fixture]:
    for path in sorted(directory.rglob("*")):
        if path.is_file():
            assert path.suffix != ".pyc" and "__pycache__" not in path.parts, "unexpected-generated-file"
            name = path.relative_to(root).as_posix()
            assert name not in frozen["entries"], "protected-addition"
            entries[name] = identity(path)
            added.append(name)
added.sort()
seal.mkdir()
manifest = {"state": "authored-unexecuted", "baseTree": frozen["sourceTree"], "sourceTree": git_tree(entries),
            "nonEnvironmentFiles": len(entries) - 1, "identityOnlyEnvironmentUnopened": [".env.submit.example"],
            "addedPaths": added, "entries": dict(sorted(entries.items()))}
(seal / "source-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
patch = []
for name in added:
    entry = entries[name]
    text = (root / name).read_bytes().decode("utf8")
    assert text.endswith("\n"), "payload-requires-final-lf"
    patch.extend([f"diff --git a/{name} b/{name}\n", f"new file mode {entry['mode']}\n"])
    patch.extend(difflib.unified_diff([], text.splitlines(keepends=True), fromfile="/dev/null", tofile="b/" + name))
patch_bytes = "".join(patch).encode()
(seal / "full.patch").write_bytes(patch_bytes)

replay = Path(tempfile.mkdtemp(prefix="settings-file-static-replay-", dir="/private/tmp"))
source = replay / "source"
source.mkdir()
for name, entry in frozen["entries"].items():
    if entry.get("identityOnly"):
        continue
    path = source / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes((root / name).read_bytes())
    path.chmod(0o755 if entry["mode"] == "100755" else 0o644)
task_home = replay / "home"
task_tmp = replay / "tmp"
task_home.mkdir()
task_tmp.mkdir()
clean = {"PATH": "/usr/bin:/bin", "HOME": str(task_home), "TMPDIR": str(task_tmp), "LANG": "C", "TZ": "UTC"}
commands = []


def run(label, command, cwd):
    argv = ["/usr/bin/timeout", "-k", "10", "120", *command]
    result = subprocess.run(argv, cwd=cwd, env=clean, stdin=subprocess.DEVNULL,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=135)
    (seal / (label + ".stdout")).write_bytes(result.stdout)
    (seal / (label + ".stderr")).write_bytes(result.stderr)
    commands.append({"argv": argv, "cwd": str(cwd), "returnCode": result.returncode, "directChildWaited": True})
    assert result.returncode == 0, "static-child-failed:" + label


run("patch-replay", ["/usr/bin/patch", "--batch", "-p1", "--input", str(seal / "full.patch")], source)
for name, entry in entries.items():
    if not entry.get("identityOnly"):
        assert identity(source / name) == entry, "complete-patch-replay-identity"
(seal / "replay.json").write_text(json.dumps({"state": "static-pass", "root": str(source),
    "fullPatchSha256": hashlib.sha256(patch_bytes).hexdigest(), "allBytesAndModesMatch": True,
    "nonEnvironmentFiles": len(entries) - 1, "protectedNonEnvironmentFiles": 841,
    "identityOnlyEnvironmentUnopened": [".env.submit.example"]}, indent=2) + "\n")
run("independent-rehash", [sys.executable, "-I", "-S", "-B", str(fixture / "independent_rehash.py"), str(source),
                           str(seal / "source-manifest.json"), str(frozen_path), str(seal / "independent-rehash.json")], root)
(seal / "static-commands.json").write_text(json.dumps(commands, indent=2) + "\n")
(seal / "added-paths.json").write_text(json.dumps({"payload": added,
    "envelope": sorted([path.relative_to(root).as_posix() for path in seal.iterdir()] +
                       ["tools/fixtures/settings-file/seal/added-paths.json", "tools/fixtures/settings-file/seal/seal.json"])}, indent=2) + "\n")
now = datetime.now(timezone.utc)
start = datetime(2026, 10, 29, 23, 23, 0, tzinfo=timezone.utc)
elapsed = (now - start).total_seconds()
report = {"state": "partial-cap-expired-sealed" if elapsed >= 2700 else "authored-unexecuted-sealed", "baseTree": frozen["sourceTree"], "sourceTree": manifest["sourceTree"],
    "firstToolUtc": start.isoformat(), "sealedAtUtc": now.isoformat(), "elapsedSeconds": elapsed,
    "timePrecisionSeconds": 1, "capSeconds": 2700, "payloadAddedPaths": len(added), "preservedNonEnvironmentPaths": 841,
    "runtimeLease": "none", "productCompilerTestFixtureBuildBrowserExecution": "not-run",
    "reviews": "not-requested", "allStaticChildrenWaited": True, "freeBytes": shutil.disk_usage(root).free,
    "envelopeRule": "Payload identities and full patch exclude the seal directory. Envelope hashes exclude this self-record.",
    "envelope": {path.name: identity(path) for path in sorted(seal.iterdir())}}
(seal / "seal.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps({"state": report["state"], "sourceTree": manifest["sourceTree"], "payloadPaths": len(added),
                  "nonEnvironmentFiles": len(entries) - 1, "elapsedSeconds": elapsed,
                  "sealSha256": hashlib.sha256((seal / "seal.json").read_bytes()).hexdigest()}))
