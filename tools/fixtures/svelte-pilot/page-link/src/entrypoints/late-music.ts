import { defineUnlistedScript } from "wxt/utils/define-unlisted-script"
import { install } from "../site/consumer/mount"
export default defineUnlistedScript(() => install("late"))
