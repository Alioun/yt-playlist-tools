"""Deferred lease-holder checks. Authoring does not execute this program."""
import argparse
import hashlib
import json
import pathlib
import re
import subprocess
import tempfile

parser = argparse.ArgumentParser()
parser.add_argument("mode", choices=["eof", "negatives", "controls"])
parser.add_argument("--dependencies", type=pathlib.Path)
parser.add_argument("--manifest", type=pathlib.Path, required=True)
args = parser.parse_args()
root = pathlib.Path(__file__).resolve().parents[3]
out = root / ".audit/gateway-runtime"
out.mkdir(parents=True, exist_ok=True)


def run(command, directory, seconds=45):
    result = subprocess.run(["timeout", "-k", "10", str(seconds), *command], cwd=directory,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=seconds + 15)
    assert result.returncode != 124, "Child deadline hit; do not rerun unchanged"
    return result


def stage(destination):
    manifest = json.loads(args.manifest.read_text())
    assert args.dependencies is not None and args.dependencies.is_dir(), "Prepared dependencies are required"
    for name, entry in manifest["entries"].items():
        if entry.get("identityOnly"):
            continue
        data = (root / name).read_bytes()
        assert hashlib.sha256(data).hexdigest() == entry["sha256"], name
        assert len(data) == entry["bytes"], name
        assert hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest() == entry["gitBlob"], name
        assert ("100755" if (root / name).stat().st_mode & 0o111 else "100644") == entry["mode"], name
        path = destination / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        path.chmod(0o755 if entry["mode"] == "100755" else 0o644)
    (destination / "node_modules").symlink_to(args.dependencies.resolve(), target_is_directory=True)


def compile_at(directory):
    return run(["node", "node_modules/@typescript/native/bin/tsc", "--pretty", "false", "-p",
                "tools/fixtures/gateway-reads/tsconfig.json"], directory, 30)


if args.mode == "eof":
    outputs = []
    for adapter in ["direct", "direct", "dom", "dom"]:
        result = run(["bun", "--no-env-file", "tools/fixtures/gateway-reads/run.ts", adapter], root)
        assert result.returncode == 0, "Consumer failed"
        assert result.stdout.endswith(b"\n"), "Consumer lacks final newline"
        rows = result.stdout.splitlines()
        assert len(rows) == 12, "Consumer output ended early or added records"
        assert [(json.loads(row)["site"], json.loads(row)["step"]) for row in rows] == [
            (site, step) for site in ["www", "music"] for step in ["hello", "account", "target", "probe", "stream", "disposed"]]
        outputs.append(result.stdout)
    assert all(output == outputs[0] for output in outputs), "Consumer outputs differ through EOF"
    (out / "consumer.ndjson").write_bytes(outputs[0])
    report = {"check": "deterministic-eof", "status": "pass", "runs": 4, "records": 12,
              "bytes": len(outputs[0]), "sha256": hashlib.sha256(outputs[0]).hexdigest()}
elif args.mode == "negatives":
    with tempfile.TemporaryDirectory(prefix="gateway-types-", dir=out) as scratch:
        destination = pathlib.Path(scratch)
        stage(destination)
        assert compile_at(destination).returncode == 0, "Baseline typecheck failed"
        target = destination / "src/page/gateway.type-test.ts"
        original = target.read_text()
        lines = original.splitlines(keepends=True)
        cases = [(index, line.split("negative:", 1)[1].strip()) for index, line in enumerate(lines)
                 if "@ts-expect-error negative:" in line]
        assert cases, "No intended-line negatives"
        receipts = []
        for index, name in cases:
            mutated = lines.copy()
            mutated[index] = "\n"
            target.write_text("".join(mutated))
            result = compile_at(destination)
            text = (result.stdout + result.stderr).decode("utf8", errors="replace")
            diagnostics = re.findall(r"([^\n]+?)\(([0-9]+),[0-9]+\): error TS[0-9]+:", text)
            assert result.returncode != 0 and diagnostics, name
            assert all(path.replace("\\", "/").endswith("src/page/gateway.type-test.ts") and int(line) == index + 2
                       for path, line in diagnostics), (name, "Unexpected diagnostic location")
            receipts.append({"name": name, "line": index + 2, "status": "rejected-at-intended-line"})
        target.write_text(original)
        report = {"check": "intended-line-negatives", "status": "pass", "cases": receipts}
