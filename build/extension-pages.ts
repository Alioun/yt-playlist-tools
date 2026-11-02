import type { WxtHooks } from "wxt"

/**
 * Q-PERF-35 rule 1: each extension page (popup, settings, the first-run page) gets a build of its own. In one
 * multi-page build they share chunks, so each page's first view pulls code only another page uses.
 */
export const buildPagesApart: WxtHooks["entrypoints:grouped"] = (_wxt, groups) => {
  const pages = (group: (typeof groups)[number]) => Array.isArray(group) && group.length > 1 && group.every(entry => entry.inputPath.endsWith(".html"))
  groups.splice(0, groups.length, ...groups.flatMap(group => pages(group) && Array.isArray(group) ? group.map(entry => [entry]) : [group]))
}

/**
 * Q-PERF-35 rule 2: an extension page's first view is one chunk. Split across a dozen chunks, each compressed
 * alone, the popup's first view weighed about 1.5 KB more. The single group imports no other group.
 */
export const firstViewChunk: WxtHooks["vite:build:extendConfig"] = (entries, config) => {
  const [page, ...others] = entries
  if (!page || others.length || !page.inputPath.endsWith(".html")) return
  config.build ??= {}
  const rolldown = config.build.rolldownOptions ??= {}
  const output = rolldown.output ??= {}
  if (Array.isArray(output)) throw Error(`firstViewChunk ${page.name}: expected one output`)
  output.codeSplitting = { groups: [{ name: page.name, tags: ["$initial"] }] }
}
