# Environment files

[← Development](README.md)

All gitignored; copy from the `.example` next to each. None is needed for `bun run dev`.

| File | Contents |
| --- | --- |
| [`.env`](../../.env.example) | Build-time broker URL ([token broker](../legacy/token-broker.md#using-a-different-broker)) |
| [`server/.env`](../../server/.env.example) | Google OAuth client, broker settings ([token broker](../legacy/token-broker.md)) |
| [`.env.submit`](../../.env.submit.example) | Chrome Web Store and AMO credentials ([releasing](releasing.md)) |

The first two go away with the token broker in 2.0 ([legacy](../legacy/README.md)).
