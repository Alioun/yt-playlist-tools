import "../../ui/onboarding/onboarding.css"
import { mount } from "svelte"
import { browser } from "wxt/browser"
import markSrc from "../../assets/brand/icon.svg"
import { OnboardingPage } from "../../ui/onboarding"
import { startFirstRun } from "../../ui/onboarding/start"
import { disclosureCatalogue } from "../../ui/shell/disclosure-catalogue"
import { startExtensionPage } from "../../ui/shell/start"

const target = document.querySelector("#first-run")
if (!target) throw new Error("Missing first-run host")
mount(OnboardingPage, { target, props: { ...startFirstRun(startExtensionPage(browser, navigator.platform, disclosureCatalogue)), markSrc } })
