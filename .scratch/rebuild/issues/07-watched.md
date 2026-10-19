# When does auto-add count a video as watched?

Type: grilling
Status: open
Labels: wayfinder:grilling
Part of: [Rebuild (2.0)](../map.md)

## Question

What does "watched" mean for auto-add, and what does the user control?

Today, details in inventory.md under "Auto-add":
- It measures the playhead position as a percentage of the duration, checked on every `timeupdate`.
- Seeking past the threshold counts, and a `&t=` start can fire immediately.
- Ads aren't excluded.
- Live streams, premieres and Shorts never fire.
- The miniplayer disarms it.
- There's no on/off switch.

Settle:
- playhead position vs time actually played;
- ads;
- live streams, premieres and stream replays;
- Shorts (approved), given that they loop and are short;
- replays and coming back to a video;
- background tabs and the miniplayer;
- the threshold's range, and whether it's per playlist;
- an on/off switch, and pausing auto-add for one video or session.
