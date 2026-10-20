# Naming, round 2

Research for [ticket 22](../../.scratch/rebuild/issues/22-name.md), round 2. Every check ran on 2026-10-20. Store searches are fuzzy, and a register search isn't legal clearance.

## Answer

- **Screened:** 352 names in five styles. **18 finalists** passed every check. One more (Playlist Starling) is a near miss with one check unfinished. 196 names collide with something. 64 more passed but weren't shortlisted, and 73 are still waiting on one register (see [Limits](#limits)).
- **Round 1's pick no longer passes.** "Pigeon" is the brand of PigeonPod, an active YouTube-playlist tool (1,195 GitHub stars, [pigeonpod.cloud](https://pigeonpod.cloud)). An exact-name repo `playlist-pigeon` (a playlist converter) and Google Play's "Pigeon Music" add to it. Round 1's checks missed all three. [Details](#round-1s-names-re-checked).
- **Round 1's runner-up, Playlist Courier, still passes.**
- **Top three (my picks; the choice is yours):** Playlist Sheepdog, Playlist Courier, Playlist Mailroom. [Why](#top-three).

## What changed since round 1

- 2.0 now also gathers a window's open YouTube tabs into one queue or a chosen playlist ([ticket 31](../../.scratch/rebuild/issues/31-gathertube.md)). A name that only says "filing" is now too narrow.
- You asked for a varied list with only names that don't collide.
- Round 2 adds Google Play and the App Store. It reads the goods of trademarks that match a name's main word. It also searches GitHub for that word next to "youtube", "music" and "playlist". That last check is the one that found PigeonPod.

## How the names were checked

| Check | How | Ran for |
|---|---|---|
| Chrome Web Store | Results scraped from `chromewebstore.google.com/search/<name>` (EU consent cookie set, no sign-in) | All 352 |
| AMO | `addons.mozilla.org/api/v5/addons/search` | All 352 |
| Edge Add-ons | The store's own `addons/v4/getfilteredorderedsearch` API | All 352 |
| GitHub | `gh api search/repositories`: the name as a phrase, the joined name in repo names, and for finalists the main word next to youtube, music and playlist | All 352; word check for 54 |
| US marks | USPTO's `tmsearch` backend: the whole name, and the main word alive in classes 9, 38, 41 and 42, with goods | All 352 |
| Other registers | TMview (EU, national offices, CN, CA, JP, KR, BR and more): the whole name, and the main word in classes 9, 38, 41 and 42 | 223 of 352 ([Limits](#limits)) |
| App Store | iTunes Search API, US store | All 352 |
| Google Play | Search results page, US, apps | All 352 |
| Web | A web search per finalist name, plus its main word next to YouTube and music | Finalists and near misses |
| Domains | RDAP lookups for `.com` (Verisign) and `.app` (Google Registry); "free" means not registered. Information only | All 352 |

Each name is searched as its core ("Playlist Mailroom"), and its main word ("Mailroom") is searched too. A name **collides** when any of these holds:
- **Stores and app stores:** a listing or app uses the same name, or uses the main word as its own brand for a YouTube, video or music tool. "TubeRaccoon For YouTube" rules out Playlist Raccoon. Unrelated uses, such as wallpaper themes or a "Black Butler" theme, don't count.
- **GitHub:** a repo has the same name and either 5 or more stars or a description in the music, video or playlist field. For the main word, an in-field project counts with 5 or more stars, or with at least 1 star and a push in the last 12 months. Dormant 0-star hobby repos are noted only.
- **Trademarks:** a live mark for the whole name in any class, or a live mark for the main word whose owner sells software or services for playing, organising or streaming music or video. Broad class-9 lists from unrelated businesses (baby goods, cables, modems) don't count. For one-word coinages, the whole name is the main word, so any identical live software mark counts.
- **Web:** an app or product in the YouTube, music or video space uses the name, or its main word as a brand. Bands and songs are noted, not counted.

Every finalist also follows these rules:
- The store form is "&lt;Name&gt; for YouTube™": Chrome forbids "YouTube" first.
- No Tube, Tuber, YT or Keep, and nothing that sounds like a Google product.
- Every name is under AMO's 50 characters and Chrome's 75.

## Finalists

Every check below ran on 2026-10-20. "Clean" means no listing, repo, app or mark with the name, and nothing in the field that uses the main word as a brand. The next table gives each finalist's evidence.

| # | Store name | Short form (`short_name`) | Style | Chars | Why it fits | Tone | Icon motif (hand-drawn vector, no YouTube cue) |
|---|---|---|---|---|---|---|---|
| 1 | **Playlist Courier for YouTube™** | Playlist Courier (Courier) | Plain | 29 | Carries each video or song to the right playlist or queue; round 1's runner-up, still clean | Sober, dependable | Yes: a list card with two speed lines behind it (lines only, no arrowhead, so nothing reads as ▶) |
| 2 | **Playlist Postie for YouTube™** | Playlist Postie (Postie) | Plain | 28 | The friendly postman: drops each video in the right box and collects the stray tabs | Warm. "Postie" is British and Australian; less known in the US | Yes: a list card going into a round mail slot |
| 3 | **Playlist Bellhop for YouTube™** | Playlist Bellhop (Bellhop) | Plain | 29 | Takes what you're holding (a video, a song, a window of tabs) to the right room when you ring (a key) | Light, helpful | Yes: a bellhop's pillbox cap |
| 4 | **Playlist Satchel for YouTube™** | Playlist Satchel (Satchel) | Plain | 29 | One bag for everything worth keeping: videos, songs, a window of tabs | Warm, homely | Yes: a buckled satchel with list lines on the flap |
| 5 | **Playlist Roundup for YouTube™** | Playlist Roundup (Roundup) | Plain | 29 | Rounds up what you watch into playlists, and stray tabs into one queue | Brisk, friendly. Leans towards the gathering feature | Yes: a rope loop around three list lines |
| 6 | **Save, Queue & Gather for YouTube™** | Save, Queue & Gather (Save & Queue) | Plain | 33 | Names three jobs in plain words | Literal. Leaves out auto-add and the word "Playlist"; "Save" and "Queue" are YouTube's own button words, so it may read as built in. A descriptive name is a weak trademark | No natural motif. The obvious one, a playlist-add glyph, looks like YouTube's own Save icon, so avoid it |
| 7 | **Playlist Mailroom for YouTube™** | Playlist Mailroom (Mailroom) | Tool | 30 | The sorting room: whatever comes in goes to the right pigeonhole, by hand or automatically. Keeps round 1's pigeonhole idea | Tidy, calm | Yes: a grid of pigeonholes with one slot filled |
| 8 | **Playlist Quickfile for YouTube™** | Playlist Quickfile (Quickfile) | Tool | 31 | Files the video or song in one action | Brisk, utilitarian | Yes: a folder tab with a lightning notch |
| 9 | **Playlist Hotbar for YouTube™** | Playlist Hotbar (Hotbar) | Tool | 28 | A gamer's word for quick-access slots: named keys and one-click saves, each to its own playlist | Techy, power-user. Says less about auto-add and gathering | Yes: a row of four slots, one lit |
| 10 | **Playlist Sheepdog for YouTube™** | Playlist Sheepdog (Sheepdog) | Mascot | 30 | Herds what you watch into the right pens, and rounds up stray tabs into one queue; a loyal helper that does only what it's told | Friendly, loyal | Yes: a collie's head in profile, ears up |
| 11 | **Playlist Bowerbird for YouTube™** | Playlist Bowerbird (Bowerbird) | Mascot | 31 | The bird that collects and arranges treasures, which is what a playlist is | Curious, charming; a less familiar bird | Yes: a small bird beside a little arch of collected items |
| 12 | **Playlist Stork for YouTube™** | Playlist Stork (Stork) | Mascot | 27 | Delivers each video to the right home; the bundle in its beak is your list | Whimsical; carries the baby-delivery joke | Yes: a stork with a list card in its beak |
| 13 | **Listbird for YouTube™** | Listbird (Listbird) | Coinage | 21 | A small bird that carries your lists: round 1's pigeon idea without the taken word | Light, short | Yes: a small bird whose wing is three list lines |
| 14 | **Listwing for YouTube™** | Listwing (Listwing) | Coinage | 21 | Lists on wings: quick, light, and they land where they belong | Light, airy | Yes: one wing made of three list lines |
| 15 | **Playstow for YouTube™** | Playstow (Playstow) | Coinage | 21 | "Stow what's playing": a verb for the main job | Neat, a little nautical. "Play" first can recall Google Play; mild risk | Yes: a small chest with list lines inside |
| 16 | **Bop Bucket for YouTube™** | Bop Bucket (Bop Bucket) | Playful | 23 | Toss any bop in the bucket | Playful, music-leaning | Yes: a bucket with a note popping out |
| 17 | **Queue Crew for YouTube™** | Queue Crew (Queue Crew) | Playful | 23 | A little crew that lines up your queue and your playlists | Playful, rhyming. Leaves out "Playlist", the search word | Yes: three round figures in a line |
| 18 | **Playlist Packrat for YouTube™** | Playlist Packrat (Packrat) | Playful | 29 | Hoards every video worth keeping, sorted | Cheeky. "Packrat" can sound messy, and some people dislike rats | Yes: a round-eared packrat holding a list card |

All 18 avoid YouTube's red and its play-button shapes, and none needs YouTube's look.

### Check results (2026-10-20)

| # | Name | Stores (Chrome · AMO · Edge) | GitHub | Marks (USPTO · TMview) | Web and app stores | `.com` / `.app` |
|---|---|---|---|---|---|---|
| 1 | Playlist Courier | No listing with the name. The word: "Courier Web", an AI sidebar (Chrome, 8 users; Edge) | No repo with the name; no in-field "Courier" project | No mark for the name. COURIER marks belong to Metso and Outokumpu (analysers), U.S. Robotics (modems), a medical-software firm, a UK business magazine (podcasts), and a Chinese AR-glasses maker whose CN lists include media players and video-on-demand transmission. None is a playlist or media-software product | No product with the name; courier-delivery apps only | free / free |
| 2 | Playlist Postie | None | None | No mark for the name. One identical POSTIE mark: a Turkish application in classes 35, 38 and 41, owner hidden until publication, goods unknown | Nothing; Postie is also a WordPress plugin and a direct-mail firm | free / free |
| 3 | Playlist Bellhop | None | None | No mark for the name. BELLHOP marks: a moving-services app, a voice-assistant device, a branding agency, a Czech firm (goods not read) | Nothing | free / free |
| 4 | Playlist Satchel | None | None | No mark for the name. SATCHEL marks: Satchel One school software; a UK digital firm's filing and an Indian individual (goods not read) | Nothing | free / free |
| 5 | Playlist Roundup | No listing with the name. The word: "One-Click Tab Round Up" (Chrome, 22 users), a tab merger | None; "weekly track roundup" scripts only | No mark for the name. ROUNDUP marks: a donations platform, a Korean recruitment firm, a Korean individual (goods not read) | Nothing | free / free |
| 6 | Save, Queue & Gather | None | None | None | Nothing; nearest is "Save Ur Queue" (Chrome, 2 users) | free / free |
| 7 | Playlist Mailroom | None | None | No mark for the name. One MAILROOM mark: HR software (US) | Nothing; parcel-room apps on Google Play | free / free |
| 8 | Playlist Quickfile | None | None; a "QuickFile" repo (9 stars, 2018, no description) | No mark for the name. QUICKFILE marks: RocketRoute flight planning (EU, UK) | Nothing; QuickFile is also a UK accounting product | free / free |
| 9 | Playlist Hotbar | None | None; Minecraft-style hotbar mods only | No mark for the name. One HOTBAR mark: a Chinese individual, class 41 (goods not read) | Nothing | free / free |
| 10 | Playlist Sheepdog | None | None | No mark for the name. SHEEPDOG marks: education and food businesses | Nothing; the band The Sheepdogs and some games ("Sheepdog World") | free / free |
| 11 | Playlist Bowerbird | None | None | No mark for the name. BOWERBIRD marks: a German association and a Chinese tech firm (goods not read), Australian interior styling and a bazaar | Nothing; the indie band Bowerbirds | free / free |
| 12 | Playlist Stork | None | None; a dormant private music-streaming repo "stork" (1 star, 2024) | No mark for the name. STORK marks: Masimo baby monitors, Epic obstetrics software, Stork industrial machinery, and others; goods of two individuals' marks not read | Nothing; "Stork Advisor" on Google Play | free / free |
| 13 | Listbird | None | None | None | Nothing; a birding app "Bird List" | taken / free |
| 14 | Listwing | None | None | None | Nothing | taken / free |
| 15 | Playstow | None | None | None | Nothing | taken / free |
| 16 | Bop Bucket | None | None | None | Nothing; bop.fm was a music aggregator (closed) | free / free |
| 17 | Queue Crew | None | None | None | Nothing | taken / free |
| 18 | Playlist Packrat | None | None | No mark for the name. PACKRAT marks: social-gaming software, an education association | Nothing; "PackRat Card Collecting Game" | free / free |

## Top three

The list above is neutral; these are my picks, each in a different style.

1. **Playlist Sheepdog for YouTube™ (mascot).** It covers every job: herding what you watch into the right playlists, and rounding up stray tabs into one queue. A sheepdog does exactly what it's told, which suits an opt-in tool. It's clean down to the word. A collie's head is a clear, friendly icon with nothing of YouTube in it.
2. **Playlist Courier for YouTube™ (plain).** It's still clean a day later, and it's the most sober option. It covers saving, auto-add, YouTube Music and gathering equally. All drafted copy says "Playlist Pigeon", so this is a straight swap.
3. **Playlist Mailroom for YouTube™ (tool).** The sorting room keeps round 1's pigeonhole idea without the taken word. Things arrive and go to the right slot, by hand or automatically. The only MAILROOM mark is for HR software. A pigeonhole grid reads well even at 16 px.

## Near misses

| Name | What's unfinished or close |
|---|---|
| Playlist Starling for YouTube™ (30 chars) | Clean on every store, GitHub, USPTO and the web. Two French STARLING marks (classes 9, 38 and 41) and a Brazilian one (class 9) could not be read, because TMview blocked detail lookups. Starling Bank's app and a hardware "Starling audio player" (CompuPhase) also exist. A starling's teal-to-violet sheen matches the palette already drafted. Read those three marks before choosing it. |

## Round 1's names, re-checked

| Name | Round 1 (2026-10-19) | Round 2 (2026-10-20) |
|---|---|---|
| Playlist Pigeon | Recommended; "clean on every check" | **Collides.** [PigeonPod](https://github.com/aizhimou/pigeon-pod) (1,195 stars, pushed 2026-10-09, [pigeonpod.cloud](https://pigeonpod.cloud)) turns YouTube channels and playlists into podcast feeds; "Pigeon" is its brand. GitHub also has `caseyjohnsonwv/playlist-pigeon`, "a serverless web application for converting playlists between music streaming services" (0 stars, last push 2022-05). Google Play has "Pigeon Music: Easy Streaming" (Latin radio, 5K+ downloads). Round 1 searched the exact phrase everywhere, but not the word "Pigeon" in the YouTube and music space. |
| Playlist Courier | Runner-up | **Still clean.** See finalist 1 |
| Playlist Pilot | Out: reads as an AI playlist generator | Still out: more "PlaylistPilot" AI repos |
| Playlist Kit | Out: playlistkit.com is a live music product | Still out |
| Playlist Butler | Out: crowded in music | Still out |
| Listmark | Out: LISTMARK filing (class 35) | Still out: the filing is live |
| Playlist Tools | Out: four confusable listings | Still out: "playlist.tools" (636 users) and "YouTube Playlist Tools" (292) on Chrome |

Of round 1's other names, Playlist Wrangler, Sorter, Helper, Shelf and Keeper were re-run and are still out (see [Rejected](#rejected)). The rest were one-word names taken on the stores, and weren't re-run.

## Rejected

196 names collide. The first collision found, or the clearest, is shown. Users are Chrome Web Store buckets or AMO daily users, as each store reports them.

| Name | Style | What it collides with |
|---|---|---|
| Listmark | Plain | App Store: 'Listmark: Realtor Marketing' (Business); USPTO: live mark LISTMARK (classes 35; Listmark LLC) |
| One-Click Playlists | Plain | AMO: 'YouTube One-Click Playlist', 7 users |
| Playlist Assistant | Plain | GitHub: koval-kn/playlist-assistant (0 stars, last push 2022-11): Java MVC web-application on servlets, that uses PostgreSQL via JDBC. T…; GitHub: RolandFran/playlist-assistant (0 stars, last push 2026-08): Home Assistant integration and app for building a private, automatical… |
| Playlist Basket | Plain | Google Play: 'MusicBasket' |
| Playlist Butler | Plain | Music-space neighbours SongButler, TuneButler (round 1); playlistbutler.com taken |
| Playlist Caddy | Plain | Chrome: 'Comment Caddy', a YouTube tool |
| Playlist Collector | Plain | Chrome: 'YouTube Playlist Collector', 136 users; GitHub: frikille/playlist-collector (0 stars, last push 2014-08): The collector of playlist data |
| Playlist Concierge | Plain | Google Play: 'Music Concierge' |
| Playlist Dispatch | Plain | USPTO: live DISPATCH for musicians' fan-engagement software (Rehearsal Space App); Google Play 'AudioDispatch' |
| Playlist Emissary | Plain | USPTO: live EMISSARY for a band's music recordings |
| Playlist Express | Plain | GitHub: mynghn/playlist-express (0 stars, last push 2023-11): Transfer a Spotify playlist to your YouTube account. |
| Playlist Ferry | Plain | GitHub: ThatOneGuyGreggers/playlist-ferry (1 star, last push 2026-09): Ferry your Spotify playlists ashore as tagged audio files—with YouTube…; GitHub: DrukisMC/playlistferry-site (0 stars, last push 2026-10): PlaylistFerry — Spotify → Deezer. Site, reviews e reports. |
| Playlist Funnel | Plain | USPTO: live FUNNEL for software that organises media files; playlistfunnel.com taken |
| Playlist Helper | Plain | AMO: 'YouTube Playlist Helper', 34 users; GitHub: jmullan/playlist_helper (5 stars, last push 2025-06): Tools to help you manage playlists on rdio |
| Playlist Hotkeys | Plain | Crowded: 'YouTube Music Hotkeys' (3,000 users), 'Video Hotkeys', 'Quick Hotkey' (Watch Later) |
| Playlist Inbox | Plain | Chrome: 'YouTube Inbox' (send YouTube videos to an inbox) |
| Playlist Keeper | Plain | Google Play: 'Sonic Playlist Keeper'; GitHub: AWeebTaku/Playlist-Keeper (0 stars, last push 2026-10): Playlist Keeper, a cross-platform desktop app that tracks and rescues… |
| Playlist Kit | Plain | playlistkit.com is a live music-playlist product (round 1); GitHub 'suno-playlist-kit' |
| Playlist Knapsack | Plain | GitHub: kendale-hamilton/playlist-knapsack (0 stars, last push 2025-07): Playlist Knapsack trims a user's Spotify playlist to an exact length. |
| Playlist Messenger | Plain | Chrome, AMO and Edge: 'Red Messenger for Youtube' |
| Playlist Pilot | Plain | GitHub: EoghannIrving/playlist-pilot (1 star, last push 2026-03): Suggest additions to Jellyfin music playlists.; GitHub: aryaniyengar101/PlaylistPilot (0 stars, last push 2026-08): AI-powered playlist generator using FastAPI, React, OpenAI and SQLite. |
| Playlist Porter | Plain | GitHub: ReVG08/playlist-porter (1 star, last push 2026-10): Private, local-first Spotify ↔ TIDAL playlist transfers for macOS and…; GitHub: Bigpotatozz/PlaylistPorter (0 stars, last push 2026-03): Automated script designed to port Youtube playlist to other streaming… |
| Playlist Post | Plain | 'Posts' is a YouTube feature name; crowded with YouTube 'Posts' tools; playlistpost.com taken |
| Playlist Postmaster | Plain | Google Postmaster Tools is a Google product; USPTO POSTMASTER software for program transport |
| Playlist Ranger | Plain | Chrome: 'Youtube Playlist Ranger', 61 users |
| Playlist Relay | Plain | GitHub: Delonixx/playlist-relay (1 star, last push 2026-10): 歌单接力 · 本地文字歌单批量导入与 AI 音乐发现，支持网易云 / QQ 音乐、扫码登录、版本核对、歌单画像和口味反馈。歌单整理为测试功能… |
| Playlist Runner | Plain | GitHub: OneShot666/Playlist-Runner (3 stars, last push 2026-03): An custom software that can play the musics you want |
| Playlist Shelf | Plain | Chrome and AMO: 'Resume Shelf for YouTube' |
| Playlist Shepherd | Plain | USPTO: live SHEPHERD for music recordings; Chrome and AMO 'Tab Shepherd' tab tools |
| Playlist Sherpa | Plain | USPTO: live SHERPA for video streaming and video-on-demand services (Telestream) |
| Playlist Shortcuts | Plain | Chrome: 'Watch Later Highlighter & Playlist Shortcuts', 8 users; AMO: 'RemoveFromPlaylistShortcutYT', 7 users |
| Playlist Shuttle | Plain | Google Play: 'Shuttle Music Player' |
| Playlist Sidekick | Plain | Chrome: 'Sidekick' and 'YouTube Subtitle Sidekick', both YouTube tools |
| Playlist Sorter | Plain | Chrome: 'YouTube Playlist Sorter – Watch Later & More', 1,000 users; Chrome: 'Cleangarden - YouTube Playlist Sorter', 274 users |
| Playlist Squire | Plain | App Store: 'Xtream IPTV Player: Squire' |
| Playlist Switchboard | Plain | USPTO: live SWITCHBOARD for podcast and audio analytics software (Backtracks) |
| Playlist Tools | Plain | Chrome: 'playlist.tools - YouTube Playlist Manager', 636 users; Chrome: 'YouTube Playlist Tools', 292 users |
| Playlist Usher | Plain | USPTO: USHER is the singer's live mark for music and music videos |
| Playlist Wrangler | Plain | Chrome: 'Playlist Wrangler: Manager for YouTube', 444 users; AMO: 'Playlist Wrangler', 39 users |
| Save & Queue | Plain | Chrome: 'Save Ur Queue' (saves YouTube's queue); GitHub 'save_queue' |
| Save to Playlist | Plain | It is YouTube's own button label; GitHub has a Spicetify 'save-to-playlist' plugin |
| Playlist Badger | Mascot | Privacy Badger, a well-known browser extension (Edge) |
| Playlist Bee | Mascot | MusicBee, a well-known music player (Google Play 'MusicBee Remote'); Google Play 'Bee Video - Minimal Player' |
| Playlist Bluebird | Mascot | USPTO: BLUEBIRD record label mark (Victor/RCA) |
| Playlist Chipmunk | Mascot | Alvin and the Chipmunks music franchise; Google Play 'Chipmunks Music Journey' |
| Playlist Crow | Mascot | USPTO: live CROW for a phone app that sends videos and photos (Wildcard IP Holdings) |
| Playlist Dove | Mascot | USPTO: Unilever's live DOVE for multimedia streaming software; App Store radio 'The Dove' |
| Playlist Dovecote | Mascot | USPTO: live DOVECOTE for film and video production |
| Playlist Egret | Mascot | USPTO: live EGRET for a music-literature database (RILM) |
| Playlist Hamster | Mascot | Google Play: 'Hamster Player' |
| Playlist Heron | Mascot | GitHub: 'heron' music workstation (5 stars, active this week) |
| Playlist Homer | Mascot | Google Play: 'Homer Audio Player for Seniors' |
| Playlist Homing Pigeon | Mascot | Same 'Pigeon' problem: PigeonPod, a YouTube-playlist tool |
| Playlist Jackdaw | Mascot | GitHub: 'jackdaw' DJ tool (5 stars, active) and a 'Jackdaw' music-streaming app |
| Playlist Lark | Mascot | Google Play: 'Lark Player: Music Player & MP3' and 'Lark Video Player' |
| Playlist Linnet | Mascot | USPTO: live LINNET for a media company's recording app |
| Playlist Magpie | Mascot | Chrome 'Magpie - YouTube Summarizer'; AMO 'Magpie - Video Downloader'; Google Play 'Magpie - Browse & Save Media' |
| Playlist Otter | Mascot | Chrome: Otter.ai (300,000 users, transcribes YouTube) and 'Otter: Sync Youtube & Watch Together' |
| Playlist Owl | Mascot | AMO: 'OwlZoom for Youtube Videos' (1,047 users); Google Play 'Owl Player' |
| Playlist Penguin | Mascot | Penguin Books' marks cover audio and video; very well known |
| Playlist Perch | Mascot | Edge: 'Perch – Picture in Picture for every video'; Chrome 'Perch' tab tool |
| Playlist Pigeon | Mascot | PigeonPod (github.com/aizhimou/pigeon-pod, 1,195 stars, active, pigeonpod.cloud) turns YouTube channels and playlists into podcasts. Also the repo caseyjohnsonwv/playlist-pigeon (playlist converter) and Google Play's 'Pigeon Music' (radio) |
| Playlist Pigeons | Mascot | Same 'Pigeon' problem: PigeonPod; Google Play 'Pigeon Music' |
| Playlist Pika | Mascot | USPTO: live PIKA for video-creation apps (Pika, AI video) |
| Playlist Possum | Mascot | GitHub: NaeemBolchhi/Playlist-Possum (0 stars, last push 2020-09): TruTunes Experimental Media Player. |
| Playlist Puffin | Mascot | Puffin Cloud Browser and Puffin TV Browser (Google Play, App Store); USPTO PUFFIN audio gear |
| Playlist Puffling | Mascot | Too close to the Puffin browser family (Google Play, App Store) |
| Playlist Quokka | Mascot | GitHub: 'QuokkaPlayer' music player and 'quokka', a YouTube InnerTube package |
| Playlist Raccoon | Mascot | Chrome: 'TubeRaccoon For YouTube' |
| Playlist Raven | Mascot | Google Play: 'Raven Audiobook Player'; USPTO RAVEN music recordings |
| Playlist Retriever | Mascot | Chrome: 'YouTube Transcript Retriever' |
| Playlist Robin | Mascot | Google Play: 'Robin Mp3 offline music player' |
| Playlist Sparrow | Mascot | Google Play: 'Sparrow Player' |
| Playlist Squirrel | Mascot | Chrome: 'Summary Squirrel' and 'Squirrel Summary', both YouTube tools |
| Playlist Swift | Mascot | Google Play 'Swift Play: MP3 Music Player'; Taylor Swift; the Swift language |
| Playlist Wren | Mascot | GitHub: 'wren', a YouTube Music desktop client, and 'wren', a YouTube-playlist podcast tool, both active this month |
| Addly | Coinage | USPTO: live mark ADDLY (classes 40, 9, 6, 7; AMPRO INNOVATIONS PTY LTD); USPTO: live mark ADDLY (classes 35; Suzhou AmPro Limited) |
| Clipnest | Coinage | Chrome: 'ClipNest — Private Clipboard History', 6 users; Chrome: 'ClipNest' |
| Clipstash | Coinage | Chrome: 'ClipStash - Privacy-First Clipboard Manager', 8 users; Chrome: 'ClipStash', 13 users |
| Dashlist | Coinage | Google Play: 'DashList'; GitHub: udhavahuja/DashList (0 stars, last push 2026-07): A personal media tracking web application built with flask |
| Fileaway | Coinage | GitHub: inseven/fileaway (14 stars, last push 2026-10): Rules-based file management for macOS; GitHub: jgyasu/fileaway (6 stars, last push 2023-06): A nifty tool to sort your messy folders |
| Filebird | Coinage | GitHub: dev-lake/FileBird (8 stars, last push 2023-08): A Efficient File Transfer Software, Powered by Golang and gRPC. |
| Flicklist | Coinage | App Store: 'FlickLists' (Entertainment); App Store: 'FlickList:Track Shows & Movies' (Entertainment) |
| Flockit | Coinage | GitHub: smerritt/flockit (11 stars, last push 2012-08): LD_PRELOAD shim to add file locking to programs that don't do it (I'm…; GitHub: Ahtasham-ul-haq/Flockit (1 star, last push 2025-07): A professional enterprise-ready video conferencing app using Next.js 1… |
| Flockwise | Coinage | USPTO: live mark FLOCKWISE (classes 31; Kent Nutrition Group, Inc.); USPTO: live mark FLOCKWISE (classes 42; CAN Technologies, Inc.) |
| Gatherly | Coinage | Chrome: 'Gatherly - 리서치 자동화 및 정보 정리 도구', 36 users; App Store: 'Gatherly: Local Things to Do' (Lifestyle) |
| Keepsy | Coinage | Chrome: 'Keepsy'; App Store: 'Keepsy - chapter' (Lifestyle) |
| Keysave | Coinage | App Store: 'KeySave - Password Manager' (Utilities); GitHub: Cu3PO42/KeySAVe (34 stars, last push 2023-01): A cross platform KeySAV. Documentation: |
| Listcoop | Coinage | Google Play: 'ListCoop' |
| Listcraft | Coinage | Chrome: 'ListCraft AI', 4 users |
| Listfold | Coinage | GitHub: TCtobychen/ListFold (57 stars, last push 2021-03) |
| Listique | Coinage | App Store: 'Listique: Strategic Checklist' (Productivity); GitHub: bixl007/Listique (5 stars, last push 2025-04): Listique is a digital wishlist platform that enables users to create,… |
| Listlet | Coinage | App Store: 'Listlet: Recipe & Grocery List' (Productivity); Google Play: 'Gift Listlet' |
| Listling | Coinage | GitHub: noyainrain/listling (32 stars, last push 2021-09): Web app to make and edit lists collaboratively. |
| Listnest | Coinage | App Store: 'ListNest - רשימת קניות משותפת' (Shopping) |
| Listpost | Coinage | Dozens of 'ListPost' repos on GitHub |
| Nestlist | Coinage | App Store: 'NestList' (Utilities); App Store: 'Nestlist - Shopping List App' (Utilities) |
| Perchlist | Coinage | App Store: 'PerchList: Bird Life List' (Lifestyle) |
| Pigeonpost | Coinage | App Store: 'PigeonPost Companion' (Productivity); Google Play: 'Pigeonpost' |
| Pinlist | Coinage | App Store: 'Pinlist: App Wishlist' (Utilities); App Store: 'PinList : Shopping & Todo' (Utilities) |
| Playcoop | Coinage | App Store: 'PlayCoop' (Education) |
| Playfile | Coinage | Google Play: 'PlayFiles for Sonos'; TMview: Playfile (AU, classes 9, registered; Sherridyn Crotty) |
| Playnest | Coinage | App Store: 'PlayNest' (Business); App Store: 'PlayNest' (Sports) |
| Playpost | Coinage | AMO: 'Save to Playpost', 1 user; GitHub: jvandenaardweg/playpost-app (0 stars, last push 2020-01): Instant podcasts of every article. Turn every article on the web into… |
| Plisto | Coinage | TMview: PLISTO LA VEGA DE MAR MENOR S.L. (ES, classes 29, registered; LA VEGA DEL MAR MENOR, S.L.) |
| Pocketlist | Coinage | App Store: 'Quick PocketList' (Productivity); App Store: 'PocketList' (Productivity) |
| Postlist | Coinage | Dozens of 'PostList' repos on GitHub |
| Queuebird | Coinage | GitHub: Empathos/queuebird (0 stars, last push 2026-08): Private, restricted remote control for YouTube Music. Let AI agents sa… |
| Queuely | Coinage | GitHub: Saisathvik94/Queuely (2 stars, last push 2026-05): Queuely provides reliable notification infrastructure for modern appli…; GitHub: Queuely/queuely (0 stars, last push 2016-11): Make Queueing Great Again |
| Queuewise | Coinage | GitHub: Ahmed-Khalil-Mohamed/queuewise (0 stars, last push 2026-10): Bilingual reception queue for small teams. Priority-aware check-in, fa…; GitHub: abhishekmitraaa/queuewise (0 stars, last push 2026-10): QueueWise: delay-aware queue management lab. Interactive bufferbloat s… |
| Quickstow | Coinage | TMview: QUICKSTOW (EM, classes 6, 37, registered; Rhino Products Limited); TMview: QUICKSTOW (GB, classes 6, 37, registered; Rhino Products Limited) |
| Roostlist | Coinage | AMO: 'Roost List' |
| Savebird | Coinage | TMview: SAVEBIRDS (RU, classes 9, 17, registered; Закрытое акционерное общество "НПО "Изолятор") |
| Saveling | Coinage | App Store: 'Saveling: Budget & Savings Pet' (Finance) |
| Savely | Coinage | Chrome: 'Savely - Price Comparison, Find Lower Prices', 6,000 users; Chrome: 'Savely', 8 users |
| Savemark | Coinage | Chrome: 'SaveMark - Media Downloader for Instagram', 23 users; App Store: 'SaveMark' (Productivity) |
| Savestack | Coinage | Several 2026 GitHub projects, one a save-and-organise web app |
| Savewise | Coinage | Chrome: 'Savewise: Stack Cashback Shopping Portals & Maximize Credit Card Rewards', 10,000 users; AMO: 'Savewise: Cashback Comparison', 341 users |
| Savvio | Coinage | Chrome: 'Savvio', 7 users; App Store: 'Savvio: Find the Best Price' (Shopping) |
| Slotlist | Coinage | slotlist.info, an ArmA 3 mission tool (GitHub, 16 stars) |
| Snaplist | Coinage | Chrome: 'ChatGPT SnapList', 175 users; Chrome: 'SnapList', 23 users |
| Stacklist | Coinage | Chrome: 'Stacklist', 412 users; AMO: 'Stacklist', 16 users |
| Stashlist | Coinage | Chrome: 'Stashlist', 7 users; GitHub: jramke/stashlist (22 stars, last push 2026-10): The Creative Vault for your resources —  Stashlist is an all in one bo… |
| Stashly | Coinage | Chrome: 'Stashly', 18 users; Chrome: 'Stashly: Save Articles & Read Later - Pocket Alternative', 24 users |
| Stowaway | Coinage | Google Play: 'Stowaway: Hidden Words'; USPTO: live mark STOWAWAY (classes 12; Ironwood Pacific, Inc.) |
| Stowly | Coinage | Chrome: 'Stowly', 4 users; App Store: 'Stowly - Your AI Story Teller' (Book) |
| Tabflock | Coinage | Chrome: 'TabFlock', 14 users |
| Tabherd | Coinage | GitHub: wire2c7/tabherd (0 stars, last push 2026-10): TabHerd - Auto Tab Groups: Chrome extension that automatically manages… |
| Tabroost | Coinage | GitHub: Scrooge-777/tabroost (0 stars, last push 2026-10): 🪺 Tabroost: Edge-style workspaces for Brave and Chrome (Manifest V3).… |
| Tapsave | Coinage | Chrome: 'TapSave - Video & Image Downloader', 113 users; App Store: 'TapSave: Video Downloader' (Utilities) |
| Tuckaway | Coinage | Chrome: 'Tuckaway — Save Articles & Read Later (Pocket Alternative)', 4 users; App Store: 'Tuckaway: Baby Screen Lock' (Utilities) |
| Tuckit | Coinage | Chrome: 'Tuckit — drag a timer out of any page', 4 users; App Store: 'TUCKiT – Card Wallet' (Utilities) |
| Tucklist | Coinage | App Store: 'Tucklist: Night Routine' (Lifestyle); Google Play: 'Tucklist: Night Routine' |
| Tuneloft | Coinage | Google Play: 'TuneLoft: IPTV & Media Player'; Google Play: 'Tuneloft Companion' |
| Listpad | Tool | Google Play: 'Listpad' |
| Listsmith | Tool | Chrome: 'Listsmith — Etsy SEO Title, Tag & Description Rewrites', 5 users; Chrome: 'ListSmith', 6 users |
| Listwork | Tool | Google Play: 'Global ListWork'; Google Play: 'ListWork Proveedor' |
| Listwright | Tool | App Store: 'ListWright' (Productivity) |
| Playbench | Tool | App Store: 'Playbench' (Entertainment); Google Play: 'Playbench' |
| Playlist Console | Tool | GitHub: rsgoheen/PlayListConsole (0 stars, last push 2014-05): .NET app for creating randomized playlists |
| Playlist Control | Tool | AMO: 'yt-better-playlist-control', 1 user; GitHub: caio-kenai/Playlist-Control (1 star, last push 2026-09): Central de configuração e operação do Playlist Digital: mapas, grades,… |
| Playlist Deck | Tool | GitHub: malpern/playlist-deck (0 stars, last push 2025-06): TweetDeck-style YouTube playlist dashboard for macOS built with Electr… |
| Playlist Desk | Tool | Chrome: 'Playlist Desk', 46 users; AMO: 'Playlist Desk', 1 user |
| Playlist Dock | Tool | Chrome: 'YouTube Chat Dock' and 'CommentDock' |
| Playlist Hub | Tool | Google Play: 'IPTV Player: Playlist Hub'; GitHub: 20essentials/PlaylistHub (5 stars, last push 2026-06): PlaylistHub es una aplicación web de música que organiza las mejores c… |
| Playlist Junction | Tool | Google Play 'Grand Junction Media'; USPTO JUNCTION digital-content software |
| Playlist Keys | Tool | Crowded: 'Media Keys for Youtube', 'YouTube Quick Keys', 'Better Media Keys for YouTube' |
| Playlist Mixer | Tool | Chrome and AMO 'YouTube Mixer'; GitHub 'playlist-mixer' (mixes YouTube playlists) |
| Playlist Panel | Tool | Chrome and AMO: 'Control Panel for YouTube' (100,000 users) |
| Playlist Quickbar | Tool | Chrome: 'YouTube QuickBar' (145 users) |
| Playlist Railyard | Tool | Google Play: 'Media Railyard' |
| Playlist Remote | Tool | Chrome: 'YT Remote' (2,000 users) and 'YouTube Remote' |
| Playlist Station | Tool | Crowded with music apps: 'Station Shuffle: Mix Playlists', 'Media Station X' |
| Playlist Switch | Tool | AMO: 'Switch for YouTube' and 'YouTube Alternative Switch' |
| Playlist Toolbox | Tool | Crowded: 'YouBo - Toolbox for YouTube', 'YT Toolbox', 'YouTube Toolbox' on Chrome; Google Play 'Music Toolbox' |
| Playlist Toolkit | Tool | Google Play: 'Playlist Toolkit' |
| Playlist Turntable | Tool | USPTO: live TURNTABLE for music streaming (TTFM Labs) |
| Playlist Utility | Tool | Chrome: 'Youtube Utility'; AMO 'Simple YouTube Utility' |
| Playlist Workbench | Tool | Chrome: 'Channel Workbench Fix Assist', a YouTube Studio tool |
| Playrack | Tool | Chrome: 'Playrack - Video Bookmarks Manager', 46 users; TMview: playracks (DE, classes 6, 41, registered; Markert, Mertens, Haussteiner GbR (Vertretungsbere) |
| Queue Desk | Tool | GitHub: Mohammad3322/QueueDesk (1 star, last push 2026-09): QueueDesk is a browser-based customer-support operations application f…; GitHub: strataga/queuedesk (0 stars, last push 2026-10): QueueDesk — durable payment-instruction lab (Spring Boot, Postgres out… |
| Queuebench | Tool | GitHub: ManojKumarChunduru/QueueBench (0 stars, last push 2026-07): Workqueue strategy simulator for AR follow-up. Paired-randomness exper… |
| Queueboard | Tool | GitHub: sedki1223/queueboard (0 stars, last push 2026-10): A Next.js queue management app for service desks.; GitHub: ryana/queueboard (0 stars, last push 2026-07): A lightweight shared work queue for small teams |
| Saveboard | Tool | Chrome: 'Saveboard', 4 users; App Store: 'SaveBoard' (Productivity) |
| Savesmith | Tool | GitHub: gundamff/SaveSmith (6 stars, last push 2026-10): 开源单机游戏存档修改器。 |
| Binge Bin | Playful | GitHub: rahulfzsec999-bot/Binge-Bin (0 stars, last push 2026-09): Watch list |
| Bop Box | Playful | TMview: Hansot BopBox (KR, classes 30, registered; 주식회사 한솥); TMview: HANSOT BOPBOX (US, classes 30, filed; Hansot Co., Ltd.) |
| Bop Pigeon | Playful | Same 'Pigeon' problem: PigeonPod, a YouTube-playlist tool |
| Clip Caddy | Playful | Chrome: 'ClipCaddy' |
| Jam Jar | Playful | App Store: 'JamJars - Savings Tracker' (Productivity); App Store: 'JamJar Music' (Music) |
| Listen Later | Playful | Chrome: 'Listen Later', 424 users; Chrome: 'Katalog - Save any article to listen later', 25 users |
| Playlist Buddy | Playful | App Store: 'Playlist Buddy' (Music); GitHub: grantpeterwilliamson/Playlist_buddy (2 stars, last push 2025-08): Two-way Jellyfin playlist sync tool |
| Playlist Elf | Playful | Google Play: 'Elf Musician: Offline Player' |
| Playlist Genie | Playful | Google Play: 'Genie Player', 'Music Genie' |
| Playlist Gnome | Playful | GNOME, a well-known desktop project |
| Playlist Goblin | Playful | Chrome: 'Timestamp Goblin' (YouTube progress); AMO 'ViewGoblin for YouTube' |
| Playlist Gremlins | Playful | Warner Bros.' GREMLINS |
| Playlist Hero | Playful | Chrome: 'Practice Hero: YouTube Music Looper'; GoPro's HERO |
| Playlist Ninja | Playful | Crowded: 'YouTube Ninja', 'Ninja Listening Trainer for YouTube'; Google Play 'Ninja Player' |
| Playlist Pal | Playful | App Store: 'PlaylistPal' (Music); GitHub: smadigan91/playlist-pal (2 stars, last push 2025-05): Create collaborative playlists and socialize with those that have simi… |
| Playlist Party | Playful | Crowded with watch-party extensions ('Youtube Watch Party', Teleparty) |
| Playlist Pixie | Playful | Chrome: 'Youtube Transcript Pixie' |
| Playlist Sprite | Playful | Coca-Cola's SPRITE; Google Play 'Sprite animation player' |
| Playlist Wizard | Playful | Edge 'Playlist Time Wizard'; App Store 'TuneWizard: Playlist Maker'; Chrome 'TubeWizard' |
| Queue Goblin | Playful | Same 'Goblin' problem: 'Timestamp Goblin' and 'ViewGoblin for YouTube' |
| Queue Pigeon | Playful | Same 'Pigeon' problem: PigeonPod, a YouTube-playlist tool |
| Queue Puffin | Playful | Puffin Cloud Browser and Puffin TV Browser (Google Play, App Store) |
| Snack Sack | Playful | USPTO: live mark SNACK SACK (classes 21; Planet Ventures, Inc.) |
| Snack Stack | Playful | Chrome: 'Snack Stack Rush'; App Store: 'Snack Stack Shuffle' (Games) |
| Tab Herder | Playful | Chrome: 'Tab Herder', 6 users |
| Tab Lasso | Playful | Chrome: 'Tab Lasso', 1,000 users; Chrome: 'Tab-Lasso' |
| Tab Roundup | Playful | Chrome: 'One-Click Tab Round Up'; GitHub 'tabroundup' Chrome extension |
| Tab Shepherd | Playful | Chrome: 'Tab Shepherd', 9 users; AMO: 'Tab Shepherd', 1 user |
| Tab Tamer | Playful | Chrome: 'Tab Tamer', 32 users; Chrome: 'Nurbid Tab-Tamer', 6 users |
| Tab Wrangler | Playful | Chrome: 'Tab Wrangler', 70,000 users; AMO: 'Tab Wrangler', 1,617 users |
| Tune Coop | Playful | GitHub: polyg314/TuneCoop (0 stars, last push 2015-01): Music sharing with friends |

## Passed, but not shortlisted

These passed every check that ran, but fit less well than the finalists.

| Name | Style | Why it wasn't shortlisted |
|---|---|---|
| Playlist Attendant | Plain | flat |
| Playlist Carrier | Plain | Carrier is a big air-conditioning brand |
| Playlist Clerk | Plain | Clerk is a well-known developer sign-in product |
| Playlist Doorman | Plain | a doorman keeps things out; wrong job |
| Playlist Errands | Plain | reads oddly in the plural |
| Playlist Foreman | Plain | bossy; George Foreman |
| Playlist Gatherer | Plain | 'Gatherer' is Magic: The Gathering's card database |
| Playlist Herald | Plain | a herald announces; wrong job |
| Playlist Muster | Plain | military feel |
| Playlist Pickup | Plain | pickup trucks and dating connotations |
| Playlist Postbox | Plain | Postbox is an e-mail client |
| Playlist Pouch | Plain | Satchel says the same, better |
| Playlist Quiver | Plain | Quiver is a known notes app; QuiverVision AR marks |
| Playlist Router | Plain | network jargon; a small 'playlist-router' repo |
| Playlist Runabout | Plain | odd |
| Playlist Steward | Plain | formal, says little |
| Playlist Valet | Plain | valet-parking feel; playlistvalet.com taken |
| Quick Save & Queue | Plain | Save, Queue & Gather covers more |
| Playlist Beagle | Mascot | weak fit |
| Playlist Beaver | Mascot | unwanted slang |
| Playlist Collie | Mascot | same idea as Sheepdog, which reads clearer |
| Playlist Corgi | Mascot | App Store 'Hungry Corgi: Cute Music Game'; Corgi toys |
| Playlist Cormorant | Mascot | obscure |
| Playlist Dachshund | Mascot | hard to spell |
| Playlist Dormouse | Mascot | sleepy |
| Playlist Ferret | Mascot | weak fit |
| Playlist Finch | Mascot | Finch is a big self-care app |
| Playlist Gopher | Mascot | Gopher protocol and Go's mascot |
| Playlist Hedgehog | Mascot | Sonic the Hedgehog |
| Playlist Kestrel | Mascot | a hunting bird; weak fit |
| Playlist Kingfisher | Mascot | busy brand (retailer, beer, a Swift library) |
| Playlist Marmot | Mascot | Marmot outdoor brand |
| Playlist Mockingbird | Mascot | long; a 0-star 'Mockingbird' playlist player repo |
| Playlist Nuthatch | Mascot | obscure |
| Playlist Pelican | Mascot | Pelican cases are a big brand |
| Playlist Sandpiper | Mascot | dormant 'SandPiper' playlist-transfer repo |
| Playlist Swallow | Mascot | unfortunate verb |
| Playlist Tern | Mascot | obscure |
| Playlist Terrier | Mascot | weak fit |
| Playlist Weaver | Mascot | iWeaver AI and Weaver dating app |
| Playlist Woodpecker | Mascot | pecking; weak fit |
| Flocklist | Coinage | two small repos; Listbird says it better |
| Hoardlist | Coinage | hoarding connotation |
| Listherd | Coinage | hard to say |
| Queuepost | Coinage | says little |
| Roundlist | Coinage | says little |
| Sendlist | Coinage | a 2016 'sendlist' app repo; says 'send' |
| Wingsave | Coinage | Listwing says it better |
| Listbench | Tool | says little |
| Listdeck | Tool | a small 'ListDeck' repo; says little |
| Listrack | Tool | 'LisTrack' browser-activity repos |
| Playlist Bench | Tool | Bench clothing brand |
| Playlist Cockpit | Tool | USPTO COCKPIT music recordings; weak fit |
| Playlist Instruments | Tool | odd |
| Binge Basket | Playful | a small 'binge-basket' repo; video only |
| Bop Basket | Playful | Bop Bucket says the same |
| Bop Satchel | Playful | Satchel is shortlisted already |
| Jam Satchel | Playful | Satchel is shortlisted already |
| Playlist Gremlin | Playful | gremlins break things |
| Playlist Imp | Playful | mischief connotation |
| Playlist Lasso | Playful | Chrome 'Tab Lasso' (1,000 users) and 'Tab-Lasso' nearby |
| Queue Critter | Playful | Queue Crew says the same |
| Tab Corral | Playful | names only the tab-gathering feature |
| Tune Tote | Playful | music only |

## Waiting on TMview

These second-batch names passed the stores, GitHub, USPTO and both app stores, but TMview wasn't run for them ([Limits](#limits)). They can't be called clean yet.

- **Plain:** Playlist Bindle, Playlist Dispatcher, Playlist Drover, Playlist Envoy, Playlist Errand, Playlist Ferryman, Playlist Footman, Playlist Go-Between, Playlist Gofer, Playlist Liaison, Playlist Packhorse, Playlist Rucksack, Playlist Tote.
- **Mascot:** Playlist Budgie, Playlist Chickadee, Playlist Coop, Playlist Dunnock, Playlist Gannet, Playlist Goldfinch, Playlist Hoopoe, Playlist Kangaroo, Playlist Lemur, Playlist Loft, Playlist Myna, Playlist Oriole, Playlist Parakeet, Playlist Pipit, Playlist Rock Dove, Playlist Roost, Playlist Siskin, Playlist Stoat, Playlist Thrush, Playlist Vole, Playlist Warbler, Playlist Waxwing, Playlist Weasel, Playlist Wombat.
- **Coinage:** Bunchlist, Gatherbird, Listflock, Listloft, Listroost, Loftlist, Pilelist, Playlette, Playloft, Playroost, Plucklist, Queueflock, Queuelet, Queueloft, Queuenest, Stashbird, Tabcoop.
- **Tool:** Playlist Depot, Playlist Keyring, Playlist Post Office, Playlist Signal Box, Playlist Sorting Office, Playlist Switchyard, Playlist Terminal, Queuesmith.
- **Playful:** Bop Bag, Bop Bin, Bop Courier, Bop Pouch, Bop Shop, Clip Coop, Jam Pouch, Keys & Queues, Queue Coop, Queue Kangaroo, Tune Pouch.

## Limits

- **TMview blocked this machine partway through.** After about 450 searches and 90 detail lookups, TMview's firewall answered every request with a challenge page (from about 03:01 local time). It ran for the first 232 names and missed nine of them, all rejected for other reasons. It didn't run for the second batch of 120. WIPO's Global Brand Database needs a proof-of-work captcha, and France's INPI is behind Cloudflare, so neither replaced it. That's why Playlist Starling is a near miss and 73 names are waiting.
- **Goods were read for US marks only.** For TMview matches, owners and classes were read and goods only where a detail lookup ran (Pigeon, Courier). Where an owner was unknown and its classes touched 9, 38 or 41, the finalist table says so.
- **Store searches are fuzzy.** Each name was searched twice per store (the name, and its main word with "youtube"). A listing that ranks low for both could be missed.
- **The web search is US-only and a sample**, not a full clearance.
- **Domains:** "free" means RDAP has no record. It doesn't mean the name is cheap or unparked.
- **None of this is legal advice.** Before launch, a trademark search by a professional is the safe step for the chosen name.

## Sources

- Chrome Web Store search, `https://chromewebstore.google.com/search/<query>`
- AMO API, `https://addons.mozilla.org/api/v5/addons/search/`
- Edge Add-ons, `https://microsoftedge.microsoft.com/addons/v4/getfilteredorderedsearch`
- GitHub search API through `gh api search/repositories`
- USPTO trademark search backend, `https://tmsearch.uspto.gov/prod-stage-v1-0-0/tmsearch` (from the site's `configuration.json`)
- TMview, `https://www.tmdn.org/tmview/api/search/results` and `/api/trademark/detail/<ST13>`
- iTunes Search API, `https://itunes.apple.com/search?entity=software`
- Google Play search, `https://play.google.com/store/search?c=apps`
- RDAP: `https://rdap.verisign.com/com/v1/domain/` and `https://pubapi.registry.google/rdap/domain/`
- PigeonPod: [github.com/aizhimou/pigeon-pod](https://github.com/aizhimou/pigeon-pod), [selfhostyourself.com/services/pigeonpod](https://selfhostyourself.com/services/pigeonpod)
- Pigeon Music on Google Play: `https://play.google.com/store/apps/details?id=com.gta.pigeonmusic025`
- Starling audio player: [compuphase.com/mp3/h0440_en.htm](https://compuphase.com/mp3/h0440_en.htm)
- Save Ur Queue: [extensionauditor.com/scan/save-ur-queue-pnkgkdgajopoinooeegninojgaddieep](https://extensionauditor.com/scan/save-ur-queue-pnkgkdgajopoinooeegninojgaddieep)
- The Sheepdogs: [en.wikipedia.org/wiki/The_Sheepdogs](https://en.wikipedia.org/wiki/The_Sheepdogs); Bowerbirds: [consequence.net](https://consequence.net/2012/03/spotify-playlist-bowerbirds-phil-moore)
- Postie WordPress plugin: [wordpress.org/plugins/postie](https://fr.wordpress.org/plugins/postie)
- bop.fm: [venturebeat.com](https://venturebeat.com/technology/bop-fm-is-a-remote-control-for-your-music-apps-and-its-now-2m-richer)
