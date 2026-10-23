import { mount } from "svelte"
import Pilot from "../../components/Pilot.svelte"

const host = document.querySelector("#pilot-host")
if (!host) throw new Error("Missing pilot host")
const root = host.attachShadow({ mode: "open" })
const target = document.createElement("div")
root.append(target)
mount(Pilot, { target, props: { portalTarget: target } })
