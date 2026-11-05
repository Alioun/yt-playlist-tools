import { isStartupValueKey, type SanitizedStartupInventory } from "./startup-source"

/**
 * The native startup source (06 ARC-MOD-25). It reads `storage.local` once, keeps values only for the names
 * the startup host accepts, and reduces the 1.x refresh token to whether it was nonempty. No credential value
 * leaves this function. The interim build's history isn't observable here, so both historical facts are unknown.
 */
export function nativeStartupInventory(local: { get(keys: null): Promise<Record<string, unknown>> }): { readInventory(): Promise<SanitizedStartupInventory> } {
  return {
    async readInventory() {
      const stored = await local.get(null)
      const presentLocalKeys = Object.keys(stored)
      const values: Record<string, unknown> = {}
      for (const name of presentLocalKeys) if (isStartupValueKey(name)) values[name] = stored[name]
      const refreshToken: unknown = stored.refreshToken
      return {
        presentLocalKeys,
        values,
        legacyAuthorization: { kind: "observed", refreshTokenWasNonempty: typeof refreshToken === "string" && refreshToken.length > 0 },
        historicalAuthorization: { kind: "unknown" },
        priorCredentialPresence: { kind: "unknown" }
      }
    }
  }
}
