# For the user

Items that need the user, collected while working the map. Clear each one when it's answered.

## Decisions only the user makes

- **The 2.0 name** ([ticket 22](issues/22-name.md)): recommended "Playlist Pigeon for YouTube™", runner-up "Playlist Courier for YouTube™".
- **Unticking in the playlist picker removes the item from that playlist** ([ticket 26](issues/26-youtube-music-quick-actions.md)), as YouTube's own Save dialog does. Is this a capability you want?
- **More YouTube Music quick actions** ([ticket 26](issues/26-youtube-music-quick-actions.md), all feasible per ticket 21): Save to library, Start mix, Go to artist / album. These are new capabilities: in or out?
- **Localisation:** should 2.0's UI be translated? English toasts stand out on a non-English YouTube Music (ticket 26). This would be a new capability.

## Actions only the user can take

- **Run the live-check probe** ([ticket 25](issues/25-live-checks.md)) in Chrome and Firefox while signed in, and paste the reports back.
- **Send the AMO question** ([ticket 23](issues/23-ask-amo.md)) and paste the reply back.

## Decided on the user's behalf, worth knowing

- **The Data API is gone completely** ([ticket 10](issues/10-youtube-access.md)), including the "last resort" fallback from charting Q4. No job needs it, and YouTube's API policies forbid an app that uses both the Data API and YouTube's internal requests.
- **The page may read YouTube's session cookie to sign requests** ([ticket 10](issues/10-youtube-access.md)), only where YouTube's own client can't do the job quietly. Creating a playlist and some reads are expected to need it. Cost: the Chrome Web Store privacy tab declares "Authentication information", plus one privacy-policy line. No `cookies` permission and no faked origins.
- **Minimum versions:** Chrome 121, Firefox 140.
