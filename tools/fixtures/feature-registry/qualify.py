"""Synthetic qualification uses the audited bounded launcher in this checkout."""
from pathlib import Path
import runpy
import sys

launcher = Path(__file__).resolve().parents[3] / ".audit/gateway-registry-qualification-20261029/qualify.py"
if not launcher.is_file():
    raise SystemExit("qualified-launcher-not-present")
sys.path.insert(0, str(launcher.parent))
runpy.run_path(str(launcher), run_name="__main__")
