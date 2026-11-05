import type { ConsentDevicePort, ConsentStateV1, ConsentItems, WithdrawalIntentItems } from "./consent-withdrawal"
import type { Shutdown, WithdrawalResult } from "./store-lifecycle"

function negative(port: ConsentDevicePort, intent: WithdrawalIntentItems, pair: ConsentItems) {
  void port.set(intent)
  void port.set(pair)
  // @ts-expect-error Device cannot be written without control evidence.
  void port.set({ device: pair.device })
  // @ts-expect-error A control-only write must carry withdrawal intent.
  void port.set({ "consent:state": pair["consent:state"] })
  // @ts-expect-error The consent port cannot mutate unrelated stores.
  void port.set({ ...pair, sync: {} })
  // @ts-expect-error Consent observation names only its schema, Device and control tuple.
  void port.get(null)
  // @ts-expect-error Consent observation cannot read a pending record or secret.
  void port.get(["schema", "device", "refreshToken"])
  // @ts-expect-error Consent withdrawal cannot clear the area.
  void port.clear()
  // @ts-expect-error A rejected owner stop cannot be confirmed.
  const stopped: Shutdown = { kind: "confirmed", owner: { kind: "rejected", error: null }, producers: { kind: "resolved" } }
  // @ts-expect-error A durable confirmation needs its separate shutdown observation.
  const withdrawn: WithdrawalResult = { kind: "withdrawn", write: { kind: "resolved" }, activation: "held" }
  // @ts-expect-error An agreement control includes the exact current agreement.
  const state: ConsentStateV1["state"] = { kind: "agreed", prior: null }
  // @ts-expect-error Withdrawal intent binds the original agreement.
  const preparing: ConsentStateV1["state"] = { kind: "withdrawing" }
  // @ts-expect-error Final storage confirmation requires a distinct confirmed intent observation.
  const withoutIntent: WithdrawalResult = {
    kind: "withdrawn",
    write: { kind: "resolved" },
    shutdown: { kind: "confirmed", owner: { kind: "no-owner" }, producers: { kind: "resolved" } },
    activation: "held"
  }
  void [stopped, withdrawn, state, preparing, withoutIntent]
}
void negative
