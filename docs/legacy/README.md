# Legacy: Google sign-in and the token broker

[← Docs](../README.md)

These pages describe released 1.5.0 and 1.4.5, the version on Firefox Add-ons. Dev builds have removed the OAuth broker and use an open, signed-in YouTube tab after you agree in the popup. See [ADR-0001](../adr/0001-youtube-access-through-the-users-session.md).

The broker instructions below apply to the [last source version with the broker](https://github.com/Alioun/yt-playlist-tools/tree/55af2295b59df5efade2b3ea0680ca92a289e989). They do not apply to current dev builds.

- [Setting up 1.4.5](1.4.5-setup.md): creating your own Google credentials for 1.4.5, step by step
- [Authentication](authentication.md): the two ways to get a token, and registering your own OAuth client
- [Token broker](token-broker.md): running it, pointing the extension at another broker, hosting one for others, Dokploy
