import { Storage } from "@plasmohq/storage"

const storage = new Storage({ area: "local" })

export interface ExtensionSettings {
  playlists: string[]
  addToPlaylistID: string
  watchLaterShortcut: string
  toastEnabled: boolean
  preventDuplicates: boolean
  requiredWatchPercentage: number
  clientID: string
  clientSecret: string
  accessToken: string
  refreshToken: string
}

export { storage }
