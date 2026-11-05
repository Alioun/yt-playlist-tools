export const toastSkin = `
:host { font-family: Roboto, Arial, sans-serif; color-scheme: light; }
.toast { box-sizing: border-box; position: fixed; left: var(--toast-left,16px); bottom: var(--toast-bottom,16px); pointer-events: auto; display: flex; align-items: center; gap: 12px; min-width: min(288px,calc(100vw - 24px)); max-width: min(568px,calc(100vw - 24px)); padding: 12px; border: 0; border-radius: 8px; background: var(--yt-sys-color-baseline-inverse-surface,#0f0f0f); color: var(--yt-sys-color-baseline-inverse-on-surface,#f1f1f1); box-shadow: 0 0 24px rgba(0,0,0,.1); font: 400 1.4rem/2rem Roboto,Arial,sans-serif; overflow-wrap: anywhere; }
:host([dark]) .toast { background: var(--yt-sys-color-baseline-inverse-surface,#f1f1f1); color: var(--yt-sys-color-baseline-inverse-on-surface,#0f0f0f); }
:host([data-site=music]) .toast { background: #f1f1f1; color: #030303; box-shadow: 0 2px 5px rgba(0,0,0,.26); }
.toast button { all: unset; box-sizing: border-box; flex: 0 0 auto; cursor: pointer; color: #3ea6ff; font: 500 1.4rem/2rem Roboto,Arial,sans-serif; padding: 8px; border-radius: 4px; }
:host([dark]) .toast button,:host([data-site=music]) .toast button { color: #065fd4; }
.toast button:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
:host([data-site=music]) .toast button:focus-visible { outline-color: #fff; box-shadow: 0 0 0 4px #030303; }
.toast button:disabled { opacity: .6; cursor: default; }
.glyph { width: 24px; height: 24px; flex: 0 0 24px; fill: currentColor; }
.error { color: var(--yt-sys-color-baseline-inverse-error,#f28b82); }
:host([dark]) .error,:host([data-site=music]) .error { color: #c00; }
.spinner { width: 20px; height: 20px; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: toast-spin 1s linear infinite; }
@keyframes toast-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spinner { animation: none; opacity: .7; } }
`
export const errorPath = "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20m-1 5h2v6h-2zm0 8h2v2h-2z"
export const outlineErrorPath = "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20m0 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16m-1 3h2v6h-2zm0 8h2v2h-2z"
