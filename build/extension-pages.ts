import type { WxtHooks } from "wxt"

/**
 * Q-PERF-35 rule 1: each extension page (popup, settings, the first-run page) gets a build of its own. In one
 * multi-page build they share chunks, so each page's first view pulls code only another page uses.
 */
export const buildPagesApart: WxtHooks["entrypoints:grouped"] = (_wxt, groups) => {
  const pages = (group: (typeof groups)[number]) => Array.isArray(group) && group.length > 1 && group.every(entry => entry.inputPath.endsWith(".html"))
  groups.splice(0, groups.length, ...groups.flatMap(group => pages(group) && Array.isArray(group) ? group.map(entry => [entry]) : [group]))
}
