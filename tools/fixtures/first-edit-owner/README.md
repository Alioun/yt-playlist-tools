# First-edit owner transaction fixture

Run the actual shared Store consumer without a browser.

```sh
bun --no-env-file --no-install tools/fixtures/first-edit-owner/run.ts
```

`runFirstEditOwnerFixture()` constructs the real preinitialized and starting owners with canonical synthetic storage. It calls Settings, Filter, claim, removal preparation and execution, readiness, receive, flush, start, notice acknowledgement, and disposal. Its output includes literal inputs and requests, actual result unions, complete stored state and batches, error-identity observations, counters, IO, pending transitions, and serialized restart bytes.

The cases cover absent and literal false history, old and true provenance, invalid or contradictory history, raw extensions, real pushed repairs, no-op and non-edit preservation, admission refusal, queued input mutation, detached baselines, Filter ignored and rejected writes, partial and failed readback, global uncertainty, stale driver callbacks, disposal, and fixed removal restarts. Expectations are literal values independent of the preparer. False histories are proven-state test inputs only.

This is a synthetic Store capability with production unconnected. Positive unedited initialization remains pending. No Agree, join, recovery mutation, cleanup protocol, production activation, native durability, or foreign-writer exclusion is proved. Native checks are waived and unproven.
