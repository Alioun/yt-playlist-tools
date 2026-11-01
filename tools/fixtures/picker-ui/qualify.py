"""Future runtime executor only. This authoring unit does not execute this file."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import time

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
PINS = json.loads((HERE / "dependency-pins.json").read_text())
EXEC = {name: value["path"] for name, value in PINS["executables"].items()}
NEGATIVES = {"FakeModel": 6, "OutcomeReceipt": 6, "SharedModel": 7, "RawAccount": 6,
             "ManyWithItem": 4, "Uncontrolled": 6, "MissingRelease": 6}
GATE = sys.argv[1] if len(sys.argv) == 2 else ""
if not re.fullmatch(r"[a-zA-Z0-9-]+", GATE):
    raise SystemExit("E_GATE_NAME")
OUT = ROOT / ".audit/picker-ui-runtime" / GATE
OUT.mkdir(parents=True, exist_ok=False)
TASK_HOME = OUT / "home"
TASK_TMP = OUT / "tmp"
TASK_HOME.mkdir()
TASK_TMP.mkdir()
ENV = {"HOME": str(TASK_HOME), "TMPDIR": str(TASK_TMP), "PATH": "/usr/bin:/bin",
       "LANG": "en_US.UTF-8", "LC_ALL": "en_US.UTF-8", "TZ": "UTC", "CI": "1",
       "NO_COLOR": "1", "PYTHONDONTWRITEBYTECODE": "1"}

def verify_pins():
    for record in [*PINS["executables"].values(), *PINS["packages"].values()]:
        if record.get("available") is False:
            continue
        path = Path(record["path"])
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != record["sha256"]:
            raise RuntimeError("E_PIN_CHANGED")
    # File names alone suffice. No environment-file bytes are opened.
    for path in ROOT.iterdir():
        if path.name == ".env" or path.name.startswith(".env."):
            raise RuntimeError("E_ENVIRONMENT_FILE_PRESENT_USE_SEALED_NON_ENV_SOURCE")

def run(label, argv, bound=120):
    if not 1 <= bound <= 540:
        raise RuntimeError("E_BOUND")
    command = [EXEC["timeout"], "-k", "10", str(bound), *map(str, argv)]
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    start = time.monotonic()
    with (OUT / (label + ".stdout")).open("wb") as stdout, (OUT / (label + ".stderr")).open("wb") as stderr:
        child = subprocess.Popen(command, cwd=ROOT, env=ENV, stdin=subprocess.DEVNULL,
                                 stdout=stdout, stderr=stderr, start_new_session=True)
        try:
            status = child.wait(timeout=bound + 15)
        except subprocess.TimeoutExpired:
            os.killpg(child.pid, signal.SIGTERM)
            try:
                status = child.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(child.pid, signal.SIGKILL)
                status = child.wait(timeout=10)
        try:
            os.killpg(child.pid, 0)
            remains = True
        except ProcessLookupError:
            remains = False
        if remains:
            try:
                os.killpg(child.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        try:
            os.killpg(child.pid, 0)
            remains_after_cleanup = True
        except ProcessLookupError:
            remains_after_cleanup = False
        record = {"argv": command, "cwd": str(ROOT), "startedAt": started,
                  "elapsedSeconds": time.monotonic() - start, "pid": child.pid, "exitCode": status,
                  "waited": True, "ownedGroupAbsentAfterWait": not remains,
                  "ownedGroupAbsentAfterCleanup": not remains_after_cleanup,
                  "environment": ENV, "runtimeLeaseRequired": True}
    (OUT / (label + ".json")).write_text(json.dumps(record, indent=2) + "\n")
    if status == 124 or remains:
        raise RuntimeError("E_DEADLINE_OR_OWNED_DESCENDANT_REMAINS_NO_UNCHANGED_RERUN")
    return status, (OUT / (label + ".stdout")).read_text(errors="replace"), (OUT / (label + ".stderr")).read_text(errors="replace")

def require_success(label, argv, bound=120):
    result = run(label, argv, bound)
    if result[0] != 0:
        raise RuntimeError("E_GATE_FAILED_SEE_RECORDED_OUTPUT")
    return result

def svelte(label, config):
    cache = ROOT / ".svelte-check"
    if cache.exists():
        shutil.move(str(cache), str(OUT / (label + "-prior-cache")))
    result = run(label, [EXEC["node"], ROOT / "node_modules/svelte-check/bin/svelte-check",
                         "--workspace", ROOT, "--tsconfig", config, "--output", "machine-verbose", "--fail-on-warnings"])
    if cache.exists():
        shutil.move(str(cache), str(OUT / (label + "-cache")))
    return result

verify_pins()
module_link = ROOT / "node_modules"
if GATE == "prepare":
    if module_link.exists() and module_link.resolve() != Path(PINS["preparedModules"]).resolve():
        raise RuntimeError("E_DIFFERENT_PREPARED_DEPENDENCIES")
    if not module_link.exists():
        module_link.symlink_to(PINS["preparedModules"], target_is_directory=True)
    require_success("wxt-prepare", [EXEC["node"], ROOT / "node_modules/wxt/bin/wxt.mjs", "prepare"])
elif GATE == "focused":
    require_success("focused", [EXEC["bun"], "--no-env-file", "--no-install", "test", "--conditions=browser", "src/ui/picker/picker.bun-test.ts"])
elif GATE in ["native", "inclusion"]:
    argv = [EXEC["node"], ROOT / "node_modules/@typescript/native/bin/tsc", "--project", ROOT / "tsconfig.json", "--noEmit", "--pretty", "false", "--resolveJsonModule"]
    if GATE == "inclusion":
        argv.append("--listFilesOnly")
    result = require_success(GATE, argv)
    if GATE == "inclusion":
        wanted = [*ROOT.glob("src/**/*.type-test.ts"), *ROOT.glob("src/ui/picker/*.ts"), HERE / "run.ts"]
        listed = {Path(line).resolve() for line in result[1].splitlines() if line.strip()}
        missing = [str(path.relative_to(ROOT)) for path in wanted if path.resolve() not in listed]
        (OUT / "inclusion.json").write_text(json.dumps({"missing": missing, "requiredCount": len(wanted)}, indent=2) + "\n")
        if missing:
            raise RuntimeError("E_NATIVE_INCLUSION")
elif GATE == "svelte":
    if svelte("positive", HERE / "tsconfig.json")[0] != 0:
        raise RuntimeError("E_SVELTE_POSITIVE")
elif GATE.startswith("negative-"):
    name = GATE.removeprefix("negative-")
    if name not in NEGATIVES:
        raise RuntimeError("E_NEGATIVE_NAME")
    if svelte("positive", HERE / "tsconfig.json")[0] != 0:
        raise RuntimeError("E_POSITIVE_BLOCKS_NEGATIVE")
    config = json.loads((HERE / "tsconfig.json").read_text())
    config["include"] = [str((HERE / path).resolve()) for path in config["include"]]
    negative = HERE / "negatives" / (name + ".svelte")
    config["include"].append(str(negative))
    config_path = OUT / "negative.tsconfig.json"
    config_path.write_text(json.dumps(config, indent=2) + "\n")
    status, stdout, stderr = svelte("intended-negative", config_path)
    diagnostics = []
    for line in stdout.splitlines():
        match = re.match(r"^\d+ (\{.*\})$", line)
        if match:
            item = json.loads(match.group(1))
            if item.get("type") in ["ERROR", "WARNING"]:
                diagnostics.append(item)
    if status == 0 or len(diagnostics) != 1 or diagnostics[0]["type"] != "ERROR" or diagnostics[0]["filename"].replace("\\", "/").split("/")[-1] != negative.name or diagnostics[0]["start"]["line"] + 1 != NEGATIVES[name]:
        raise RuntimeError("E_INTENDED_LINE_NEGATIVE")
    (OUT / "intended-diagnostic.json").write_text(json.dumps(diagnostics, indent=2) + "\n")
elif GATE == "architecture":
    require_success("architecture", [EXEC["bun"], "--no-env-file", "--no-install", "test", "--conditions=browser", "tests/guards/architecture.test.ts"])
elif GATE == "adjacent":
    require_success("adjacent", [EXEC["bun"], "--no-env-file", "--no-install", "test", "--conditions=browser",
        "src/shared/picker/model.bun-test.ts", "src/shared/picker/consumer.bun-test.ts",
        "src/shared/i18n/i18n.bun-test.ts", "src/shared/copy/toast.bun-test.ts",
        "src/ui/components/components.bun-test.ts", "src/ui/onboarding/first-run.bun-test.ts",
        "tools/fixtures/localization/run.bun-test.ts", "tools/fixtures/localization/qualification.bun-test.ts"], 180)
elif GATE in ["consumer-1", "consumer-2"]:
    result = require_success(GATE, [EXEC["bun"], "--no-env-file", "--no-install", "--conditions=browser",
        "--preload", "./tests/setup/svelte.ts", "--preload", "./tests/setup/happydom.ts", "run", HERE / "run.ts"])
    if result[1].encode() != (HERE / "expected-consumer.jsonl").read_bytes():
        raise RuntimeError("E_CONSUMER_BYTES")
    other = ROOT / ".audit/picker-ui-runtime" / ("consumer-1" if GATE == "consumer-2" else "consumer-2") / (("consumer-1" if GATE == "consumer-2" else "consumer-2") + ".stdout")
    if other.exists() and other.read_bytes() != result[1].encode():
        raise RuntimeError("E_CONSUMER_REPEAT")
elif GATE in ["chrome", "firefox"]:
    require_success(GATE, [EXEC["node"], ROOT / "node_modules/wxt/bin/wxt.mjs", "build", HERE, "-b", GATE], 180)
elif GATE == "built-fixtures":
    require_success(GATE, [EXEC["node"], HERE / "check-build.mjs"])
elif re.fullmatch(r"(render|axe)-(chromium|firefox)-(light|dark)", GATE):
    mode, engine, theme = GATE.split("-")
    if mode == "axe" and PINS["packages"]["axe-core"].get("available") is False:
        raise RuntimeError("E_AXE_UNAVAILABLE_NO_INSTALL_AUTHORIZED")
    require_success(GATE, [EXEC["node"], HERE / "check-browser.mjs", engine, theme, mode, OUT], 240)
else:
    raise RuntimeError("E_UNKNOWN_GATE")
(OUT / "result.json").write_text(json.dumps({"gate": GATE, "passed": True, "scope": "recorded gate only"}) + "\n")
print(json.dumps({"gate": GATE, "passed": True, "evidence": str(OUT)}))
