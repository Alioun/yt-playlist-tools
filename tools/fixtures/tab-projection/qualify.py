#!/usr/bin/env python3
import argparse
import hashlib
import json
from pathlib import Path
import re
import signal
import subprocess
import sys

parser = argparse.ArgumentParser()
parser.add_argument("--runtime-lease", action="store_true", required=True)
mode = parser.add_mutually_exclusive_group(required=True)
mode.add_argument("--control")
mode.add_argument("--negative", type=int)
parser.add_argument("--node", required=True)
parser.add_argument("--compiler", required=True)
parser.add_argument("--bun", required=True)
parser.add_argument("--timeout", required=True)
parser.add_argument("--output", required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[3]
out = (root / args.output).resolve()
out.relative_to(root / ".audit")
out.mkdir(parents=True, exist_ok=False)
receipts = []
saved = {}
active = None

def interrupted(signum, frame):
    raise InterruptedError("Qualification interrupted")

signal.signal(signal.SIGTERM, interrupted)
signal.signal(signal.SIGINT, interrupted)

def remember(path):
    target = root / path
    if path not in saved:
        saved[path] = (target.read_bytes(), target.stat().st_mode & 0o777)
    return target

def execute(label, command, seconds):
    global active
    argv = [args.timeout, "-k", "10", str(seconds), *command]
    active = subprocess.Popen(argv, cwd=root, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    pid = active.pid
    try:
        stdout, _ = active.communicate()
    except BaseException:
        active.terminate()
        try:
            stdout, _ = active.communicate(timeout=5)
        except subprocess.TimeoutExpired:
            active.kill()
            stdout, _ = active.communicate()
        raise
    finally:
        if active.poll() is not None:
            active.wait()
    code = active.returncode
    active = None
    (out / (label + ".log")).write_bytes(stdout)
    receipts.append({"label": label, "argv": argv, "pid": pid, "reaped": True, "exit": code})
    if code == 124:
        raise TimeoutError(label + " reached its deadline")
    return code, stdout.decode("utf-8", errors="replace")

compiler = [args.node, args.compiler, "--noEmit", "--pretty", "false", "-p", "tools/fixtures/tab-projection/tsconfig.json"]
status = "failed"
failure = None
try:
    code, _ = execute("baseline-compiler", compiler, 90)
    if code:
        raise RuntimeError("Baseline compiler did not pass")
    if args.control:
        controls = json.loads((root / "tools/fixtures/tab-projection/controls.json").read_text())["controls"]
        row = next(item for item in controls if item["id"] == args.control)
        test = [args.bun, "--no-env-file", "--no-install", "--conditions=browser", "test", row["file"], "-t", row["test"]]
        code, _ = execute("baseline-behavior", test, 30)
        if code:
            raise RuntimeError("Baseline behavior did not pass")
        for edit in row["edits"]:
            target = remember(edit["path"])
            source = target.read_text()
            if source.count(edit["before"]) != 1:
                raise RuntimeError("Control source anchor differs")
            target.write_text(source.replace(edit["before"], edit["after"], 1))
        code, _ = execute("mutant-compiler", compiler, 90)
        if code:
            raise RuntimeError("Control did not compile")
        code, output = execute("mutant-behavior", test, 30)
        if code == 0 or row["test"] not in output or not re.search(r"\b(fail|timed out|timeout)\b", output, re.I):
            raise RuntimeError("Control did not fail its named behavior test")
    else:
        storage_path = "src/background/store/tab-projection.type-test.ts"
        native_path = "tools/fixtures/tab-projection/native.type-test.ts"
        storage_sites = [(storage_path, index) for index, line in enumerate((root / storage_path).read_text().splitlines()) if "@ts-expect-error" in line]
        native_sites = [(native_path, index) for index, line in enumerate((root / native_path).read_text().splitlines()) if "@ts-expect-error" in line]
        path, site = (storage_sites[:6] + native_sites + storage_sites[6:])[args.negative]
        target = remember(path)
        lines = target.read_text().splitlines(keepends=True)
        del lines[site]
        target.write_text("".join(lines))
        code, output = execute("negative-compiler", compiler, 90)
        diagnostics = re.findall(r"([^\n]+)\((\d+),(\d+)\): error (TS\d+):", output)
        if code == 0 or len(diagnostics) != 1 or not diagnostics[0][0].endswith(path) or int(diagnostics[0][1]) != site + 1:
            raise RuntimeError("Negative did not fail only at its intended line")
    for path, (data, mode_bits) in saved.items():
        (root / path).write_bytes(data)
        (root / path).chmod(mode_bits)
    code, _ = execute("restored-compiler", compiler, 90)
    if code:
        raise RuntimeError("Restored compiler did not pass")
    if args.control:
        code, _ = execute("restored-behavior", test, 30)
        if code:
            raise RuntimeError("Restored behavior did not pass")
    status = "qualified"
except BaseException as error:
    failure = type(error).__name__ + ": " + str(error)
finally:
    restored = {}
    for path, (data, mode_bits) in saved.items():
        target = root / path
        target.write_bytes(data)
        target.chmod(mode_bits)
        restored[path] = {"sha256": hashlib.sha256(data).hexdigest(), "mode": oct(mode_bits),
                          "exact": target.read_bytes() == data and target.stat().st_mode & 0o777 == mode_bits}
    (out / "result.json").write_text(json.dumps({"status": status, "failure": failure, "commands": receipts, "restoration": restored}, indent=2) + "\n")
print(json.dumps({"status": status, "record": str(out / "result.json")}))
sys.exit(0 if status == "qualified" else 1)
