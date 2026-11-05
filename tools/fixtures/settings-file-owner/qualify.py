"""Deferred qualification only. Never execute without the transferred runtime lease."""
import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from static_support import dependency_tree, environment_path, git_tree, identity

modes = ["focused", "whole", "behavior", "consumer", "guards", "probes", "controls"]
parser = argparse.ArgumentParser()
parser.add_argument("mode", choices=modes + ["format-" + mode for mode in modes])
parser.add_argument("--runtime-lease", required=True, choices=["coordinator-granted"])
parser.add_argument("--manifest", type=Path, required=True)
parser.add_argument("--reconciliation-record", type=Path, required=True)
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[3]
manifest = json.loads(args.manifest.read_bytes())
reconciliation = json.loads(args.reconciliation_record.read_bytes())
assert reconciliation["state"] == "coordinator-accepted", "reconciliation-unperformed"
assert reconciliation["sourceTree"] == manifest["sourceTree"], "reconciliation-source-tree"
assert reconciliation["candidateOwner"] == manifest["entries"]["src/background/store/local-filter-writer.ts"], "reconciliation-owner-identity"
for unit in ["auto-add", "Monitor", "Accounts"]:
    assert reconciliation["acceptedUnits"][unit]["acceptanceRecord"], "accepted-unit-record-required"
    assert re.fullmatch("[0-9a-f]{40}", reconciliation["acceptedUnits"][unit]["sourceTree"]), "accepted-unit-tree-required"
pins = json.loads((root / "tools/fixtures/settings-file-owner/dependency-identities.json").read_bytes())
assert args.output.resolve().is_relative_to(Path("/private/tmp")), "scratch-output-only"
assert shutil.disk_usage(args.output.parent).free >= 2 * 1024**3, "free-space-floor"
out = args.output / args.mode
out.mkdir(parents=True, exist_ok=False)
for item in pins["executables"].values():
    assert identity(Path(item["path"])) == {key: item[key] for key in ["mode", "gitBlob", "sha256", "bytes"]}, "executable-identity"
for name in ["dependencies", "generatedTypes"]:
    assert dependency_tree(Path(pins[name]["root"])) == pins[name]["identity"], "dependency-identity"
assert git_tree(manifest["entries"]) == manifest["sourceTree"], "candidate-tree"
stage = out / "source"
stage.mkdir()
for name, entry in manifest["entries"].items():
    if entry.get("identityOnly"):
        assert environment_path(name), "unexpected-identity-only-entry"
        continue
    assert not environment_path(name), "environment-bytes-prohibited"
    original = root / name
    assert identity(original) == entry, "candidate-source-identity"
    target = stage / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(original.read_bytes())
    target.chmod(0o755 if entry["mode"] == "100755" else 0o644)
(stage / "node_modules").symlink_to(pins["dependencies"]["root"], target_is_directory=True)
shutil.copytree(pins["generatedTypes"]["root"], stage / ".wxt")
fixture = stage / "tools/fixtures/settings-file-owner"
paths = {key: out / key for key in ["home", "tmp", "cache"]}
for path in paths.values():
    path.mkdir()
clean = {"PATH": "/usr/bin:/bin", "HOME": str(paths["home"]), "TMPDIR": str(paths["tmp"]),
         "XDG_CACHE_HOME": str(paths["cache"]), "BUN_RUNTIME_TRANSPILER_CACHE_PATH": str(paths["cache"] / "bun"),
         "LANG": "C", "TZ": "UTC", "CI": "1", "NO_COLOR": "1", "FORCE_COLOR": "0"}
commands = []


def run(label, argv, seconds=90):
    assert 0 < seconds <= 540
    wrapped = [pins["executables"]["timeout"]["path"], "-k", "10", str(seconds), *argv]
    result = subprocess.run(wrapped, cwd=stage, env=clean, stdin=subprocess.DEVNULL,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=seconds + 15)
    (out / (label + ".stdout")).write_bytes(result.stdout)
    (out / (label + ".stderr")).write_bytes(result.stderr)
    commands.append({"label": label, "argv": wrapped, "returnCode": result.returncode, "directChildWaited": True,
                     "stdoutSha256": hashlib.sha256(result.stdout).hexdigest(), "stderrSha256": hashlib.sha256(result.stderr).hexdigest()})
    (out / "commands.json").write_text(json.dumps(commands, indent=2) + "\n")
    assert result.returncode != 124, "deadline-hit-do-not-rerun-unchanged:" + label
    return result


def passed(result, name=None):
    assert result.returncode == 0, "gate-failed"
    if name:
        assert re.search(r"\(pass\)[^\n]*" + re.escape(name), (result.stdout + result.stderr).decode("utf8", "replace")), "named-test-did-not-pass"


