# Music ad transport authoring

The authored transport admits one fixed `music-ad` detail only for an unavailable `nowPlaying` failure. The generic and page result guards share the same job-aware admission. PageLink retains the validated detail and continues to discard ordinary free-form status text. Successes and streams retain `NowPlaying | null`.

The parser validates all supplied ad flags before choosing evidence. `adShowing === true` takes precedence over `adActive === true`, followed by `presentingPlayerType === 2`. Malformed flags, conflicting player and queue identities, ambiguous selected rows and malformed playback data remain unavailable. An explicit ad with `metadata: null` and an empty queue remains an ad. Absent metadata or queue still receives a missing-data diagnosis. No metadata absence implies an ad.

The gateway treats a recognized ad as a valid failure reading. It does not report that reading as a missing or unrecognised route. The existing stream guard refuses the failure reading, so an ad emits neither a song nor null. A later owned event resumes ordinary song publication. The live reader's native event ownership and player replacement code remain unchanged.

`wire.bun-test.ts` composes the actual live reader, gateway, result guards, servePage, direct and DOM page channels, PageLink and Music Items. Synthetic IO and corrupt-wire injections remain unexecuted. The fixture exposes serialized answers so a future test can distinguish transport loss from consumer inference. Ordinary results retain their existing projection. Both current playback and selected queue ad results recheck freshness before producing `ad-playing`.

`type-probes.json` contains new intended-line negatives. `final-type-probes.json` and `final-controls.json` retain every Music, Pointer/Keys and www case with final source identities. `anchor-relocations.json` records changed anchors and replacements. The original 28 Music negatives and eleven controls, Pointer 21/6 and www 21/8 inventories remain byte-identical. The nineteen-line independent golden remains exact.

`unexecuted-gates.json` describes the future execution boundary and every inherited gate. A later executor needs explicit transfer of the sole runtime lease and separate dummy-fixture proof of the frozen boundary. No execution launcher is supplied. Every Bun invocation and descendant must use `--no-env-file` and `--no-install`, pinned executables and PATH, a cleared environment, scratch HOME and TMPDIR, closed stdin, a bounded deadline, recorded child identity and an explicit wait. Existing historical drivers do not satisfy this requirement.

Both scoped and whole-source native compilers, actual inclusion, DOM composition, contracts, channel, PageLink, gateway, consumers, controls, builds and browser assertions are unexecuted. Mutation proposals are intended to compile. Compilation and sensitivity remain unproven until their full baseline, mutation, restoration and restored-baseline sequences run.

Live-site grounding, successful queue actions, native guarantees, privacy wording, rendering and axe, three picker policies and activation remain held. This scoped authoring return does not complete 2.0. Review and a PR were not requested.
