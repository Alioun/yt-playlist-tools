Tests for **flat** entrypoint files live here rather than beside their source.

WXT auto-discovers every flat file in `src/entrypoints/` as an entrypoint, so
`src/entrypoints/background.test.ts` would register a second entrypoint named
`background` and fail the build with "Multiple entrypoints with the same name".

Tests for *directory* entrypoints (`popup/`, `options/`) are unaffected and stay
co-located, because only the directory's `index` file is an entrypoint.
