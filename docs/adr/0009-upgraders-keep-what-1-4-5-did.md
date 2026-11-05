# Upgraders keep what 1.4.5 did, not what its popup showed

1.4.5's settings are carried into 2.0 with the values 1.4.5 actually acted on. An unset watch percentage means 0 %, toasts are off unless set, and Ctrl keys carry over, even though 1.4.5's Ctrl check never fired. The one place where 1.4.5's popup disagreed with its behaviour is the percentage, which showed 50 % but acted at 0 %. The upgrade note asks about it once, defaulting to what 1.4.5 did.

## Considered options

- **Carry the popup's values:** that changes behaviour nobody asked to change. It's also wrong about toasts, whose checkbox 1.4.5 showed unchecked.

## Consequences

- Most upgraders keep auto-adding at 0 % unless they answer the note's question.

## Amendment (2026-10-20): upgraders whose 1.4.5 never got access

The user approved ticket 30's fix S1 (rebuild spec, R96). An upgrader whose 1.4.5 never stored a `refreshToken` never got access to their account, so 1.4.5 never added anything for them, and there's no behaviour to keep. For them, an unset percentage carries over as 50 %, the value their popup showed, and the note's question defaults to "Once half of it is watched". Upgraders with a `refreshToken` keep this decision unchanged: 0 %, as 1.4.5 did.

## Amendment (2026-10-25): erased authorization on the interim session-access path

The user confirmed Q10, recorded as [R159](../../.scratch/rebuild/spec/resolutions.md#user-confirmed-interim-conversion-policies-of-2026-10-25-r156r160). When a recognized interim session-access installation has already erased historical authorization evidence, that history is unknown. It is neither known granted nor known denied. Current credential absence does not prove that 1.4.5 never got access.

Preserve a saved required percentage. Otherwise use 50 % watched until the user explicitly chooses immediate adding. The upgrade note must describe the uncertainty truthfully and must not assert either that 1.4.5 was adding immediately or that it never got access. Removal by name also cannot prove that credentials previously existed.

This amendment applies only to the recognized interim path in [REL-MIG-46](../../.scratch/rebuild/spec/08-release.md#212-interim-session-access-storage). The original legacy known-authorization rules and the amendment of 2026-10-20 remain unchanged. Canonical collision precedence and fresh disclosure agreement still apply. Compatible local unknown-state representation remains engineering work.
