# Can `bun test` cover a WXT extension?

Type: research
Status: open
Labels: wayfinder:research
Part of: [Rebuild (2.0)](../map.md)

## Question

The README says `bun test` can't run today's tests because it doesn't resolve WXT's imports, which is why Vitest is used. What does it take to test a WXT extension with Bun's own test runner?

- Resolving WXT's aliases (`@/`, `#imports`, auto-imports) and `import.meta.env`, including per-browser values (Chrome vs Firefox builds).
- A fake `browser` API (`@webext-core/fake-browser`, `wxt/testing`).
- DOM tests: happy-dom through `@happy-dom/global-registrator`, Testing Library.
- Module mocking and coverage.

Say what the design has to allow for, for example keeping WXT-specific imports at the edges, and what can't work. Prove it with a minimal spike on the research branch if that's cheap.
