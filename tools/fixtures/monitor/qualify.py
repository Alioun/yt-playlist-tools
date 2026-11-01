from pathlib import Path
import runpy
import sys
root = Path(__file__).resolve().parents[3]
launcher = root / ".audit/auto-add-monitor-qualification-20261029/probes.py"
if not launcher.is_file():
    raise SystemExit("Pinned lease-controlled qualification launcher unavailable")
sys.path.insert(0, str(launcher.parent))
runpy.run_path(str(launcher), run_name="__main__")
