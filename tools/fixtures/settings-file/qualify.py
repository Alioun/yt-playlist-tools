"""Deferred lease-holder gates. This program has not run during authoring."""
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

parser = argparse.ArgumentParser()
parser.add_argument("mode", choices=["focused", "whole", "behavior", "consumer", "guards", "probes", "controls"])
parser.add_argument("--runtime-lease", required=True, choices=["coordinator-granted"])
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[3]
fixture = root / "tools/fixtures/settings-file"
pins = json.loads((fixture / "dependency-identities.json").read_text())
manifest = json.loads((fixture / "seal/source-manifest.json").read_text())
assert shutil.disk_usage(args.output.parent).free >= 2 * 1024**3, "free-space-floor"
assert args.output.resolve().is_relative_to(Path("/private/tmp")), "scratch-output-only"
out = args.output / args.mode
out.mkdir(parents=True, exist_ok=False)

for item in pins["executables"].values():
    assert identity(Path(item["path"])) == {key: item[key] for key in ["mode", "gitBlob", "sha256", "bytes"]}, "executable-identity"
for name in ["dependencies", "generatedTypes"]:
    assert dependency_tree(Path(pins[name]["root"])) == pins[name]["identity"], "dependency-identity"

stage = out / "source"
stage.mkdir()
for name, entry in manifest["entries"].items():
    if entry.get("identityOnly"):
        assert environment_path(name), "unexpected-identity-only-entry"
        continue
    assert not environment_path(name), "environment-bytes-prohibited"
    source = root / name
    assert identity(source) == entry, "candidate-source-identity"
    target = stage / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(source.read_bytes())
    target.chmod(0o755 if entry["mode"] == "100755" else 0o644)
assert git_tree(manifest["entries"]) == manifest["sourceTree"], "candidate-tree"
(stage / "node_modules").symlink_to(pins["dependencies"]["root"], target_is_directory=True)
shutil.copytree(pins["generatedTypes"]["root"], stage / ".wxt")

task_home = out / "home"
task_tmp = out / "tmp"
task_cache = out / "cache"
for path in [task_home, task_tmp, task_cache]:
    path.mkdir()
clean = {"PATH": "/usr/bin:/bin", "HOME": str(task_home), "TMPDIR": str(task_tmp),
         "XDG_CACHE_HOME": str(task_cache), "BUN_RUNTIME_TRANSPILER_CACHE_PATH": str(task_cache / "bun"),
         "TZ": "UTC", "LANG": "C", "CI": "1", "NO_COLOR": "1", "FORCE_COLOR": "0"}
commands = []


def run(label, command, seconds=90):
    assert seconds <= 540
    if command[0] == pins["executables"]["bun"]["path"]:
        assert command[1:3] == ["--no-env-file", "--no-install"]
    wrapped = [pins["executables"]["timeout"]["path"], "-k", "10", str(seconds), *command]
    result = subprocess.run(wrapped, cwd=stage, env=clean, stdin=subprocess.DEVNULL,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=seconds + 15)
    (out / f"{label}.stdout").write_bytes(result.stdout)
    (out / f"{label}.stderr").write_bytes(result.stderr)
    commands.append({"label": label, "argv": wrapped, "returnCode": result.returncode, "directChildWaited": True,
                     "stdoutSha256": hashlib.sha256(result.stdout).hexdigest(),
                     "stderrSha256": hashlib.sha256(result.stderr).hexdigest()})
    (out / "commands.json").write_text(json.dumps(commands, indent=2) + "\n")
    assert result.returncode != 124, f"deadline-hit:{label}:do-not-rerun-unchanged"
    return result


native = pins["executables"]["nativeTypeScript"]["path"]
bun = pins["executables"]["bun"]["path"]
focused = [native, "--noEmit", "--pretty", "false", "-p", "tools/fixtures/settings-file/tsconfig.json"]
behavior = [bun, "--no-env-file", "--no-install", "test", "--isolate", "--conditions=browser",
            "./src/shared/settings-file/settings-file.bun-test.ts"]


def passed(result, name=None):
    text = (result.stdout + result.stderr).decode("utf8", errors="replace")
    assert result.returncode == 0, "gate-failed"
    if name is not None:
        assert re.search(r"\(pass\)[^\n]*" + re.escape(name), text), "named-test-did-not-pass"


