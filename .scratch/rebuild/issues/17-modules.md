# What modules does the rebuild have?

Type: grilling
Status: open
Labels: wayfinder:grilling
Part of: [Rebuild (2.0)](../map.md)
Blocked by: 04, 07, 10, 16

## Question

Use `codebase-design` to design the module map: deep modules with small interfaces. Likely candidates are a YouTube gateway, the watch tracker, the add pipeline (filters and duplicates), the settings and account store, and the surfaces. Decide:
- where the seams go, so that `bun test` can cover them (see [ticket 04](04-bun-test.md));
- how WXT entrypoints stay thin;
- the folder layout.
