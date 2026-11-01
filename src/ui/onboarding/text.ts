import type { I18n } from "../../shared/i18n"
import { createDisclosure, createFirstRunCopy } from "./copy"
import { createFeatureCopy } from "./features"

export function createFirstRunText(i18n: I18n) {
  const disclosure = createDisclosure(i18n)
  return Object.freeze({
    number: i18n.number,
    copy: createFirstRunCopy(i18n),
    features: createFeatureCopy(i18n),
    disclosure: Object.freeze({
      ...disclosure,
      headings: Object.freeze(disclosure.headings),
      closing: Object.freeze(disclosure.closing),
      items: Object.freeze(disclosure.items.map(item => Object.freeze({
        ...item, parts: Object.freeze(item.parts.map(part => Object.freeze(part)))
      })))
    })
  })
}

export type FirstRunText = ReturnType<typeof createFirstRunText>
export type DisclosureText = FirstRunText["disclosure"]
