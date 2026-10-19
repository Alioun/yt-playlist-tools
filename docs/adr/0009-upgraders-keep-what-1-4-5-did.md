# Upgraders keep what 1.4.5 did, not what its popup showed

1.4.5's settings are carried into 2.0 with the values 1.4.5 actually acted on. An unset watch percentage means 0 %, toasts are off unless set, and Ctrl keys carry over, even though 1.4.5's Ctrl check never fired. The one place where 1.4.5's popup disagreed with its behaviour is the percentage, which showed 50 % but acted at 0 %. The upgrade note asks about it once, defaulting to what 1.4.5 did.

## Considered options

- **Carry the popup's values:** that changes behaviour nobody asked to change. It's also wrong about toasts, whose checkbox 1.4.5 showed unchecked.

## Consequences

- Most upgraders keep auto-adding at 0 % unless they answer the note's question.
