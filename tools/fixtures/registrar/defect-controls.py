#!/usr/bin/env python3
"""Emit source patches for later leased compilation and behavioral qualification."""
from pathlib import Path
import argparse
import difflib
import hashlib
import json


def emit(root: Path, output: Path) -> None:
    target = "src/background/registrar/registrar.ts"
    original = (root / target).read_text()
    controls = [
        ("forget-intervening-change", [("while (!disposed && completed < requested)", "if (!disposed && completed < requested)")], "owner change arriving during register"),
        ("trust-registration-resolution", [("scripts.some(script => !after.scripts.some(actual => same(actual, script)))", "false")], "resolved partial registration"),
        ("repeat-current-build", [("if (loaded(inspected, file, ports)) continue", "if (false) continue")], "repeated ensure leaves settings unchanged"),
        ("reverse-injection-order", [("for (const file of files)", "for (const file of [...files].reverse())")], "open tabs run page, core, kit and feature"),
        ("reverse-tab-priority", [("priority(a) - priority(b) || b.lastAccessed - a.lastAccessed", "priority(b) - priority(a) || a.lastAccessed - b.lastAccessed")], "open tabs run page, core, kit and feature"),
        ("bypass-consent", [
            ('if (!snapshot.owner.consent) refuse("consent")', 'if (false) refuse("consent")'),
            ('if (!state.owner.consent) refuse("consent")', 'if (false) refuse("consent")')
        ], "consent and supported schema gate ensure")
    ]
    output.mkdir(parents=True, exist_ok=True)
    records = []
    for name, changes, witness in controls:
        changed = original
        for before, after in changes:
            if changed.count(before) != 1:
                raise SystemExit("control anchor changed: " + name)
            changed = changed.replace(before, after, 1)
        patch = "".join(difflib.unified_diff(original.splitlines(keepends=True), changed.splitlines(keepends=True), fromfile="a/" + target, tofile="b/" + target))
        path = output / (name + ".patch")
        path.write_text(patch)
        records.append({"name": name, "target": target, "sourceSha256": hashlib.sha256(original.encode()).hexdigest(),
                        "mutatedSha256": hashlib.sha256(changed.encode()).hexdigest(), "patchSha256": hashlib.sha256(patch.encode()).hexdigest(),
                        "witness": witness, "status": "unexecuted"})
    (output / "manifest.json").write_text(json.dumps(records, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    emit(args.root, args.output)
