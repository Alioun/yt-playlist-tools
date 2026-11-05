# AddFlow session fixture

`run.ts` drives two sequential real AddFlow engines and one private window through the actual canonical owner (`createLocalFilterWriter`) over the account-removal fixture's local and session areas. Each line prints the report and the session-area call names that step made. Private steps show reads only. The first engine creates its gather before the 429 hold. The restarted engine observes the hold, then undoes the gather after its deadline. Normal session records retain the external skip and recent-add facts.

The credential-free qualification ran the 13 observations twice and compared exact output through EOF. Evidence is in `.audit/setup-session-qualification/consumer-equality.json`. Focused owner and adapter tests separately assert complete storage arguments and records.

The runtime lease holder can run `timeout -k 10 120 bun --no-env-file --no-install tools/fixtures/add-flow-session/run.ts` twice and compare the outputs through EOF. Synthetic ports prove no real native storage, YouTube request or worker restart.
