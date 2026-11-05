"""Static authoring evidence only. Runs patch and independent hashing, never product code."""
import argparse
import difflib
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tarfile
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from static_support import environment_path, git_tree, identity

parser = argparse.ArgumentParser()
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[3]
fixture = root / "tools/fixtures/settings-file-owner"
frozen_path = fixture / "frozen866.json"
frozen = json.loads(frozen_path.read_bytes())
start = datetime(2026, 10, 29, 23, 56, 0, tzinfo=timezone.utc)
assert (datetime.now(timezone.utc) - start).total_seconds() < 2400, "authoring-cap-expired"
assert git_tree(frozen["entries"]) == frozen["sourceTree"] == "1c38ce3862aea06a11a8e0ea89a02138b5ca52dd"
assert args.output.resolve().is_relative_to(Path("/private/tmp")), "scratch-output-only"
assert not args.output.exists(), "preserve-existing-evidence"
assert shutil.disk_usage(root).free >= 2 * 1024**3, "free-space-floor"
owner = "src/background/store/local-filter-writer.ts"
allowed_store = {
    "src/background/store/settings-file-read.ts", "src/background/store/settings-file-read.bun-test.ts",
    "src/background/store/settings-file-read.type-test.ts", "src/background/store/settings-file-read.README.md",
    "src/background/store/settings-file-owner.bun-test.ts", "src/background/store/settings-file-owner.type-test.ts"
}
entries = dict(frozen["entries"])
changed = []
resolved = {}
for name, expected in frozen["entries"].items():
    if expected.get("identityOnly"):
        assert name == ".env.submit.example"
        continue
    source_root = Path(frozen["baseSourceRoot"])
    for overlay in frozen["overlays"]:
        if name in overlay["paths"]:
            source_root = Path(overlay["sourceRoot"])
    source = source_root / name
    assert identity(source) == expected, "frozen-source-changed:" + name
    resolved[name] = source
    found = identity(root / name)
    if found != expected:
        changed.append(name)
        entries[name] = found
assert changed == [owner], "existing-path-fence"
added = []
for path in [*(root / name for name in sorted(allowed_store)), *sorted(fixture.rglob("*"))]:
    if not path.is_file():
        continue
    assert not path.is_symlink() and "__pycache__" not in path.parts and path.suffix != ".pyc"
    name = path.relative_to(root).as_posix()
    assert name not in frozen["entries"], "protected-addition"
    assert not environment_path(name), "environment-bytes-prohibited"
    added.append(name)
    entries[name] = identity(path)
assert set(name for name in added if not name.startswith("tools/fixtures/settings-file-owner/")) == allowed_store
physical = set()
for directory, dirs, files in os.walk(root):
    dirs[:] = [name for name in dirs if name not in [".git", ".audit", "node_modules", ".wxt", ".output"]]
    for name in files:
        path = Path(directory) / name
        relative = path.relative_to(root).as_posix()
        if relative == ".git" or environment_path(relative):
            continue
        physical.add(relative)
assert physical == {name for name, entry in entries.items() if not entry.get("identityOnly")}, "complete-checkout-inventory"
controls = json.loads((fixture / "controls.json").read_bytes())
for control in controls:
    text = (root / control["file"]).read_text()
    for replacement in control["replacements"]:
        assert text.count(replacement["before"]) == 1, "control-anchor-not-exact"
        assert text[:text.index(replacement["before"])].count("\n") + 1 == replacement["intendedLine"], "control-anchor-line"
probes = json.loads((fixture / "type-probes.json").read_bytes())
assert len(probes["probes"]) == 23
for probe in probes["probes"]:
    lines = (root / probe["file"]).read_text().splitlines()
    assert "@ts-expect-error negative: " + probe["name"] in lines[probe["directiveLine"] - 1]
    assert probe["intendedDiagnosticLine"] == probe["directiveLine"] + 1
out = args.output.resolve()
out.mkdir()
manifest = {"state": "authored-unexecuted", "baseTree": frozen["sourceTree"], "sourceTree": git_tree(entries),
            "nonEnvironmentFiles": len(entries) - 1, "changedExistingPaths": changed, "addedPaths": sorted(added),
            "identityOnlyEnvironmentUnopened": [".env.submit.example"], "entries": dict(sorted(entries.items()))}
manifest_path = out / "source-manifest.json"
manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
(out / "modes.json").write_text(json.dumps({name: entry["mode"] for name, entry in sorted(entries.items())}, indent=2) + "\n")
source = out / "source"
replay = out / "replay"
source.mkdir()
replay.mkdir()
for name, entry in entries.items():
    if entry.get("identityOnly"):
        continue
    target = source / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes((root / name).read_bytes())
    target.chmod(0o755 if entry["mode"] == "100755" else 0o644)
    assert identity(target) == entry
