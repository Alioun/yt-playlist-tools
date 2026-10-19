# Ask AMO whether 2.0 can declare no data collection

Type: task
Status: open
Labels: wayfinder:task
Part of: [Rebuild (2.0)](../map.md)

## Question

AMO's definition of data "transmission" doesn't clearly exempt requests sent only to the site the user is on ([ticket 03](03-store-policy.md)). Ask AMO's reviewers, through the add-on's developer hub or the add-ons Matrix room, three things:
- Does `data_collection_permissions: none` cover an add-on whose only network requests go to YouTube, through the user's own session?
- Does settings sync through `storage.sync` count as transmission?
- Do reviewers accept a Bun build for source-code submission?

The agent drafts the message; the user sends it. Record the replies, including the fallback if the answer is no: declaring `websiteActivity`, with a Firefox 140+ minimum.
