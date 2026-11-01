import { GlobalRegistrator } from "@happy-dom/global-registrator"
if (typeof document === "undefined") GlobalRegistrator.register({ url: "https://www.youtube.com/" })
