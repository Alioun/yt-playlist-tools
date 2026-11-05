import { consume } from "./consumer"
import type { Route } from "./harness"
const requested = process.argv.find(arg => arg.startsWith("--route="))?.slice(8) ?? "owner"
if (requested !== "owner" && requested !== "native" && requested !== "wire") throw Error("Expected owner, native or wire route")
const route: Route = requested
for await (const row of consume(route)) process.stdout.write(row)
