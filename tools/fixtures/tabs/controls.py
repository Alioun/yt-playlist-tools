#!/usr/bin/env python3
"""Run one authored behavior control only under a later runtime lease."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import signal
import subprocess


def digest(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--runtime-lease", action="store_true", required=True)
    parser.add_argument("--control", required=True)
    parser.add_argument("--node", type=Path, required=True)
    parser.add_argument("--compiler", type=Path, required=True)
    parser.add_argument("--bun", type=Path, required=True)
    parser.add_argument("--timeout", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[3]
    controls = json.loads(Path(__file__).with_name("controls.json").read_text())
    control = next(item for item in controls if item["id"] == args.control)
    source = root / control["path"]
    original = source.read_bytes()
    mode = source.stat().st_mode & 0o777
    if digest(original) != control["baselineSha256"]:
        raise SystemExit("Control source differs from its authored identity")
    if original.count(control["before"].encode()) != 1:
        raise SystemExit("Control replacement is not unique")
    args.output.mkdir(parents=True, exist_ok=False)
    records = []

    def run(name, argv, seconds, expected):
        command = [str(args.timeout), "-k", "10", str(seconds), *map(str, argv)]
        with (args.output / (name + ".log")).open("wb") as output:
            result = subprocess.run(command, cwd=root, env={}, stdin=subprocess.DEVNULL,
                                    stdout=output, stderr=subprocess.STDOUT, timeout=seconds + 20)
        record = {"name": name, "command": command, "exitCode": result.returncode}
        records.append(record)
        (args.output / "commands.json").write_text(json.dumps(records, indent=2) + "\n")
        if result.returncode == 124:
            raise RuntimeError("The command hit its deadline")
        if expected == "pass" and result.returncode != 0:
            raise RuntimeError(name + " did not pass")
        if expected == "fail" and result.returncode != 1:
            raise RuntimeError(name + " did not report a behavior failure")

    compiler = [args.node, args.compiler, "--noEmit", "--pretty", "false", "-p", "tools/fixtures/tabs/tsconfig.json"]
    tests = [args.bun, "--no-env-file", "--no-install", "--conditions=browser", "test", "src/background/tabs/tabs.bun-test.ts",
             "src/background/tabs/owner.bun-test.ts", "src/background/store/session-memory.bun-test.ts",
             "--test-name-pattern", "^" + re.escape(control["testName"]) + "$"]
    def stop(*_):
        raise KeyboardInterrupt()

    signal.signal(signal.SIGTERM, stop)
    changed = False
    try:
        run("baseline-compiler", compiler, 120, "pass")
        run("baseline-behavior", tests, 30, "pass")
        source.write_bytes(original.replace(control["before"].encode(), control["after"].encode(), 1))
        source.chmod(mode)
        changed = True
        run("control-compiler", compiler, 120, "pass")
        run("control-behavior", tests, 30, "fail")
    finally:
        if changed:
            source.write_bytes(original)
            source.chmod(mode)
        if source.read_bytes() != original or source.stat().st_mode & 0o777 != mode:
            raise RuntimeError("Exact source restoration failed")
        (args.output / "restoration.json").write_text(json.dumps({"sha256": digest(original), "mode": oct(mode), "exact": True}) + "\n")
    run("restored-behavior", tests, 30, "pass")
    print(json.dumps({"control": control["id"], "state": "compiled-behavior-failed-restored-pass", "sourceRestored": True}))


if __name__ == "__main__":
    main()
