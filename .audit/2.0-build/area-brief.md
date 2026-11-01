# Building a 2.0 area

Read `/Users/alioun/.local/src/t3-pstack/plugins/pstack/agents/poteto-agent.md` and act as it says. Don't delegate. No reviews.

**Goal.** Build Perchling for YouTube 2.0 straight through, like a greenfield project, reusing the 2.0 modules already written and tested under `src/`. No per-ticket ceremony: no fences, seals, hash manifests or ledger entries. Git history and tests are the record.

**Where.** Your task names your worktree and branch, both from `0655ecb3f` on `2.0/compose-units`. Write only there, by absolute path, and run commands there. `node_modules` is a symlink to installed packages: never commit or reinstall it. No network, push, PR or `.env` reads. Never delete untracked folders you didn't create. Use `timeout -k 10 540` for slow commands.

**Sources.** The spec is `.scratch/rebuild/spec/` (newer `resolutions.md` R-numbers override older text). The owner's answers are in `.audit/2.0-build/decisions.json` (G1 to G36). `.audit/2.0-build/build-plan.md` lists units B1 to B84 with the files each touches; use it as a map, not a checklist. `.audit/2.0-build/requirements/*.md` say what exists and what's missing per spec ID.

**Rules.**
- Reuse existing modules; wire them rather than rewrite them. Fix a module at its root when wiring exposes a bug.
- Tests assert what users and callers observe. New behavior gets a test.
- User-facing copy goes through `/Users/alioun/.local/src/t3-pstack/plugins/pstack/skills/unslop/SKILL.md` (G30, G31).
- A real product question the spec and decisions don't answer: pick the simplest safe default, note it in your report, keep going.
- Production, release activation, live YouTube checks, native behavior, rendering and axe stay held by the owner.

**Done.** Small Conventional Commits ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Before you finish: `bun run compile` reports 0 errors, the tests for code you touched pass, and `bun run test:fixtures --only <folder>` passes for fixtures you touched. Report briefly: what users can now do, commits, test counts, defaults you chose, and what's left in your area.
