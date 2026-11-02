import { browser } from "wxt/browser"
import { defineBackground } from "wxt/utils/define-background"
import { boot } from "../background/boot"
import { vocabularyFor, type RouteTable } from "../page/gateway/port"
import { musicRoutes } from "../page/routes/music"
import { wwwRoutes } from "../page/routes/www"
import { platform } from "../shared/platform"

// The Monitor checks each tab's signals against the routes and vocabulary the page halves ship (HEALTH-01).
const site = (table: RouteTable) => ({ vocabulary: vocabularyFor(table),
  routes: Object.fromEntries(Object.entries(table).map(([job, routes]) => [job, routes.map(route => route.id)])) })

export default defineBackground(() => boot(browser, platform, { www: site(wwwRoutes), music: site(musicRoutes) }))
