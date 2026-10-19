# Where does each capability live?

Type: prototype
Status: open
Labels: wayfinder:prototype
Part of: [Rebuild (2.0)](../map.md)

## Question

Where does each capability show up, so that everything is where a user would expect it? The surfaces are:
- YouTube's pages: the watch page, thumbnails, Shorts;
- the toolbar popup;
- the settings page;
- any other surface worth having, such as a side panel or the browser's context menu.

Cover these flows:
- first run, with nothing set up yet or with the user not signed in to YouTube;
- the one-time note for 1.4.5 upgraders;
- where per-account setups, channel filters and shortcuts are managed.

The prototype is low-fidelity, clickable and uses fake data. It's about placement and flow, not looks.

Also from [ticket 03](03-store-policy.md): the Chrome Web Store requires an in-product disclosure that the user explicitly accepts before any data is handled. Place it in first run.

Also from [ticket 06](06-upgrade-path.md): for upgraders, the one-time note doubles as the consent screen. Carried-over auto-add stays off until it's accepted.

Also from [ticket 02](02-request-context.md):
- With no YouTube tab open, the popup and settings may only have cached data plus an "Open YouTube" action, unless [ticket 25](25-live-checks.md) proves a hidden frame. Design for that state.
- Include asking for youtube.com access when it's missing or revoked (Firefox).

Also from the YouTube Music charting (Q20–Q21): YouTube Music gets its own tab or section, with its own on/off switch, button choices and shortcuts. Account, theme and sync stay shared at the top level. Map both sections, and the installed YouTube Music app.

Also from the modularity principle (map Notes): show where each feature is switched on and off, and what first run offers.
