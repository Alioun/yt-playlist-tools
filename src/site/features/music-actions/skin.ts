/**
 * YouTube Music's skin for our hosts, fixed because YouTube Music is always dark (UI-YM-01 to UI-YM-03): 36 px row
 * buttons, 32 px card circles on the play button's surface, 40 px tonal header circles, the 36 px split Save and
 * the Wiz miniplayer's 32 px tonal pill (UI-YM-09 to UI-YM-15).
 */
export const musicSkin = `
:host { all: initial; display: inline-flex; align-items: center; flex: none; font-family: Roboto, Arial, sans-serif; color: #fff; }
.set { display: inline-flex; align-items: center; gap: 2px; margin: 0 8px; }
button { all: unset; box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 50%; color: #fff; cursor: pointer; }
button:hover { background: rgba(255,255,255,.1); }
button:active { background: rgba(255,255,255,.2); }
button:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
button[aria-disabled=true] { opacity: .4; cursor: default; }
svg { width: 24px; height: 24px; fill: currentColor; }
.split { display: inline-flex; border-radius: 18px; }
.split .main { border-radius: 18px 0 0 18px; }
.split .more { width: 22px; border-radius: 0 18px 18px 0; }
.split .more svg { width: 20px; height: 20px; }
.split:hover .more, .split:focus-within .more { box-shadow: inset 1px 0 rgba(255,255,255,.2); }
:host([data-kind=card]) { position: absolute; left: 8px; bottom: 12px; z-index: 2; }
:host([data-kind=card]) .set { gap: 4px; margin: 0; }
:host([data-kind=card]) button { width: 32px; height: 32px; background: rgba(0,0,0,.6); transition: transform .1s; }
:host([data-kind=card]) button:hover { background: rgba(0,0,0,.85); transform: scale(1.08); }
:host([data-kind=card]) .split .more { width: 22px; }
:host([data-kind=card]) svg { width: 20px; height: 20px; }
:host([data-kind=header]) .set { gap: 12px; margin: 0 6px; }
:host([data-kind=header]) button { width: 40px; height: 40px; background: rgba(255,255,255,.1); }
:host([data-kind=header]) button:hover { background: rgba(255,255,255,.2); }
:host([data-kind=bar]) .set { margin: 0 8px 0 0; }
:host([data-kind=wiz]) .set { margin: 0 8px 0 0; }
:host([data-kind=wiz]) button { height: 32px; background: rgba(255,255,255,.1); }
:host([data-kind=wiz]) .split .main { width: 36px; border-radius: 16px 0 0 16px; }
:host([data-kind=wiz]) .split .more { border-radius: 0 16px 16px 0; }
.spinner { width: 20px; height: 20px; box-sizing: border-box; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spinner { animation: none; opacity: .7; } }
`
/** YouTube's tooltip, drawn above the page so a carousel can't clip it (UI-YM-05). */
export const tipSkin = `
:host { all: initial; position: fixed; z-index: 2400; pointer-events: none; }
div { padding: 0 8px; border-radius: 4px; background: rgba(97,97,97,.92); color: #fff; font: 400 1.2rem/1.8rem Roboto, Arial, sans-serif; white-space: nowrap; }
`
