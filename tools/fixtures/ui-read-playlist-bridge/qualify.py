#!/usr/bin/env python3
"""Run one future, lease-authorized qualification gate with prepared public inputs."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def checked_file(root, entry):
    relative = Path(entry["path"])
    if relative.is_absolute() or ".." in relative.parts or any(part.startswith(".env") for part in relative.parts):
        raise SystemExit("Refused non-source input path")
    path = root / relative
    if path.is_symlink() or not path.is_file():
        raise SystemExit("Prepared input is not a regular file")
    mode = "100755" if path.stat().st_mode & stat.S_IXUSR else "100644"
    if digest(path) != entry["sha256"] or path.stat().st_size != entry["bytes"] or mode != entry["mode"]:
        raise SystemExit("Prepared input identity differs")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--gate", required=True)
    parser.add_argument("--inventory", type=Path, default=HERE / "gates.json")
    parser.add_argument("--lease-unit", choices=("ui-read-playlist-bridge", "ui-playlist-progressive"), default="ui-read-playlist-bridge")
    parser.add_argument("--runtime-lock", type=Path, required=True)
    parser.add_argument("--source-manifest", type=Path, required=True)
    parser.add_argument("--lease-record", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    lock = json.loads(args.runtime_lock.read_text())
    source = json.loads(args.source_manifest.read_text())
    lease = json.loads(args.lease_record.read_text())
    if not (lease.get("cacheQualified") is True and lease.get("upstreamReconciled") is True
            and lease.get("soleRuntimeLease") == args.lease_unit
            and lease.get("allBunDescendantsFlagged") is True
            and lease.get("uniqueReceiptPlan") is True
            and lease.get("sourceTree") == source["sourceTree"]):
        raise SystemExit("Qualified cache, reconciled source and the sole runtime lease are required")
    for path, entry in source["entries"].items():
        if entry.get("identityOnly"):
            continue
        checked_file(ROOT, {"path": path, **entry})
    prepared = Path(lock["preparedRoot"]).resolve()
    if lock.get("classification") != "credential-free-prepared-runtime":
        raise SystemExit("Prepared runtime classification is required")
    for entry in lock["files"]:
        checked_file(prepared, entry)
    executables = {name: str(prepared / path) for name, path in lock["executables"].items()}
    covered = {entry["path"] for entry in lock["files"]}
    actual_prepared = {str(path.relative_to(prepared)) for path in prepared.rglob("*") if path.is_file() or path.is_symlink()}
    if actual_prepared != covered:
        raise SystemExit("Complete prepared dependency inventory differs")
    if not all(path in covered for path in lock["executables"].values()):
        raise SystemExit("Every executable and tool must have a prepared identity")
    inventory = args.inventory.resolve()
    if inventory not in {HERE / "gates.json", ROOT / "tools/fixtures/ui-playlist-progressive/gates.json"}:
        raise SystemExit("Unknown qualification inventory")
    inventory_relative = str(inventory.relative_to(ROOT))
    if inventory_relative not in source["entries"]:
        raise SystemExit("Qualification inventory is outside the sealed source")
    gates = json.loads(inventory.read_text())
    gate = next((item for item in gates["gates"] if item["id"] == args.gate), None)
    if gate is None or gate.get("held"):
        raise SystemExit("Unknown or separately held gate")
    args.output.mkdir(parents=True, exist_ok=False)
    record = {"gate": args.gate, "sourceTree": source["sourceTree"], "status": "running", "commands": []}
    result_file = args.output / "result.json"
    result_file.write_text(json.dumps(record, indent=2) + "\n")
    with tempfile.TemporaryDirectory(prefix="ui-bridge-qualification-") as scratch:
        scratch_path = Path(scratch)
        task_home, task_tmp = scratch_path / "home", scratch_path / "tmp"
        task_home.mkdir(); task_tmp.mkdir()
        child_env = {"PATH": os.pathsep.join(sorted({str(Path(path).parent) for path in executables.values()})) + ":/usr/bin:/bin",
                     "HOME": str(task_home), "TMPDIR": str(task_tmp), "NO_COLOR": "1", "LC_ALL": "C"}

        def expand(command):
            return [part.format(**executables) for part in command]

        def run(command, label):
            expanded = expand(command)
            if expanded[0] == executables.get("bun") and not all(flag in expanded for flag in ("--no-env-file", "--no-install")):
                raise RuntimeError("Both Bun flags are required")
            invocation = f"{len(record['commands']) + 1:04d}-{label}"
            argv = [executables["timeout"], "-k", "10", str(gate.get("seconds", 180)), *expanded]
            result = subprocess.run(argv, cwd=ROOT, env=child_env, stdin=subprocess.DEVNULL, capture_output=True, check=False)
            (args.output / f"{invocation}.stdout").write_bytes(result.stdout)
            (args.output / f"{invocation}.stderr").write_bytes(result.stderr)
            record["commands"].append({"label": label, "receipt": invocation, "argv": argv, "exit": result.returncode})
            result_file.write_text(json.dumps(record, indent=2) + "\n")
            if result.returncode == 124:
                raise TimeoutError("Deadline hit. Do not rerun the unchanged command")
            return result

        def passing(command, label):
            result = run(command, label)
            if result.returncode != 0:
                raise RuntimeError(f"{label} failed")
            return result

        compile_command = gates["commands"]["focused-types"]
        try:
            kind = gate["category"]
            if kind in ("intended-line-negative", "compiling-behavioral-control"):
                path = ROOT / gate["path"]
                before, mode = path.read_bytes(), path.stat().st_mode
                passing(compile_command, "baseline-types")
                if kind == "compiling-behavioral-control":
                    passing(gate["testCommand"], "baseline-behavior")
                timed_out = False
                try:
                    text = before.decode()
                    if kind == "intended-line-negative":
                        lines = text.splitlines(keepends=True)
                        index = gate["annotationLine"] - 1
                        if gate["annotation"] not in lines[index]:
                            raise RuntimeError("Intended-line annotation moved")
                        lines[index] = lines[index].replace("@ts-expect-error", "type-negative-removed", 1)
                        path.write_text("".join(lines))
                        result = run(compile_command, "negative-types")
                        output = (result.stdout + result.stderr).decode(errors="replace")
                        diagnostics = re.findall(r"([^\n]+\.tsx?)\((\d+),(\d+)\): error TS\d+:", output)
                        if result.returncode == 0 or not diagnostics or any(
                            not file.replace("\\", "/").endswith(gate["path"]) or int(line) != gate["intendedLine"]
                            for file, line, _column in diagnostics
                        ):
                            raise RuntimeError("Negative did not fail only at its intended line")
                    else:
                        for replacement in gate["replacements"]:
                            if text.count(replacement["before"]) != 1:
                                raise RuntimeError("Control target differs")
                            text = text.replace(replacement["before"], replacement["after"], 1)
                        path.write_text(text)
                        passing(compile_command, "mutant-types")
                        result = run(gate["testCommand"], "mutant-behavior")
                        output = (result.stdout + result.stderr).decode(errors="replace")
                        if result.returncode == 0 or gate["testName"] not in output or gate["failureNeedle"] not in output:
                            raise RuntimeError("Compiling mutant did not fail its named behavior assertion")
                except TimeoutError:
                    timed_out = True
                    raise
                finally:
                    path.write_bytes(before); path.chmod(stat.S_IMODE(mode))
                    if path.read_bytes() != before or path.stat().st_mode != mode:
                        raise RuntimeError("Exact source restoration failed")
                    if not timed_out:
                        passing(compile_command, "restored-types")
                        if kind == "compiling-behavioral-control":
                            passing(gate["testCommand"], "restored-behavior")
            elif kind == "consumer-eof":
                first = passing(gate["command"], "consumer-1").stdout
                second = passing(gate["command"], "consumer-2").stdout
                if first != second or not first.endswith(b"\n") or first.endswith(b"\n\n"):
                    raise RuntimeError("Consumer bytes differ or final LF is wrong")
                decoded = json.loads(first)
                if not isinstance(decoded, list) or decoded[-1].get("case") != "eof":
                    raise RuntimeError("Complete consumer EOF record is missing")
                record["outputSha256"] = hashlib.sha256(first).hexdigest()
            else:
                result = passing(gate["command"], "gate")
                if kind == "file-inclusion":
                    included = {line.strip().replace("\\", "/") for line in result.stdout.decode().splitlines()}
                    if any(not any(line.endswith("/" + path) for line in included) for path in gates["requiredInclusion"]):
                        raise RuntimeError("Required source file omitted from native TypeScript")
            record["status"] = "passed"
        except BaseException as error:
            record["status"] = "failed"
            record["reason"] = str(error)
            raise
        finally:
            result_file.write_text(json.dumps(record, indent=2) + "\n")


if __name__ == "__main__":
    main()
