import { expect, test } from "bun:test"
import { consume } from "./consumer"
test.each([false, true])(
  "complete canonical import consumer, sync %s",
  async syncOn => {
    expect(await consume(syncOn)).toEqual({
      case: syncOn ? "complete-sync" : "complete-local",
      changedDocuments: 11,
      includedAccounts: 5,
      omittedAccounts: 1,
      emptiedAccounts: 2,
      receipt: true,
      publication: 6
    })
  },
  60000
)
