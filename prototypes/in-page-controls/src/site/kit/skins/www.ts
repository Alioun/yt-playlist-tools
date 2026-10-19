// THROWAWAY PROTOTYPE (ticket 14). The hand-written YouTube skin's shared layer, put at the top of every shadow root.
//
// Theme: in-page UI follows YouTube's own theme, never the extension's theme setting. Every colour reads one of
// YouTube's live --yt-sys-color-baseline--* variables (they inherit through the shadow boundary from <html>), with a
// built-in fallback palette picked by the `dark` attribute we mirror from <html dark> onto each host (ticket 18:
// "Theme variables missing" is a cosmetic breakage signal). :host-context() would avoid the mirror but Firefox lacks it.
//
// Sizing: type uses YouTube's own rem (its <html> is font-size 62.5%, so 1.4rem = 14px) so our text follows the
// browser's font-size setting exactly as YouTube's does; boxes (36px pills, 28px thumbnail buttons) are px, as in
// YouTube's own CSS.
const v = (name: string, fb: string) => `var(--yt-sys-color-baseline--${name}, var(--pt-fb-${fb}))`;

export const SKIN_CSS = `
:host { all: initial; }
:host > div { display: contents; }
* { box-sizing: border-box; }
:host {
  /* fallback palette: YouTube's light values (kevlar_base, 2026-10-19) */
  --pt-fb-text: #0f0f0f; --pt-fb-text2: #606060; --pt-fb-bg: #fff; --pt-fb-menu: #fff; --pt-fb-raised: #fff;
  --pt-fb-tonal: rgba(0,0,0,0.05); --pt-fb-tonal-hover: rgba(0,0,0,0.1); --pt-fb-outline: rgba(0,0,0,0.1);
  --pt-fb-cta: #065fd4; --pt-fb-error: #c30027; --pt-fb-inv: #0f0f0f; --pt-fb-inv-text: #fff; --pt-fb-inv-cta: #3ea6ff;
  --pt-fb-disabled: #909090; --pt-fb-warning-bg: #ffeacf; --pt-fb-warning-text: #7c2900;
}
:host([dark]) {
  --pt-fb-text: #f1f1f1; --pt-fb-text2: #aaa; --pt-fb-bg: #0f0f0f; --pt-fb-menu: #282828; --pt-fb-raised: #212121;
  --pt-fb-tonal: rgba(255,255,255,0.1); --pt-fb-tonal-hover: rgba(255,255,255,0.2); --pt-fb-outline: rgba(255,255,255,0.2);
  --pt-fb-cta: #3ea6ff; --pt-fb-error: #f57; --pt-fb-inv: #f1f1f1; --pt-fb-inv-text: #0f0f0f; --pt-fb-inv-cta: #065fd4;
  --pt-fb-disabled: #717171; --pt-fb-warning-bg: rgba(124,41,0,0.6); --pt-fb-warning-text: #ffcd97;
}
:host {
  --pt-text: ${v("text-primary", "text")};
  --pt-text2: ${v("text-secondary", "text2")};
  --pt-bg: ${v("base-background", "bg")};
  --pt-menu: ${v("menu-background", "menu")};
  --pt-raised: ${v("raised-background", "raised")};
  --pt-tonal: ${v("additive-background", "tonal")};
  --pt-tonal-hover: ${v("mono-tonal-hover", "tonal-hover")};
  --pt-outline: ${v("outline", "outline")};
  --pt-cta: ${v("call-to-action", "cta")};
  --pt-error: ${v("error-indicator", "error")};
  --pt-inv: ${v("inverted-background", "inv")};
  --pt-inv-text: ${v("text-primary-inverse", "inv-text")};
  --pt-inv-cta: ${v("call-to-action-inverse", "inv-cta")};
  --pt-disabled: ${v("text-disabled", "disabled")};
  /* YouTube's own thumbnail hover toggles (live, 2026-10-19): rgba(0,0,0,.3), white 24 px glyphs. */
  --pt-overlay: rgba(0,0,0,0.3);
  --pt-overlay-hover: rgba(0,0,0,0.6);
  --pt-font: "Roboto", "Arial", sans-serif;
  font-family: var(--pt-font);
  color: var(--pt-text);
  -webkit-font-smoothing: antialiased;
}
button { font: inherit; color: inherit; }
`;
