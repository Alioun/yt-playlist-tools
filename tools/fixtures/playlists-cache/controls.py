"""Run a cache control through the pinned synthetic qualification launcher."""
from pathlib import Path
import argparse
import runpy

parser = argparse.ArgumentParser()
parser.add_argument("control")
parser.add_argument("--runtime-lease", required=True, choices=["coordinator-granted"])
args = parser.parse_args()
launcher = Path(__file__).resolve().parents[3] / ".audit/playlists-cache-qualification-20261029/qualify.py"
if not launcher.is_file():
    raise SystemExit("qualified-launcher-not-present")
runpy.run_path(str(launcher))["control"](args.control)