if args.mode == "focused":
    passed(run("focused-native-types", focused))
elif args.mode == "whole":
    passed(run("whole-native-types", [native, "--noEmit", "--pretty", "false", "-p", "tsconfig.json"], 180))
elif args.mode == "behavior":
    passed(run("settings-file-behavior", behavior))
elif args.mode == "guards":
    passed(run("architecture-guards", [bun, "--no-env-file", "--no-install", "test", "--isolate", "--conditions=browser",
                                       "./tests/guards/architecture.test.ts"], 120))
elif args.mode == "consumer":
    expected = (fixture / "expected-stdout.jsonl").read_bytes()
    outputs = []
    for index in range(2):
        result = run(f"consumer-{index + 1}", [bun, "--no-env-file", "--no-install", "tools/fixtures/settings-file/run.ts"], 45)
        passed(result)
        assert result.stderr == b"", "consumer-stderr"
        assert result.stdout == expected, "consumer-complete-bytes-through-eof"
        outputs.append(result.stdout)
    assert outputs[0] == outputs[1], "consumer-nondeterminism"
elif args.mode == "probes":
    passed(run("probes-baseline", focused))
    path = stage / "tools/fixtures/settings-file/native.type-test.ts"
    original = path.read_text()
    lines = original.splitlines(keepends=True)
    probes = [(index, line.split("negative:", 1)[1].strip()) for index, line in enumerate(lines)
              if "@ts-expect-error negative:" in line]
    assert len(probes) == 9, "probe-inventory"
    receipts = []
    for index, name in probes:
        changed = lines.copy()
        changed[index] = "\n"
        path.write_text("".join(changed))
        result = run("probe-" + name, focused)
        text = (result.stdout + result.stderr).decode("utf8", errors="replace")
        diagnostics = re.findall(r"([^\n]+?)\(([0-9]+),[0-9]+\): error TS[0-9]+:", text)
        assert result.returncode != 0 and diagnostics, "negative-accepted"
        assert all(file.replace("\\", "/").endswith("tools/fixtures/settings-file/native.type-test.ts") and int(line) == index + 2
                   for file, line in diagnostics), "wrong-diagnostic-location"
        path.write_text(original)
        passed(run("probe-restored-" + name, focused))
        receipts.append({"name": name, "line": index + 2, "status": "rejected-at-intended-line"})
    (out / "probe-receipts.json").write_text(json.dumps(receipts, indent=2) + "\n")
else:
    controls = json.loads((fixture / "controls.json").read_text())
    receipts = []
    passed(run("controls-baseline-types", focused))
    for control in controls:
        name = control["name"]
        test = control["test"]
        command = [*behavior, "--test-name-pattern", "^" + re.escape(test) + "$"]
        passed(run(name + "-baseline", command), test)
        path = stage / control["file"]
        original = path.read_text()
        changed = original
        for replacement in control["replacements"]:
            assert changed.count(replacement["before"]) == 1, "control-anchor-not-exact"
            changed = changed.replace(replacement["before"], replacement["after"])
        path.write_text(changed)
        passed(run(name + "-mutant-types", focused))
        failed = run(name + "-mutant-behavior", command)
        failure_text = (failed.stdout + failed.stderr).decode("utf8", errors="replace")
        assert failed.returncode != 0 and re.search(r"\(fail\)[^\n]*" + re.escape(test), failure_text), "control-did-not-fail-observable-assertion"
        path.write_text(original)
        passed(run(name + "-restored-types", focused))
        passed(run(name + "-restored-behavior", command), test)
        receipts.append({"name": name, "assertion": control["assertion"], "status": "compiled-failed-behavior-restored"})
    passed(run("all-restored-behavior", behavior))
    (out / "control-receipts.json").write_text(json.dumps(receipts, indent=2) + "\n")

for name, entry in manifest["entries"].items():
    if not entry.get("identityOnly"):
        assert identity(stage / name) == entry, "restored-source-identity"
assert shutil.disk_usage(out).free >= 2 * 1024**3, "free-space-floor"
(out / "result.json").write_text(json.dumps({"mode": args.mode, "status": "pass", "sourceTree": manifest["sourceTree"],
                                             "commands": len(commands), "allDirectChildrenWaited": True}, indent=2) + "\n")
print(json.dumps({"mode": args.mode, "status": "pass", "record": str(out / "result.json")}))
