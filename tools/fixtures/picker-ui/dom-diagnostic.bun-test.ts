import { test, expect } from "bun:test"
import { render } from "@testing-library/svelte"
import { flushSync } from "svelte"
import { toBeVisible } from "@testing-library/jest-dom/matchers"
import { PickerModel } from "../../../src/shared/picker/model.svelte"
import PickerPanel from "../../../src/ui/picker/PickerPanel.svelte"
import { createPickerText } from "../../../src/ui/picker/text"
import { englishI18n } from "../localization/scripted"
import { itemSource, NOW, playlist, settle } from "../picker-model/fake-source"

test("inspect the actual connected membership paragraph", async () => {
 const f=itemSource(), picker=new PickerModel({source:f.source,site:"www",mode:"save"})
 const view=render(PickerPanel,{picker,text:createPickerText(englishI18n()),purpose:{kind:"save"},platform:"linux",onoutcome:()=>{},onrequestclose:()=>{}})
 f.ledger.answer("cachedList",{rows:[{id:playlist("PLalpha"),title:"Synthetic Alpha"}],at:NOW})
 await settle();flushSync()
 const p=view.getByText("Checking where this video already is…")
 process.stdout.write(JSON.stringify({connected:p.isConnected,root:p.getRootNode().nodeName,parent:p.parentElement?.tagName,bodyContains:document.body.contains(p),visible:toBeVisible(p).pass,empty:p.matches(":empty"),styles:[p,p.parentElement,p.parentElement?.parentElement,document.body].map(n=>n?({tag:n.tagName,classes:n.className,display:getComputedStyle(n).display,visibility:getComputedStyle(n).visibility,opacity:getComputedStyle(n).opacity}):null),html:view.container.innerHTML.slice(0,5000)})+"\n")
 expect(p.textContent).toBe("Checking where this video already is…")
 picker.close()
})