for name, original in resolved.items():
    target = replay / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(original.read_bytes())
    target.chmod(0o755 if frozen["entries"][name]["mode"] == "100755" else 0o644)
patch_parts = []
owner_parts = []
for name in sorted(changed + added):
    before = resolved[name].read_bytes() if name in resolved else b""
    after = (root / name).read_bytes()
    assert after.endswith(b"\n")
    header = [f"diff --git a/{name} b/{name}\n"]
    if name in added:
        header.append(f"new file mode {entries[name]['mode']}\n")
    elif entries[name]["mode"] != frozen["entries"][name]["mode"]:
        header += [f"old mode {frozen['entries'][name]['mode']}\n", f"new mode {entries[name]['mode']}\n"]
    hunk = list(difflib.unified_diff(before.decode().splitlines(keepends=True), after.decode().splitlines(keepends=True),
                                   fromfile="a/" + name if name in resolved else "/dev/null", tofile="b/" + name))
    patch_parts += header + hunk
    if name == owner:
        owner_parts = header + hunk
patch_path = out / "full.patch"
patch_path.write_text("".join(patch_parts))
(out / "owner-only.patch").write_text("".join(owner_parts))
commands = []
clean = {"PATH": "/usr/bin:/bin", "LANG": "C", "TZ": "UTC", "HOME": str(out / "home"), "TMPDIR": str(out / "tmp")}
(out / "home").mkdir()
(out / "tmp").mkdir()


def run(label, argv, cwd):
    wrapped = ["/usr/bin/timeout", "-k", "10", "120", *argv]
    result = subprocess.run(wrapped, cwd=cwd, env=clean, stdin=subprocess.DEVNULL,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=135)
    (out / (label + ".stdout")).write_bytes(result.stdout)
    (out / (label + ".stderr")).write_bytes(result.stderr)
    commands.append({"label": label, "argv": wrapped, "cwd": str(cwd), "returnCode": result.returncode, "directChildWaited": True,
                     "stdoutSha256": hashlib.sha256(result.stdout).hexdigest(), "stderrSha256": hashlib.sha256(result.stderr).hexdigest()})
    (out / "static-commands.json").write_text(json.dumps(commands, indent=2) + "\n")
    assert result.returncode == 0, "static-command-failed:" + label
    return result


patched = run("patch-replay", ["/usr/bin/patch", "--batch", "-p1", "--input", str(patch_path)], replay)
assert b"fuzz" not in patched.stdout.lower() and b"offset" not in patched.stdout.lower(), "patch-not-exact"
for name, entry in entries.items():
    if not entry.get("identityOnly"):
        assert identity(replay / name) == entry, "complete-byte-mode-replay:" + name
(out / "replay.json").write_text(json.dumps({"state": "static-pass", "baseTree": frozen["sourceTree"], "sourceTree": manifest["sourceTree"],
    "root": str(replay), "allBytesAndModesMatch": True, "nonEnvironmentFiles": len(entries) - 1,
    "fullPatchSha256": hashlib.sha256(patch_path.read_bytes()).hexdigest(), "appliedWithoutFuzzOrOffsets": True,
    "environmentEntrySkippedUnopened": ".env.submit.example"}, indent=2) + "\n")
for name, tree_root in [("source", source), ("replay", replay)]:
    run("independent-rehash-" + name, [sys.executable, "-I", "-S", "-B", str(fixture / "independent_rehash.py"),
        str(tree_root), str(manifest_path), str(frozen_path), str(out / ("independent-rehash-" + name + ".json"))], root)
with tarfile.open(out / "source.tar", "w") as archive:
    for name, entry in sorted(entries.items()):
        if entry.get("identityOnly"):
            continue
        info = archive.gettarinfo(str(source / name), arcname=name)
        info.uid = info.gid = info.mtime = 0
        info.uname = info.gname = ""
        with (source / name).open("rb") as stream:
            archive.addfile(info, stream)