native = pins["executables"]["nativeTypeScript"]["path"]
bun = pins["executables"]["bun"]["path"]
focused = [native, "--noEmit", "--pretty", "false", "-p", "tools/fixtures/settings-file-owner/tsconfig.json"]
test_command = [bun, "--no-env-file", "--no-install", "test", "--isolate", "--conditions=browser"]
behavior = [*test_command, "./src/background/store/settings-file-read.bun-test.ts",
            "./src/background/store/settings-file-owner.bun-test.ts", "./tools/fixtures/settings-file-owner/consumer.bun-test.ts"]

if args.mode.startswith("format-"):
    legacy = stage / "tools/fixtures/settings-file"
    (legacy / "seal").mkdir()
    (legacy / "seal/source-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    passed(run("original-" + args.mode, [pins["executables"]["python"]["path"], "-I", "-S", "-B", str(legacy / "qualify.py"),
                                       args.mode.removeprefix("format-"), "--runtime-lease", "coordinator-granted", "--output", str(out / "original")], 500))
elif args.mode == "focused":
    passed(run("focused-native-types", focused))
elif args.mode == "whole":
    passed(run("whole-native-types", [native, "--noEmit", "--pretty", "false", "-p", "tsconfig.json"], 180))
elif args.mode == "behavior":
    passed(run("owner-behavior", behavior, 120))
elif args.mode == "guards":
    passed(run("architecture-guards", [*test_command, "./tests/guards/architecture.test.ts"], 120))
elif args.mode == "consumer":
    expected = (fixture / "expected-stdout.jsonl").read_bytes()
    for index in range(2):
        result = run("consumer-" + str(index + 1), [bun, "--no-env-file", "--no-install", "tools/fixtures/settings-file-owner/run.ts"], 45)
        passed(result)
        assert result.stdout == expected and result.stderr == b"", "complete-consumer-output"
elif args.mode == "probes":
    passed(run("probe-baseline", focused))
    receipts = []
    for name in ["settings-file-read.type-test.ts", "settings-file-owner.type-test.ts"]:
        path = stage / "src/background/store" / name
        original = path.read_text()
        lines = original.splitlines(keepends=True)
        probes = [(index, line.split("negative:", 1)[1].strip()) for index, line in enumerate(lines) if "@ts-expect-error negative:" in line]
        for index, label in probes:
            changed = lines.copy()
            changed[index] = "\n"
            path.write_text("".join(changed))
            try:
                result = run("probe-" + label, focused)
                diagnostics = re.findall(r"([^\n]+?)\(([0-9]+),[0-9]+\): error TS[0-9]+:", (result.stdout + result.stderr).decode("utf8", "replace"))
                assert result.returncode != 0 and diagnostics, "negative-accepted"
                assert all(file.replace("\\", "/").endswith("src/background/store/" + name) and int(line) == index + 2 for file, line in diagnostics), "wrong-diagnostic-location"
            finally:
                path.write_text(original)
            passed(run("probe-restored-" + label, focused))
            receipts.append({"name": label, "file": name, "line": index + 2})
    assert len(receipts) == 14, "probe-inventory"
    (out / "probe-receipts.json").write_text(json.dumps(receipts, indent=2) + "\n")
else:
    passed(run("controls-baseline-types", focused))
    receipts = []
    for control in json.loads((fixture / "controls.json").read_text()):
        name = control["name"]
        command = [*test_command, "./" + control["testFile"], "--test-name-pattern", "^" + re.escape(control["test"]) + "$"]
        passed(run(name + "-baseline", command), control["test"])
        path = stage / control["file"]
        original = path.read_text()
        changed = original
        for replacement in control["replacements"]:
            assert changed.count(replacement["before"]) == 1, "control-anchor-not-exact"
            changed = changed.replace(replacement["before"], replacement["after"])
        path.write_text(changed)
        try:
            passed(run(name + "-mutant-types", focused))
            result = run(name + "-mutant-behavior", command)
            assert result.returncode != 0 and re.search(r"\(fail\)[^\n]*" + re.escape(control["test"]), (result.stdout + result.stderr).decode("utf8", "replace")), "control-did-not-fail-named-assertion"
        finally:
            path.write_text(original)
        passed(run(name + "-restored-types", focused))
        passed(run(name + "-restored-behavior", command), control["test"])
        receipts.append({"name": name, "state": "compiled-failed-named-behavior-restored"})
    passed(run("all-restored-behavior", behavior, 120))
    (out / "control-receipts.json").write_text(json.dumps(receipts, indent=2) + "\n")
for name, entry in manifest["entries"].items():
    if not entry.get("identityOnly"):
        assert identity(stage / name) == entry, "restored-source-identity"
assert shutil.disk_usage(out).free >= 2 * 1024**3, "free-space-floor"
(out / "result.json").write_text(json.dumps({"state": "pass", "mode": args.mode, "sourceTree": manifest["sourceTree"],
    "commands": len(commands), "allDirectChildrenWaited": True, "reconciliationRecord": str(args.reconciliation_record)}, indent=2) + "\n")
print(json.dumps({"mode": args.mode, "state": "pass", "record": str(out / "result.json")}))
