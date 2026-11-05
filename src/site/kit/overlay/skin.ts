export const overlaySkin = `
:host { all: initial; font-family: Roboto, Arial, sans-serif; }
.box { position: relative; width: 100%; height: 100%; pointer-events: none; }
.corner { position: absolute; display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
.corner[data-corner^=top] { top: 0; }
.corner[data-corner^=bottom] { bottom: 0; }
.corner[data-corner$=left] { left: 0; }
.corner[data-corner$=right] { right: 0; align-items: flex-end; }
:host([data-row]) .corner { flex-direction: row; }
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
.tip { position: absolute; white-space: nowrap; pointer-events: none; padding: 0 8px; border-radius: 4px; background: rgba(97,97,97,.92); color: #fff; font: 400 1.2rem/1.8rem Roboto, Arial, sans-serif; }
.tip[hidden] { display: none; }
`
