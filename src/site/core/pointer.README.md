# Pointer facts

`Pointer` tracks DOM targeting facts for both site cores. Construction creates no listener, observer, timer or DOM node. `track(scope)` returns an idempotent release owned by the supplied qualified `Scope`.

All live consumers share one delegated tracker. The first consumer starts it. The last consumer removes every native listener. Tracking can start again with a new generation. Disposing the service also releases its resources from consumer scopes.

`read()` returns one of three results.

| Kind | Data | Meaning |
| --- | --- | --- |
| `none` | A reason | No usable targeting fact exists. |
| `focus` | The current deepest active element and its composed ancestor stack | Keyboard-visible focus moved last. |
| `pointer` | Viewport coordinates and the ordered current `elementsFromPoint` stack | Pointer activity moved last. An empty stack remains a pointer result. |

Pointer stores no item element. Each read queries current focus or hit testing. A scroll or recycled card therefore resolves current DOM facts. Detached and foreign elements are excluded. Pointer leave and window blur invalidate the point. The result is a synchronous fact for the current invocation, not a durable element handle.

Items remains site-specific. Items must interpret nested cards, inline previews, player bars, fullscreen policy and unsupported items. Pointer does not read a URL, recognize a video or fall back to playback.

The authored behavior and type tests are unexecuted. The fixture supplies hit-test results and focus-visible state around real happy-dom nodes and events. Native layout and focus-visible behavior remain unproven.
