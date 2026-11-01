import { consumerRecords } from "./consumer"
for (const record of await consumerRecords()) process.stdout.write(JSON.stringify(record) + "\n")
