export const overlaySkin = `
:host { all: initial; font-family: Roboto, Arial, sans-serif; }
.stack { position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 4px; pointer-events: none; }
:host([data-row]) .stack { flex-direction: row; }
.slot { display: contents; }
.slot[hidden], .button[hidden] { display: none; }
.button { all: unset; box-sizing: border-box; pointer-events: auto; display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 50%; background: rgba(0,0,0,.3); color: #fff; cursor: pointer; }
.button:hover { background: rgba(0,0,0,.6); }
.button:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
.button[aria-disabled=true] { cursor: default; }
.glyph { width: 24px; height: 24px; fill: currentColor; }
.spinner { width: 20px; height: 20px; box-sizing: border-box; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: overlay-spin 1s linear infinite; }
@keyframes overlay-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spinner { animation: none; opacity: .7; } }
.tip { position: absolute; left: calc(100% + 8px); top: var(--tip-top, 0px); white-space: nowrap; pointer-events: none; padding: 0 8px; border-radius: 4px; background: rgba(97,97,97,.92); color: #fff; font: 400 1.2rem/1.8rem Roboto, Arial, sans-serif; }
.tip[hidden] { display: none; }
`
