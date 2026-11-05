# Losses of untracked build data

## 2026-10-30

An external cleanup deleted the original 2.0 audit folder. The source was reconstructed from surviving bytes, and the original test receipts were lost. The record of that loss, `audit-loss-20261030.json`, was itself lost on 2026-11-01.

## 2026-11-01, about 17:17 local

Untracked `.audit` folders and the restored `node_modules` were deleted from `t3-8e91ff1c` and from every 2.0 and task worktree the coordinator checked (`t3-2.0-compose`, `t3-2.0-fix-settings-fixtures`, `t3-8d212112`, `t3-4285b8f4`, `t3-f44e8980`). Git branches, commits and `.recovery` survived.

Lost:
- the build ledger: `status.json`, `decisions.tsv`, `units.tsv`, the grilling decision record;
- the seal verifier, the composition script and the shared fix brief;
- every compile and gate result from 2026-11-01, including a full test run in progress;
- the authoring reports and seals in `t3-8d212112`, `t3-4285b8f4` and `t3-f44e8980`.

Cause: not found. Nothing in the repository deletes outside its own tree. Of the four disk-cleanup sessions open at the time, three replied that they deleted nothing there: `2026-10-21-i-want-to-clean-up-915893fe-72`, `2026-10-23-space-is-full-again-clean-12d-78` and `2026-10-23-space-is-full-again-clean-12d-f6`. The message to `2026-10-28-cleanup-pass-cause-disk-space-b6` was held by that session and not delivered.

Recovery:
- The owner approved reinstalling the same 39 locked packages, the same way as the first restore. `bun.lock` matched sha256 `2d6baabd…`, and 773 packages installed with exit 0.
- The owner chose to keep this ledger committed on `2.0/compose-units`.
