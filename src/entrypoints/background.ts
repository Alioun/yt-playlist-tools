import { browser } from "wxt/browser"
import { defineBackground } from "wxt/utils/define-background"
import { boot } from "../background/boot"
import { platform } from "../shared/platform"

export default defineBackground(() => boot(browser, platform))
