# Unapplied adjoining proposals

The accepted picker model and source remain unchanged. These proposals carry no acceptance credit.

1. Expose the initial listing phase and its failure through a typed model read state. `ListStatus` currently exposes a timestamp and refresh flags, so a renderer cannot distinguish an unanswered cache read from a completed initial failure. This candidate shows conservative unavailable data and handles the actual result of an explicit refresh.
2. Preserve confirmed creation identity when choose-mode selection is refused. For an empty chooser creation, the accepted model can return `Refused` after it has created the playlist. That outcome lacks the created ID. This candidate passes the refusal through and keeps the form visible. It never invents a creation receipt.
3. Expose the device visibility preference outcome if a later container needs to claim that preference was kept. The accepted model starts that write without returning its result. This renderer makes no persistence claim.
4. Resolve nullable cache listing timestamps in the separate accepted-source adaptation. This renderer does not fabricate a freshness stamp or change the `Listing` contract.

The real `PickerSource` bridge and first-run owner must establish one destination commit owner. A source that commits a choice cannot also return a proposal that the existing first-run owner commits again. This is separate integration work.

The three first-pick policies were settled on 2026-11-01 (R171 to R173) and are applied in `PickerModel` and the renderer.
