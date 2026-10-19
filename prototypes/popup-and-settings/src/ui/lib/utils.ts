// THROWAWAY PROTOTYPE (ticket 15). Not production code.
//
// Ticket 24's lighter helpers: `cn` is plain clsx (0.2 KB), not shadcn's clsx + tailwind-merge (10.8 KB), and the
// components' variants come from `tailwind-variants/lite` (3.7 KB), not the full `tailwind-variants` (12.7 KB).
//
// The rule that buys: without class merging, a caller must never pass a class that conflicts with one the component
// already sets (no `class="h-10"` on a Button whose size sets h-8). Add a variant or a size instead. Extra classes that
// don't conflict (margins, widths, flex placement) are fine.
import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, "child"> : T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, "children"> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };
