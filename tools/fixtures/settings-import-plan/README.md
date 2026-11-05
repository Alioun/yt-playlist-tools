# Deferred import plan evidence

The specimens call the actual file parser. Expected documents, tombstones and session records are authored independently of the planner. `expectedDocumentOrder` fixes the whole deterministic batch. `consumer.ts` compares complete documents and cleanup, runs actual preparation and independently repeats canonical sync admission against expected documents. It never obtains expected documents by calling the planner a second time.

The consumer's expected two-line stdout is authored, not observed. Runtime byte counts are not claimed. The sync tests construct and encode actual documents and use canonical projection for serialized sizes and physical address charges. The quota control proves each account partition fits while the complete import refuses.

The type test places one expected error on each intended line for mixed keys, unsupported provenance, an empty document batch, executable refusal and remote facts in the off variant. A future gate must establish the baseline compiler pass and remove one directive at a time to confirm the exact diagnostic line.

`controls.json` describes six proposed mutants that are intended to compile. Each has exact replacement text, a compiler gate and one named observable red assertion. Compilation and red behavior remain unexecuted. Apply mutants only in separate complete sealed copies, never to the authored source or prior evidence.

All future execution needs the coordinator's sole runtime lease. The future launcher is `.audit/settings-import-plan-authoring/future_gates.py`. It is authored and unexecuted. No compiler, Bun, product import, consumer, guard, test, build or launcher ran during this unit.
