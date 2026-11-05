import { consume } from "./consumer"

for (const syncOn of [false, true]) process.stdout.write(`${JSON.stringify(consume(syncOn))}\n`)
