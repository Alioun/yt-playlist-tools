# 2.0 planning

[← Docs](../README.md)

2.0 is a ground-up rebuild that keeps every 1.5.0 capability and adds YouTube Music quick actions. It works through the user's own signed-in YouTube session, puts UI/UX first, and every part of it is a feature the user can switch off. It's fully planned and not yet built.

**Start here:** the [2.0 spec](../../.scratch/rebuild/spec.md): scope, principles, stack, decisions and open items.

## Spec chapters

| # | Chapter | Covers |
| --- | --- | --- |
| 02 | [YouTube capabilities](../../.scratch/rebuild/spec/02-youtube.md) | Auto-add, channel filters, the add flow, the picker, shortcuts, quick-save, Add to queue, the watch-page button, the card menu |
| 03 | [YouTube Music capabilities](../../.scratch/rebuild/spec/03-youtube-music.md) | Quick actions and their keys, queue moves, Save to playlist, Playing now |
| 04 | [Features, accounts and data](../../.scratch/rebuild/spec/04-features-accounts-data.md) | The feature model, consent, account setups, settings sync, storage, breakage status |
| 05 | [UI](../../.scratch/rebuild/spec/05-ui.md) | Popup, settings, first run, in-page controls on both sites, toasts, brand, design rules |
| 06 | [Architecture](../../.scratch/rebuild/spec/06-architecture.md) | YouTube access, manifest and permissions, modules, the gateway, bundles, messaging |
| 07 | [Quality](../../.scratch/rebuild/spec/07-quality.md) | Tooling, test layers, fixtures, breakage detection, performance budgets, CI |
| 08 | [Upgrade and release](../../.scratch/rebuild/spec/08-release.md) | The 1.4.5 migration, consent, betas, store listings, privacy policy, workflows |
| 09 | [Parity and defects](../../.scratch/rebuild/spec/09-parity.md) | Every 1.5.0 capability and friction item mapped to 2.0, plus what's new |
| | [Resolutions](../../.scratch/rebuild/spec/resolutions.md) | Every conflict settled during and after assembly (R1–R83) |

## Behind the spec

- [Map](../../.scratch/rebuild/map.md): the planning map and its tickets
- [Tickets](../../.scratch/rebuild/issues/): the reasoning, runner-ups and full tables
- [Inventory](../../.scratch/rebuild/inventory.md): 1.5.0's behaviour, YouTube usage and friction
- [Waiting on the user](../../.scratch/rebuild/for-the-user.md): the open decisions

## In this section

- [Decisions](decisions.md): one line per ADR
- [Glossary](glossary.md): the domain vocabulary
- [Research](research.md): one line per research note
- [Prototypes](prototypes.md): screenshot galleries and the live-check probe
