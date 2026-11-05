import "../../fixture.css"
import { mount } from "svelte"
import markSrc from "../../../../../src/assets/brand/icon.svg"
import { followTheme } from "../../../../../src/ui/lib/theme"
import Fixture from "../../Fixture.svelte"
import { scenario } from "../../scenarios"

const params = new URLSearchParams(location.search)
const theme = params.get("theme")
followTheme(document.documentElement, theme === "dark" ? "dark" : "light", matchMedia("(prefers-color-scheme: dark)"))
const target = document.getElementById("picker-fixture")
if (!target) throw new Error("Missing synthetic picker fixture host")
mount(Fixture, { target, props: { scenario: scenario(params.get("scenario")), markSrc, pseudo: params.get("locale") === "pseudo" } })