else:
    controls = [
        {"name": "wrong-player", "file": "src/page/live-reads.ts", "replacements": [
            ('case "watchPlayer": return player("movie_player")', 'case "watchPlayer": return player("inline-preview-player")')],
         "testFile": "src/page/live-reads.bun-test.ts", "test": "counting player beats an earlier inline preview"},
        {"name": "stale-navigation", "file": "src/page/gateway.ts", "replacements": [
            ('if (!locationAgrees(nav, currentId)) return undefined', 'if (false) return undefined')],
         "testFile": "src/page/gateway.bun-test.ts", "test": "navigation disagreement suppresses both stale reads"},
        {"name": "leaked-ownership", "file": "src/page/gateway.ts", "replacements": [
            ('if (slot.subscribers.size === 0) { const stop = slot.stop; slot.stop = undefined; stop?.() }',
             'if (slot.subscribers.size === 0) { const stop = slot.stop; slot.stop = undefined; void stop }')],
         "testFile": "src/page/gateway.bun-test.ts", "test": "watchers share exact ownership"},
        {"name": "accept-invalid-endpoint", "file": "src/page/gateway.ts", "replacements": [
            ('return parsed(readWatches.targetData, raw, "itemInfo", () => parseItem(raw, inAutomix))',
             'return { kind: "song", type: { kind: "unclassified" }, title: "Bypassed raw validation", selected: false, autoplay: false, hasOwnLike: false, likeState: null, endpoints: {} } satisfies import("../shared/contracts").ItemInfo')],
         "testFile": "src/page/gateway.bun-test.ts", "test": "unknown kinds and invalid native endpoint targets"},
        {"name": "diagnostic-identity-leak", "file": "src/page/gateway.ts", "replacements": [
            ('clientVersion: null, pageType:', 'clientVersion: String(page.config("DATASYNC_ID")), pageType:')],
         "testFile": "src/page/gateway.bun-test.ts", "test": "probe and diagnostics share IDs"}
    ]
    receipts = []
    for control in controls:
        with tempfile.TemporaryDirectory(prefix="gateway-control-", dir=out) as scratch:
            destination = pathlib.Path(scratch)
            stage(destination)
            command = ["bun", "test", "--no-env-file", "--isolate", "--conditions=browser", "./" + control["testFile"],
                       "--test-name-pattern", control["test"]]
            baseline = run(command, destination, 30)
            baseline_text = (baseline.stdout + baseline.stderr).decode("utf8", errors="replace")
            assert baseline.returncode == 0 and re.search(r"\(pass\)[^\n]*" + re.escape(control["test"]), baseline_text), (control["name"], "Named baseline did not pass")
            target = destination / control["file"]
            text = target.read_text()
            for before, after in control["replacements"]:
                assert text.count(before) == 1, (control["name"], "Mutation target is not unique")
                text = text.replace(before, after)
            target.write_text(text)
            result = run(command, destination, 30)
            text = (result.stdout + result.stderr).decode("utf8", errors="replace")
            assert result.returncode != 0 and re.search(r"\(fail\)[^\n]*" + re.escape(control["test"]), text), (control["name"], "Named behavior assertion did not fail")
            receipts.append({"control": control["name"], "status": "named-behavior-rejected", "baseline": "named-behavior-passed", "exitCode": result.returncode})
    report = {"check": "sensitivity-controls", "status": "pass", "cases": receipts}

(out / (args.mode + ".json")).write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report, separators=(",", ":")))
