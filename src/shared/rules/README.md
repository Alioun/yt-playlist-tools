# Channel-filter decision

`channel-filter.ts` implements YT-CF-01 through YT-CF-07 with `decide(filter, channel)`. Its inputs are the canonical `Filter` and a validated `ChannelId` or `null`. Its output is `pass`, `filtered`, or `filtered-unknown-channel`. Both filtered decisions represent the add flow's filtered-out outcome. The unknown-channel decision keeps its separate feedback reason under R26.

An absent or switched-off filter passes every channel. An allowlist passes only listed IDs and blocks unknown channels. An empty allowlist blocks every channel. A denylist blocks listed IDs and passes unknown channels. Labels and future fields have no effect on matching. The function does not modify the filter or its channel tuples.

The auto-add flow calls this rule after session skips and before membership, using the video's channel at the moment the add starts. The caller selects only filters for current auto-add playlists, leaving kept and orphaned filters untouched. Explicit adds bypass this rule.

Tests use `bun test ./src/shared/rules/channel-filter.bun-test.ts`. The root Bun discovery command needs this path added by its owner.
