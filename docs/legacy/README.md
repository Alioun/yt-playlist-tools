# Legacy: Google sign-in and the token broker

[← Docs](../README.md)

> [!WARNING]
> **Retiring in 2.0.** 2.0 reaches YouTube through the user's own signed-in session, from inside their YouTube tabs. It uses no server, no Google Cloud app and no YouTube Data API ([ADR-0001](../adr/0001-youtube-access-through-the-users-session.md)). The first 2.0 build slice deletes `server/`, the OAuth code and these docs, after tagging the last commit with the broker `archive/token-broker` ([spec chapter 08, §15](../../.scratch/rebuild/spec/08-release.md#15-retiring-server-and-the-auth-docs)).

These pages describe 1.5.0, which still needs a Google OAuth token to edit playlists, and 1.4.5, the version on Firefox Add-ons.

- [Setting up 1.4.5](1.4.5-setup.md): creating your own Google credentials for 1.4.5, step by step
- [Authentication](authentication.md): the two ways to get a token, and registering your own OAuth client
- [Token broker](token-broker.md): running it, pointing the extension at another broker, hosting one for others, Dokploy
