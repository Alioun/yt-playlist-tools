# Authentication (1.5.0)

[← Legacy](README.md) · Retiring in 2.0 ([ADR-0001](../adr/0001-youtube-access-through-the-users-session.md))

Two ways to get a Google OAuth token:

1. **Sign in with Google** (default): goes through the [token broker](token-broker.md) in [`server/`](../../server/index.ts), which holds the client secret so the extension ships none. Google requires a secret for the *Web application* client type, the only type that accepts extension redirect URIs.
2. **Own credentials**: Settings → *Advanced*, paste your client ID and secret. Skips the broker.

> `youtube.force-ssl` is a restricted scope. Until Google verifies the app, a shared client is limited to test users. Own credentials work around this.

## Registering an OAuth client

1. In the [Google Cloud Console](https://console.cloud.google.com/), create a project and enable **YouTube Data API v3**.
2. *OAuth consent screen*: External, add the `youtube.force-ssl` scope.
3. *Credentials* → *OAuth 2.0 Client ID* → **Web application**.
4. Add both redirect URIs. Copy them from Settings → *Advanced*; Google matches them exactly, trailing slash included.

   | Browser | Redirect URI |
   | --- | --- |
   | Chrome | `https://<extension-id>.chromiumapp.org/` |
   | Firefox | `http://127.0.0.1/mozoauth2/<sha1-of-extension-id>` |

   Don't use Firefox's `*.extensions.allizom.org` URL; it fails consent-screen verification.
