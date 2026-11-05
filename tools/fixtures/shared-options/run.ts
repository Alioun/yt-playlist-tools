import { consume } from "./consumer"
await consume(record => process.stdout.write(JSON.stringify(record) + "\n"))
