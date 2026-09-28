import React from "react"
import ReactDOM from "react-dom/client"

import { ThemeProvider } from "@/components/theme-provider"
import "@/assets/tailwind.css"
import App from "./App"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>
)