now = datetime.now(timezone.utc)
report = {"state": "authored-unexecuted-static-evidence-complete", "baseTree": frozen["sourceTree"], "sourceTree": manifest["sourceTree"],
    "nonEnvironmentFiles": len(entries) - 1, "changedExistingPaths": changed, "addedPaths": sorted(added),
    "protectedFrozenNonEnvironmentFilesPreserved": 865, "retainedFormatPaths": frozen["changedPaths"],
    "identityOnlyEnvironmentUnopened": [".env.submit.example"], "allStaticChildrenWaited": True,
    "runtimeLease": "held-elsewhere-auto-add-and-Monitor", "runtimeGates": "all-unexecuted", "review": "not-requested",
    "gitMutationsInvoked": False, "parentWrites": False, "network": False, "activation": False,
    "conservativeFirstToolLowerBoundUtc": start.isoformat(), "firstClockUtc": "2026-10-29T23:56:38+00:00",
    "sealedAtUtc": now.isoformat(), "conservativeElapsedSeconds": (now - start).total_seconds(), "capSeconds": 2400,
    "timePrecisionNote": "The first clock followed the first tool. A conservative earlier minute bounds the cap without inventing an exact first-tool timestamp.",
    "freeBytes": shutil.disk_usage(root).free, "reconciliation": "required-unperformed-before-qualification-or-integration",
    "protectedRepairsApplied": [], "protectedRepairProposals": [],
    "preSealAttempts": [{"argv": ["timeout", "-k", "10", "120", "python3", "-I", "-S", "-B", "tools/fixtures/settings-file-owner/seal.py", "--output", "/private/tmp/settings-file-owner-return-2ae66b38"], "returnCode": 1, "stage": "complete-checkout-inventory", "cause": "Static scanner incorrectly pruned the frozen source path build/page-link.ts.", "correction": "Removed build from the directory prune list before replay or output creation."}],
    "qualificationEnvelopeProposal": "Materialize the original format seal manifest only in a future scratch qualification stage.",
    "designChoices": [
        "Model the Domain keeps source and availability in discriminated results.",
        "Boundary Discipline keeps trusted privacy separate from file data and raw storage inside the owner.",
        "Type System Discipline rejects plans as origins, raw stores as sources, mixed brands, and stale results with source data.",
        "Use the existing authority-checked rawLocal read path in the owner lane because guardedLocal can resume writes and local updates session observation state.",
        "Read twice and refuse lifecycle loss or changed known canonical documents.",
        "Do not replace future accepted owner source. Reconcile auto-add, Monitor and Accounts first."
    ],
    "openHolds": ["native durability and exclusion", "native privacy provenance", "privacy wording approval", "rendering and axe", "all three picker policies", "production activation"],
    "unexecutedGates": json.loads((fixture / "future-commands.json").read_bytes()),
    "artifacts": {name: identity(out / name) for name in ["source-manifest.json", "modes.json", "full.patch", "owner-only.patch", "source.tar", "replay.json", "independent-rehash-source.json", "independent-rehash-replay.json", "static-commands.json"]}}
assert report["freeBytes"] >= 2 * 1024**3
assert report["conservativeElapsedSeconds"] < 2400, "authoring-cap-expired"
(out / "report.json").write_text(json.dumps(report, indent=2) + "\n")
(out / "REPORT.md").write_text(
    "# Settings-file owner authoring return\n\n"
    + "Authored and unqualified. Only static source installation, hashing, patch replay, and evidence tools ran.\n\n"
    + f"The frozen input tree is `{frozen['sourceTree']}`. The complete returned tree is `{manifest['sourceTree']}`. "
    + f"It contains {len(entries) - 1} non-environment files. Exactly one existing owner file changes, six store files are new, and all other additions are under the new fixture prefix. "
    + "All 865 protected non-environment frozen paths retain their bytes and modes. The environment entry stayed unopened.\n\n"
    + "`source/` and `source.tar` contain the complete source. `source-manifest.json` records every SHA-256, Git blob, size, and mode. "
    + "`full.patch` is the complete patch over frozen866. The actual replay in `replay/` matches every candidate byte and mode. "
    + "Independent separate-process rehashes of both returned source and replay match the same virtual Git tree. Their records are `independent-rehash-source.json` and `independent-rehash-replay.json`.\n\n"
    + "`report.json` carries all changed paths, static command outcomes, artifact identities, design choices, exact unexecuted gate commands, dependency references, timing, and holds. "
    + "The source README documents the port choice, safe pre-consent reads, held-state limitations, fresh privacy-bound checking, and the deferred executor.\n\n"
    + "All compiler, test, fixture, consumer, build, browser, server, install, and qualification execution remains unperformed. "
    + "All seven original format gate groups, nine original type negatives, and five original controls remain intact. There are seven new owner gate groups, 14 new type negatives, and five new compiling-control proposals. "
    + "No runtime or compilation verdict is claimed. Review was not requested.\n\n"
    + "Reconciliation with future accepted auto-add, Monitor, and Accounts source is mandatory before qualification or integration. "
    + "Never replace that future owner with this historical full file. The runtime lease remains elsewhere. Native, privacy, rendering, all three picker-policy holds, and activation remain open.\n\n"
    + "Dispatch stayed in-thread because the brief forbids nested agents.\n")
print(json.dumps({"state": report["state"], "sourceTree": manifest["sourceTree"], "nonEnvironmentFiles": len(entries) - 1,
                  "addedPaths": len(added), "protectedPreserved": 865, "output": str(out), "freeBytes": report["freeBytes"],
                  "conservativeElapsedSeconds": report["conservativeElapsedSeconds"]}))
