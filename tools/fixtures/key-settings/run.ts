import { consume } from "./consumer"
const route = process.argv.find(arg => arg.startsWith("--route="))?.slice(8) ?? "owner"
if (route !== "owner" && route !== "native" && route !== "wire") throw Error("Expected owner, native or wire route")
for await (const row of consume(route)) process.stdout.write(row)
