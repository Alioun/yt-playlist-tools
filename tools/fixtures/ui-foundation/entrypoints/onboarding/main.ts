import { englishFirstRunText, pseudoFirstRunText } from "../../../localization/scripted"
import "../../../../../src/ui/onboarding/onboarding.css"
import { mount } from "svelte"
import markSrc from "../../../../../src/assets/brand/icon.svg"
import { followTheme, type ThemePreference } from "../../../../../src/ui/lib/theme"
import { FirstRun } from "../../../../../src/ui/onboarding"
import { syntheticOwner, type Scenario } from "../../synthetic-owner"

const params = new URLSearchParams(location.search)
const scenario = (params.get("scenario") ?? "fresh") as Scenario
const browserKind = params.get("browser") === "firefox" ? "firefox" : "chrome"
const theme = (params.get("theme") ?? "system") as ThemePreference
followTheme(document.documentElement, theme, matchMedia("(prefers-color-scheme: dark)"))

const target = document.querySelector("#first-run")
if (!target) throw new Error("Missing first-run host")
mount(FirstRun, { target, props: { text: params.get("locale") === "pseudo" ? pseudoFirstRunText() : englishFirstRunText(), owner: syntheticOwner(scenario, browserKind), markSrc } })
