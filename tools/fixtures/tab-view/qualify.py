"""Synthetic qualification requires the audited launcher in this isolated checkout."""
from pathlib import Path
import runpy

launcher = Path(__file__).resolve().parents[3] / ".audit/full-tab-view-qualification-20261029/qualify.py"
if not launcher.is_file():
    raise SystemExit("qualified-launcher-not-present")
runpy.run_path(str(launcher), run_name="__main__")
