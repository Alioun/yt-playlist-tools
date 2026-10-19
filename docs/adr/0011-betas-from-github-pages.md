# Betas are unlisted builds of the same add-on, served from this repo's GitHub Pages

Pre-release versions are unlisted, self-hosted Firefox builds with the same gecko ID, updating from this repository's GitHub Pages. On Chrome, the beta is the main store item uploaded as Unlisted, so its first review happens early. Betas sort below the release they precede: 2.0's betas are `1.99.N`.

We chose this because AMO has no pre-release channel, and a separate Chrome beta item would use the publisher's second listing slot.

## Consequences

- The Pages URL is a published contract: it's both stores' privacy-policy link and every installed beta's update URL. So the repository isn't renamed while betas are installed, because a rename moves the Pages URL with no redirect.
- Store version numbers stay numeric and identical on both stores; patch releases are the hotfix lane only.
