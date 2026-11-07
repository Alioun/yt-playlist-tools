import clsx from "clsx"

// No base class sets a property a variant or size sets, because clsx doesn't merge utilities (UI-RULE-12).
const base =
  "focus-visible:border-ring focus-visible:ring-ring/40 border bg-clip-padding font-medium focus-visible:ring-3 active:not-aria-disabled:translate-y-px inline-flex shrink-0 items-center justify-center max-w-full whitespace-normal text-center transition-all outline-none select-none disabled:pointer-events-none disabled:opacity-50 aria-disabled:cursor-progress [&_svg]:pointer-events-none [&_svg]:shrink-0"

const variants = {
  default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/88 shadow-[inset_0_1px_0_rgb(255_255_255/0.12)]",
  brand: "border-transparent bg-brand-gradient text-white shadow-soft hover:brightness-105 hover:saturate-110",
  outline: "border-border bg-card hover:bg-muted hover:text-foreground dark:bg-input/20 dark:border-input dark:hover:bg-input/40",
  secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_6%)]",
  ghost: "border-transparent hover:bg-muted hover:text-foreground dark:hover:bg-muted/60",
  destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive/30",
  "destructive-soft": "border-transparent bg-destructive-soft text-destructive hover:bg-destructive/15",
  link: "border-transparent text-primary underline-offset-4 hover:underline"
} as const

const sizes = {
  default: "min-h-8 py-1 gap-1.5 rounded-lg px-3 text-sm [&_svg]:size-4",
  sm: "min-h-7 py-1 gap-1 rounded-[9px] px-2.5 text-[13px] [&_svg]:size-3.5",
  lg: "min-h-10 py-2 gap-2 rounded-[11px] px-4 text-[15px] [&_svg]:size-4"
} as const

export type ButtonVariant = keyof typeof variants
export type ButtonSize = keyof typeof sizes

export function buttonClass(variant: ButtonVariant = "default", size: ButtonSize = "default"): string {
  return clsx(base, variants[variant], sizes[size])
}
