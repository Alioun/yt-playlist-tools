import type { JsonObject } from "../../../src/shared/contracts/json"
import type { SharedOptionChange } from "../../../src/background/store/settings-edit"

export const initial: JsonObject = {
  "schema": 1,
  "device": { "id": "starting-fixture", "consent": { "v": 1, "at": 1 }, "syncOn": false },
  "doc:settings": {
    "v": 1,
    "gen": "settings-0",
    "at": 1,
    "by": "starting-fixture",
    "extension": { "keep": "envelope" },
    "data": {
      "theme": "system",
      "undoKey": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
      "autoAdd": { "on": false, "feedback": true, "pct": 50, "toolbarTick": true, "toolbarPaused": true, "futureAuto": { "keep": true } },
      "shortcuts": {
        "on": false,
        "feedback": true,
        "music": false,
        "preset": true,
        "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
        "list": [
          {
            "id": "save01",
            "key": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
            "label": "Kept shortcut",
            "watchLaterOnEveryAccount": true,
            "futureRow": ["keep"]
          }
        ]
      },
      "quickSave": { "on": false, "feedback": true, "shortsShelves": false },
      "queueButton": { "on": false, "feedback": true, "corner": "top-left" },
      "watchButton": { "on": false, "feedback": true, "shorts": false },
      "cardMenu": { "on": false, "keepLinkMenu": false },
      "browserMenu": { "on": false, "feedback": true },
      "musicSection": false,
      "musicActions": {
        "on": false,
        "feedback": true,
        "preset": true,
        "buttons": { "next": true, "queue": true, "save": false, "like": false, "remove": false, "bar": false, "library": false, "mix": false, "album": false, "artist": false, "futureButton": true }
      },
      "musicKeys": {
        "on": false,
        "feedback": true,
        "preset": true,
        "keys": {
          "next": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "queue": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "save": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "like": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "remove": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "library": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "mix": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "album": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "artist": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } }
        }
      },
      "anyTabKeys": { "on": false, "feedback": true },
      "gather": {
        "on": false,
        "feedback": true,
        "to": "player",
        "order": "newest",
        "close": false,
        "auto": { "unvisited": true, "after": "1d", "background": true, "count": true, "n": 10, "futureTrigger": ["keep"] }
      },
      "futureRoot": { "keep": ["unknown", 0, null] }
    }
  },
  "sync": { "joined": null, "pushed": {}, "status": "off", "editedSinceOff": false, "everEdited": false, "futureHistory": ["keep"] },
  "doc:setup:AAAAAAAAAAAAAAAA": { "v": 1, "gen": "setup-0", "at": 1, "by": "starting-fixture", "data": { "quickSave": "PL_saved", "gather": "PL_gather", "targets": { "save01": "PL_shortcut" } } },
  "doc:filter:AAAAAAAAAAAAAAAA:PL_saved": { "v": 1, "gen": "filter-0", "at": 1, "by": "starting-fixture", "data": { "on": true, "mode": "deny", "channels": [["UCaaaaaaaaaaaaaaaaaaaaaa", "Kept"]] } },
  "progress:AAAAAAAAAAAAAAAA:0": { "kept": [1, 2] },
  "skips": { "kept": true },
  "undo": { "kept": true },
  "gatherHistory": { "kept": [3] },
  "unclaimed": null,
  "unrelated": { "kept": [false, null, "🙂"] }
}

export const cases: readonly { readonly name: string; readonly change: SharedOptionChange; readonly expectedSettings: JsonObject }[] = [
  {
    "name": "autoAdd.feedback",
    "change": { "kind": "option", "field": "autoAdd.feedback", "value": false },
    "expectedSettings": {
      "theme": "system",
      "undoKey": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
      "autoAdd": { "on": false, "feedback": false, "pct": 50, "toolbarTick": true, "toolbarPaused": true, "futureAuto": { "keep": true } },
      "shortcuts": {
        "on": false,
        "feedback": true,
        "music": false,
        "preset": true,
        "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
        "list": [
          {
            "id": "save01",
            "key": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
            "label": "Kept shortcut",
            "watchLaterOnEveryAccount": true,
            "futureRow": ["keep"]
          }
        ]
      },
      "quickSave": { "on": false, "feedback": true, "shortsShelves": false },
      "queueButton": { "on": false, "feedback": true, "corner": "top-left" },
      "watchButton": { "on": false, "feedback": true, "shorts": false },
      "cardMenu": { "on": false, "keepLinkMenu": false },
      "browserMenu": { "on": false, "feedback": true },
      "musicSection": false,
      "musicActions": {
        "on": false,
        "feedback": true,
        "preset": true,
        "buttons": { "next": true, "queue": true, "save": false, "like": false, "remove": false, "bar": false, "library": false, "mix": false, "album": false, "artist": false, "futureButton": true }
      },
      "musicKeys": {
        "on": false,
        "feedback": true,
        "preset": true,
        "keys": {
          "next": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "queue": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "save": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "like": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "remove": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "library": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "mix": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "album": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "artist": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } }
        }
      },
      "anyTabKeys": { "on": false, "feedback": true },
      "gather": {
        "on": false,
        "feedback": true,
        "to": "player",
        "order": "newest",
        "close": false,
        "auto": { "unvisited": true, "after": "1d", "background": true, "count": true, "n": 10, "futureTrigger": ["keep"] }
      },
      "futureRoot": { "keep": ["unknown", 0, null] }
    }
  },
  {
    "name": "shortcuts.feedback",
    "change": { "kind": "option", "field": "shortcuts.feedback", "value": false },
    "expectedSettings": {
      "theme": "system",
      "undoKey": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
      "autoAdd": { "on": false, "feedback": true, "pct": 50, "toolbarTick": true, "toolbarPaused": true, "futureAuto": { "keep": true } },
      "shortcuts": {
        "on": false,
        "feedback": false,
        "music": false,
        "preset": true,
        "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
        "list": [
          {
            "id": "save01",
            "key": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
            "label": "Kept shortcut",
            "watchLaterOnEveryAccount": true,
            "futureRow": ["keep"]
          }
        ]
      },
      "quickSave": { "on": false, "feedback": true, "shortsShelves": false },
      "queueButton": { "on": false, "feedback": true, "corner": "top-left" },
      "watchButton": { "on": false, "feedback": true, "shorts": false },
      "cardMenu": { "on": false, "keepLinkMenu": false },
      "browserMenu": { "on": false, "feedback": true },
      "musicSection": false,
      "musicActions": {
        "on": false,
        "feedback": true,
        "preset": true,
        "buttons": { "next": true, "queue": true, "save": false, "like": false, "remove": false, "bar": false, "library": false, "mix": false, "album": false, "artist": false, "futureButton": true }
      },
      "musicKeys": {
        "on": false,
        "feedback": true,
        "preset": true,
        "keys": {
          "next": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "queue": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "save": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "like": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "remove": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "library": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "mix": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "album": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "artist": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } }
        }
      },
      "anyTabKeys": { "on": false, "feedback": true },
      "gather": {
        "on": false,
        "feedback": true,
        "to": "player",
        "order": "newest",
        "close": false,
        "auto": { "unvisited": true, "after": "1d", "background": true, "count": true, "n": 10, "futureTrigger": ["keep"] }
      },
      "futureRoot": { "keep": ["unknown", 0, null] }
    }
  },
  {
    "name": "quickSave.feedback",
    "change": { "kind": "option", "field": "quickSave.feedback", "value": false },
    "expectedSettings": {
      "theme": "system",
      "undoKey": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
      "autoAdd": { "on": false, "feedback": true, "pct": 50, "toolbarTick": true, "toolbarPaused": true, "futureAuto": { "keep": true } },
      "shortcuts": {
        "on": false,
        "feedback": true,
        "music": false,
        "preset": true,
        "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
        "list": [
          {
            "id": "save01",
            "key": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
            "label": "Kept shortcut",
            "watchLaterOnEveryAccount": true,
            "futureRow": ["keep"]
          }
        ]
      },
      "quickSave": { "on": false, "feedback": false, "shortsShelves": false },
      "queueButton": { "on": false, "feedback": true, "corner": "top-left" },
      "watchButton": { "on": false, "feedback": true, "shorts": false },
      "cardMenu": { "on": false, "keepLinkMenu": false },
      "browserMenu": { "on": false, "feedback": true },
      "musicSection": false,
      "musicActions": {
        "on": false,
        "feedback": true,
        "preset": true,
        "buttons": { "next": true, "queue": true, "save": false, "like": false, "remove": false, "bar": false, "library": false, "mix": false, "album": false, "artist": false, "futureButton": true }
      },
      "musicKeys": {
        "on": false,
        "feedback": true,
        "preset": true,
        "keys": {
          "next": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "queue": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "save": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "like": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "remove": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "library": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "mix": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "album": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "artist": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } }
        }
      },
      "anyTabKeys": { "on": false, "feedback": true },
      "gather": {
        "on": false,
        "feedback": true,
        "to": "player",
        "order": "newest",
        "close": false,
        "auto": { "unvisited": true, "after": "1d", "background": true, "count": true, "n": 10, "futureTrigger": ["keep"] }
      },
      "futureRoot": { "keep": ["unknown", 0, null] }
    }
  },
  {
    "name": "queueButton.feedback",
    "change": { "kind": "option", "field": "queueButton.feedback", "value": false },
    "expectedSettings": {
      "theme": "system",
      "undoKey": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
      "autoAdd": { "on": false, "feedback": true, "pct": 50, "toolbarTick": true, "toolbarPaused": true, "futureAuto": { "keep": true } },
      "shortcuts": {
        "on": false,
        "feedback": true,
        "music": false,
        "preset": true,
        "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
        "list": [
          {
            "id": "save01",
            "key": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
            "label": "Kept shortcut",
            "watchLaterOnEveryAccount": true,
            "futureRow": ["keep"]
          }
        ]
      },
      "quickSave": { "on": false, "feedback": true, "shortsShelves": false },
      "queueButton": { "on": false, "feedback": false, "corner": "top-left" },
      "watchButton": { "on": false, "feedback": true, "shorts": false },
      "cardMenu": { "on": false, "keepLinkMenu": false },
      "browserMenu": { "on": false, "feedback": true },
      "musicSection": false,
      "musicActions": {
        "on": false,
        "feedback": true,
        "preset": true,
        "buttons": { "next": true, "queue": true, "save": false, "like": false, "remove": false, "bar": false, "library": false, "mix": false, "album": false, "artist": false, "futureButton": true }
      },
      "musicKeys": {
        "on": false,
        "feedback": true,
        "preset": true,
        "keys": {
          "next": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "queue": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "save": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "like": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "remove": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "library": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "mix": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "album": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "artist": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } }
        }
      },
      "anyTabKeys": { "on": false, "feedback": true },
      "gather": {
        "on": false,
        "feedback": true,
        "to": "player",
        "order": "newest",
        "close": false,
        "auto": { "unvisited": true, "after": "1d", "background": true, "count": true, "n": 10, "futureTrigger": ["keep"] }
      },
      "futureRoot": { "keep": ["unknown", 0, null] }
    }
  },
  {
    "name": "queueButton.corner",
    "change": {
      "kind": "option",
      "field": "queueButton.corner",
      "value": "bottom-right"
    },
    "expectedSettings": {
      "theme": "system",
      "undoKey": {
        "char": "n",
        "code": "KeyN",
        "ctrl": false,
        "alt": true,
        "shift": false,
        "meta": false,
        "futureKey": {
          "keep": [1, null]
        }
      },
      "autoAdd": {
        "on": false,
        "feedback": true,
        "pct": 50,
        "toolbarTick": true,
        "toolbarPaused": true,
        "futureAuto": {
          "keep": true
        }
      },
      "shortcuts": {
        "on": false,
        "feedback": true,
        "music": false,
        "preset": true,
        "picker": {
          "char": "n",
          "code": "KeyN",
          "ctrl": false,
          "alt": true,
          "shift": false,
          "meta": false,
          "futureKey": {
            "keep": [1, null]
          }
        },
        "list": [
          {
            "id": "save01",
            "key": {
              "char": "n",
              "code": "KeyN",
              "ctrl": false,
              "alt": true,
              "shift": false,
              "meta": false,
              "futureKey": {
                "keep": [1, null]
              }
            },
            "label": "Kept shortcut",
            "watchLaterOnEveryAccount": true,
            "futureRow": ["keep"]
          }
        ]
      },
      "quickSave": {
        "on": false,
        "feedback": true,
        "shortsShelves": false
      },
      "queueButton": {
        "on": false,
        "feedback": true,
        "corner": "bottom-right"
      },
      "watchButton": {
        "on": false,
        "feedback": true,
        "shorts": false
      },
      "cardMenu": {
        "on": false,
        "keepLinkMenu": false
      },
      "browserMenu": {
        "on": false,
        "feedback": true
      },
      "musicSection": false,
      "musicActions": {
        "on": false,
        "feedback": true,
        "preset": true,
        "buttons": {
          "next": true,
          "queue": true,
          "save": false,
          "like": false,
          "remove": false,
          "bar": false,
          "library": false,
          "mix": false,
          "album": false,
          "artist": false,
          "futureButton": true
        }
      },
      "musicKeys": {
        "on": false,
        "feedback": true,
        "preset": true,
        "keys": {
          "next": {
            "char": "n",
            "code": "KeyN",
            "ctrl": false,
            "alt": true,
            "shift": false,
            "meta": false,
            "futureKey": {
              "keep": [1, null]
            }
          },
          "queue": {
            "char": "n",
            "code": "KeyN",
            "ctrl": false,
            "alt": true,
            "shift": false,
            "meta": false,
            "futureKey": {
              "keep": [1, null]
            }
          },
          "save": {
            "char": "n",
            "code": "KeyN",
            "ctrl": false,
            "alt": true,
            "shift": false,
            "meta": false,
            "futureKey": {
              "keep": [1, null]
            }
          },
          "picker": {
            "char": "n",
            "code": "KeyN",
            "ctrl": false,
            "alt": true,
            "shift": false,
            "meta": false,
            "futureKey": {
              "keep": [1, null]
            }
          },
          "like": {
            "char": "n",
            "code": "KeyN",
            "ctrl": false,
            "alt": true,
            "shift": false,
            "meta": false,
            "futureKey": {
              "keep": [1, null]
            }
          },
          "remove": {
            "char": "n",
            "code": "KeyN",
            "ctrl": false,
            "alt": true,
            "shift": false,
            "meta": false,
            "futureKey": {
              "keep": [1, null]
            }
          },
          "library": {
            "char": "n",
            "code": "KeyN",
            "ctrl": false,
            "alt": true,
            "shift": false,
            "meta": false,
            "futureKey": {
              "keep": [1, null]
            }
          },
          "mix": {
            "char": "n",
            "code": "KeyN",
            "ctrl": false,
            "alt": true,
            "shift": false,
            "meta": false,
            "futureKey": {
              "keep": [1, null]
            }
          },
          "album": {
            "char": "n",
            "code": "KeyN",
            "ctrl": false,
            "alt": true,
            "shift": false,
            "meta": false,
            "futureKey": {
              "keep": [1, null]
            }
          },
          "artist": {
            "char": "n",
            "code": "KeyN",
            "ctrl": false,
            "alt": true,
            "shift": false,
            "meta": false,
            "futureKey": {
              "keep": [1, null]
            }
          }
        }
      },
      "anyTabKeys": {
        "on": false,
        "feedback": true
      },
      "gather": {
        "on": false,
        "feedback": true,
        "to": "player",
        "order": "newest",
        "close": false,
        "auto": {
          "unvisited": true,
          "after": "1d",
          "background": true,
          "count": true,
          "n": 10,
          "futureTrigger": ["keep"]
        }
      },
      "futureRoot": {
        "keep": ["unknown", 0, null]
      }
    }
  },
  {
    "name": "watchButton.feedback",
    "change": { "kind": "option", "field": "watchButton.feedback", "value": false },
    "expectedSettings": {
      "theme": "system",
      "undoKey": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
      "autoAdd": { "on": false, "feedback": true, "pct": 50, "toolbarTick": true, "toolbarPaused": true, "futureAuto": { "keep": true } },
      "shortcuts": {
        "on": false,
        "feedback": true,
        "music": false,
        "preset": true,
        "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
        "list": [
          {
            "id": "save01",
            "key": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
            "label": "Kept shortcut",
            "watchLaterOnEveryAccount": true,
            "futureRow": ["keep"]
          }
        ]
      },
      "quickSave": { "on": false, "feedback": true, "shortsShelves": false },
      "queueButton": { "on": false, "feedback": true, "corner": "top-left" },
      "watchButton": { "on": false, "feedback": false, "shorts": false },
      "cardMenu": { "on": false, "keepLinkMenu": false },
      "browserMenu": { "on": false, "feedback": true },
      "musicSection": false,
      "musicActions": {
        "on": false,
        "feedback": true,
        "preset": true,
        "buttons": { "next": true, "queue": true, "save": false, "like": false, "remove": false, "bar": false, "library": false, "mix": false, "album": false, "artist": false, "futureButton": true }
      },
      "musicKeys": {
        "on": false,
        "feedback": true,
        "preset": true,
        "keys": {
          "next": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "queue": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "save": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "like": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "remove": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "library": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "mix": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "album": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "artist": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } }
        }
      },
      "anyTabKeys": { "on": false, "feedback": true },
      "gather": {
        "on": false,
        "feedback": true,
        "to": "player",
        "order": "newest",
        "close": false,
        "auto": { "unvisited": true, "after": "1d", "background": true, "count": true, "n": 10, "futureTrigger": ["keep"] }
      },
      "futureRoot": { "keep": ["unknown", 0, null] }
    }
  },
  {
    "name": "browserMenu.feedback",
    "change": { "kind": "option", "field": "browserMenu.feedback", "value": false },
    "expectedSettings": {
      "theme": "system",
      "undoKey": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
      "autoAdd": { "on": false, "feedback": true, "pct": 50, "toolbarTick": true, "toolbarPaused": true, "futureAuto": { "keep": true } },
      "shortcuts": {
        "on": false,
        "feedback": true,
        "music": false,
        "preset": true,
        "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
        "list": [
          {
            "id": "save01",
            "key": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
            "label": "Kept shortcut",
            "watchLaterOnEveryAccount": true,
            "futureRow": ["keep"]
          }
        ]
      },
      "quickSave": { "on": false, "feedback": true, "shortsShelves": false },
      "queueButton": { "on": false, "feedback": true, "corner": "top-left" },
      "watchButton": { "on": false, "feedback": true, "shorts": false },
      "cardMenu": { "on": false, "keepLinkMenu": false },
      "browserMenu": { "on": false, "feedback": false },
      "musicSection": false,
      "musicActions": {
        "on": false,
        "feedback": true,
        "preset": true,
        "buttons": { "next": true, "queue": true, "save": false, "like": false, "remove": false, "bar": false, "library": false, "mix": false, "album": false, "artist": false, "futureButton": true }
      },
      "musicKeys": {
        "on": false,
        "feedback": true,
        "preset": true,
        "keys": {
          "next": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "queue": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "save": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "like": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "remove": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "library": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "mix": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "album": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "artist": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } }
        }
      },
      "anyTabKeys": { "on": false, "feedback": true },
      "gather": {
        "on": false,
        "feedback": true,
        "to": "player",
        "order": "newest",
        "close": false,
        "auto": { "unvisited": true, "after": "1d", "background": true, "count": true, "n": 10, "futureTrigger": ["keep"] }
      },
      "futureRoot": { "keep": ["unknown", 0, null] }
    }
  },
  {
    "name": "musicActions.feedback",
    "change": { "kind": "option", "field": "musicActions.feedback", "value": false },
    "expectedSettings": {
      "theme": "system",
      "undoKey": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
      "autoAdd": { "on": false, "feedback": true, "pct": 50, "toolbarTick": true, "toolbarPaused": true, "futureAuto": { "keep": true } },
      "shortcuts": {
        "on": false,
        "feedback": true,
        "music": false,
        "preset": true,
        "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
        "list": [
          {
            "id": "save01",
            "key": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
            "label": "Kept shortcut",
            "watchLaterOnEveryAccount": true,
            "futureRow": ["keep"]
          }
        ]
      },
      "quickSave": { "on": false, "feedback": true, "shortsShelves": false },
      "queueButton": { "on": false, "feedback": true, "corner": "top-left" },
      "watchButton": { "on": false, "feedback": true, "shorts": false },
      "cardMenu": { "on": false, "keepLinkMenu": false },
      "browserMenu": { "on": false, "feedback": true },
      "musicSection": false,
      "musicActions": {
        "on": false,
        "feedback": false,
        "preset": true,
        "buttons": { "next": true, "queue": true, "save": false, "like": false, "remove": false, "bar": false, "library": false, "mix": false, "album": false, "artist": false, "futureButton": true }
      },
      "musicKeys": {
        "on": false,
        "feedback": true,
        "preset": true,
        "keys": {
          "next": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "queue": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "save": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "like": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "remove": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "library": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "mix": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "album": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "artist": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } }
        }
      },
      "anyTabKeys": { "on": false, "feedback": true },
      "gather": {
        "on": false,
        "feedback": true,
        "to": "player",
        "order": "newest",
        "close": false,
        "auto": { "unvisited": true, "after": "1d", "background": true, "count": true, "n": 10, "futureTrigger": ["keep"] }
      },
      "futureRoot": { "keep": ["unknown", 0, null] }
    }
  },
  {
    "name": "musicKeys.feedback",
    "change": { "kind": "option", "field": "musicKeys.feedback", "value": false },
    "expectedSettings": {
      "theme": "system",
      "undoKey": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
      "autoAdd": { "on": false, "feedback": true, "pct": 50, "toolbarTick": true, "toolbarPaused": true, "futureAuto": { "keep": true } },
      "shortcuts": {
        "on": false,
        "feedback": true,
        "music": false,
        "preset": true,
        "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
        "list": [
          {
            "id": "save01",
            "key": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
            "label": "Kept shortcut",
            "watchLaterOnEveryAccount": true,
            "futureRow": ["keep"]
          }
        ]
      },
      "quickSave": { "on": false, "feedback": true, "shortsShelves": false },
      "queueButton": { "on": false, "feedback": true, "corner": "top-left" },
      "watchButton": { "on": false, "feedback": true, "shorts": false },
      "cardMenu": { "on": false, "keepLinkMenu": false },
      "browserMenu": { "on": false, "feedback": true },
      "musicSection": false,
      "musicActions": {
        "on": false,
        "feedback": true,
        "preset": true,
        "buttons": { "next": true, "queue": true, "save": false, "like": false, "remove": false, "bar": false, "library": false, "mix": false, "album": false, "artist": false, "futureButton": true }
      },
      "musicKeys": {
        "on": false,
        "feedback": false,
        "preset": true,
        "keys": {
          "next": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "queue": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "save": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "like": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "remove": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "library": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "mix": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "album": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "artist": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } }
        }
      },
      "anyTabKeys": { "on": false, "feedback": true },
      "gather": {
        "on": false,
        "feedback": true,
        "to": "player",
        "order": "newest",
        "close": false,
        "auto": { "unvisited": true, "after": "1d", "background": true, "count": true, "n": 10, "futureTrigger": ["keep"] }
      },
      "futureRoot": { "keep": ["unknown", 0, null] }
    }
  },
  {
    "name": "anyTabKeys.feedback",
    "change": { "kind": "option", "field": "anyTabKeys.feedback", "value": false },
    "expectedSettings": {
      "theme": "system",
      "undoKey": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
      "autoAdd": { "on": false, "feedback": true, "pct": 50, "toolbarTick": true, "toolbarPaused": true, "futureAuto": { "keep": true } },
      "shortcuts": {
        "on": false,
        "feedback": true,
        "music": false,
        "preset": true,
        "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
        "list": [
          {
            "id": "save01",
            "key": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
            "label": "Kept shortcut",
            "watchLaterOnEveryAccount": true,
            "futureRow": ["keep"]
          }
        ]
      },
      "quickSave": { "on": false, "feedback": true, "shortsShelves": false },
      "queueButton": { "on": false, "feedback": true, "corner": "top-left" },
      "watchButton": { "on": false, "feedback": true, "shorts": false },
      "cardMenu": { "on": false, "keepLinkMenu": false },
      "browserMenu": { "on": false, "feedback": true },
      "musicSection": false,
      "musicActions": {
        "on": false,
        "feedback": true,
        "preset": true,
        "buttons": { "next": true, "queue": true, "save": false, "like": false, "remove": false, "bar": false, "library": false, "mix": false, "album": false, "artist": false, "futureButton": true }
      },
      "musicKeys": {
        "on": false,
        "feedback": true,
        "preset": true,
        "keys": {
          "next": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "queue": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "save": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "like": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "remove": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "library": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "mix": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "album": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "artist": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } }
        }
      },
      "anyTabKeys": { "on": false, "feedback": false },
      "gather": {
        "on": false,
        "feedback": true,
        "to": "player",
        "order": "newest",
        "close": false,
        "auto": { "unvisited": true, "after": "1d", "background": true, "count": true, "n": 10, "futureTrigger": ["keep"] }
      },
      "futureRoot": { "keep": ["unknown", 0, null] }
    }
  },
  {
    "name": "gather.feedback",
    "change": { "kind": "option", "field": "gather.feedback", "value": false },
    "expectedSettings": {
      "theme": "system",
      "undoKey": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
      "autoAdd": { "on": false, "feedback": true, "pct": 50, "toolbarTick": true, "toolbarPaused": true, "futureAuto": { "keep": true } },
      "shortcuts": {
        "on": false,
        "feedback": true,
        "music": false,
        "preset": true,
        "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
        "list": [
          {
            "id": "save01",
            "key": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
            "label": "Kept shortcut",
            "watchLaterOnEveryAccount": true,
            "futureRow": ["keep"]
          }
        ]
      },
      "quickSave": { "on": false, "feedback": true, "shortsShelves": false },
      "queueButton": { "on": false, "feedback": true, "corner": "top-left" },
      "watchButton": { "on": false, "feedback": true, "shorts": false },
      "cardMenu": { "on": false, "keepLinkMenu": false },
      "browserMenu": { "on": false, "feedback": true },
      "musicSection": false,
      "musicActions": {
        "on": false,
        "feedback": true,
        "preset": true,
        "buttons": { "next": true, "queue": true, "save": false, "like": false, "remove": false, "bar": false, "library": false, "mix": false, "album": false, "artist": false, "futureButton": true }
      },
      "musicKeys": {
        "on": false,
        "feedback": true,
        "preset": true,
        "keys": {
          "next": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "queue": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "save": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "like": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "remove": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "library": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "mix": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "album": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "artist": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } }
        }
      },
      "anyTabKeys": { "on": false, "feedback": true },
      "gather": {
        "on": false,
        "feedback": false,
        "to": "player",
        "order": "newest",
        "close": false,
        "auto": { "unvisited": true, "after": "1d", "background": true, "count": true, "n": 10, "futureTrigger": ["keep"] }
      },
      "futureRoot": { "keep": ["unknown", 0, null] }
    }
  },
  {
    "name": "autoAdd.toolbarTick",
    "change": { "kind": "option", "field": "autoAdd.toolbarTick", "value": false },
    "expectedSettings": {
      "theme": "system",
      "undoKey": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
      "autoAdd": { "on": false, "feedback": true, "pct": 50, "toolbarTick": false, "toolbarPaused": true, "futureAuto": { "keep": true } },
      "shortcuts": {
        "on": false,
        "feedback": true,
        "music": false,
        "preset": true,
        "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
        "list": [
          {
            "id": "save01",
            "key": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
            "label": "Kept shortcut",
            "watchLaterOnEveryAccount": true,
            "futureRow": ["keep"]
          }
        ]
      },
      "quickSave": { "on": false, "feedback": true, "shortsShelves": false },
      "queueButton": { "on": false, "feedback": true, "corner": "top-left" },
      "watchButton": { "on": false, "feedback": true, "shorts": false },
      "cardMenu": { "on": false, "keepLinkMenu": false },
      "browserMenu": { "on": false, "feedback": true },
      "musicSection": false,
      "musicActions": {
        "on": false,
        "feedback": true,
        "preset": true,
        "buttons": { "next": true, "queue": true, "save": false, "like": false, "remove": false, "bar": false, "library": false, "mix": false, "album": false, "artist": false, "futureButton": true }
      },
      "musicKeys": {
        "on": false,
        "feedback": true,
        "preset": true,
        "keys": {
          "next": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "queue": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "save": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "like": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "remove": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "library": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "mix": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "album": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "artist": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } }
        }
      },
      "anyTabKeys": { "on": false, "feedback": true },
      "gather": {
        "on": false,
        "feedback": true,
        "to": "player",
        "order": "newest",
        "close": false,
        "auto": { "unvisited": true, "after": "1d", "background": true, "count": true, "n": 10, "futureTrigger": ["keep"] }
      },
      "futureRoot": { "keep": ["unknown", 0, null] }
    }
  },
  {
    "name": "autoAdd.toolbarPaused",
    "change": { "kind": "option", "field": "autoAdd.toolbarPaused", "value": false },
    "expectedSettings": {
      "theme": "system",
      "undoKey": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
      "autoAdd": { "on": false, "feedback": true, "pct": 50, "toolbarTick": true, "toolbarPaused": false, "futureAuto": { "keep": true } },
      "shortcuts": {
        "on": false,
        "feedback": true,
        "music": false,
        "preset": true,
        "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
        "list": [
          {
            "id": "save01",
            "key": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
            "label": "Kept shortcut",
            "watchLaterOnEveryAccount": true,
            "futureRow": ["keep"]
          }
        ]
      },
      "quickSave": { "on": false, "feedback": true, "shortsShelves": false },
      "queueButton": { "on": false, "feedback": true, "corner": "top-left" },
      "watchButton": { "on": false, "feedback": true, "shorts": false },
      "cardMenu": { "on": false, "keepLinkMenu": false },
      "browserMenu": { "on": false, "feedback": true },
      "musicSection": false,
      "musicActions": {
        "on": false,
        "feedback": true,
        "preset": true,
        "buttons": { "next": true, "queue": true, "save": false, "like": false, "remove": false, "bar": false, "library": false, "mix": false, "album": false, "artist": false, "futureButton": true }
      },
      "musicKeys": {
        "on": false,
        "feedback": true,
        "preset": true,
        "keys": {
          "next": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "queue": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "save": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "like": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "remove": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "library": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "mix": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "album": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "artist": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } }
        }
      },
      "anyTabKeys": { "on": false, "feedback": true },
      "gather": {
        "on": false,
        "feedback": true,
        "to": "player",
        "order": "newest",
        "close": false,
        "auto": { "unvisited": true, "after": "1d", "background": true, "count": true, "n": 10, "futureTrigger": ["keep"] }
      },
      "futureRoot": { "keep": ["unknown", 0, null] }
    }
  },
  {
    "name": "quickSave.shortsShelves",
    "change": { "kind": "option", "field": "quickSave.shortsShelves", "value": true },
    "expectedSettings": {
      "theme": "system",
      "undoKey": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
      "autoAdd": { "on": false, "feedback": true, "pct": 50, "toolbarTick": true, "toolbarPaused": true, "futureAuto": { "keep": true } },
      "shortcuts": {
        "on": false,
        "feedback": true,
        "music": false,
        "preset": true,
        "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
        "list": [
          {
            "id": "save01",
            "key": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
            "label": "Kept shortcut",
            "watchLaterOnEveryAccount": true,
            "futureRow": ["keep"]
          }
        ]
      },
      "quickSave": { "on": false, "feedback": true, "shortsShelves": true },
      "queueButton": { "on": false, "feedback": true, "corner": "top-left" },
      "watchButton": { "on": false, "feedback": true, "shorts": false },
      "cardMenu": { "on": false, "keepLinkMenu": false },
      "browserMenu": { "on": false, "feedback": true },
      "musicSection": false,
      "musicActions": {
        "on": false,
        "feedback": true,
        "preset": true,
        "buttons": { "next": true, "queue": true, "save": false, "like": false, "remove": false, "bar": false, "library": false, "mix": false, "album": false, "artist": false, "futureButton": true }
      },
      "musicKeys": {
        "on": false,
        "feedback": true,
        "preset": true,
        "keys": {
          "next": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "queue": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "save": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "like": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "remove": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "library": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "mix": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "album": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "artist": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } }
        }
      },
      "anyTabKeys": { "on": false, "feedback": true },
      "gather": {
        "on": false,
        "feedback": true,
        "to": "player",
        "order": "newest",
        "close": false,
        "auto": { "unvisited": true, "after": "1d", "background": true, "count": true, "n": 10, "futureTrigger": ["keep"] }
      },
      "futureRoot": { "keep": ["unknown", 0, null] }
    }
  },
  {
    "name": "watchButton.shorts",
    "change": { "kind": "option", "field": "watchButton.shorts", "value": true },
    "expectedSettings": {
      "theme": "system",
      "undoKey": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
      "autoAdd": { "on": false, "feedback": true, "pct": 50, "toolbarTick": true, "toolbarPaused": true, "futureAuto": { "keep": true } },
      "shortcuts": {
        "on": false,
        "feedback": true,
        "music": false,
        "preset": true,
        "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
        "list": [
          {
            "id": "save01",
            "key": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
            "label": "Kept shortcut",
            "watchLaterOnEveryAccount": true,
            "futureRow": ["keep"]
          }
        ]
      },
      "quickSave": { "on": false, "feedback": true, "shortsShelves": false },
      "queueButton": { "on": false, "feedback": true, "corner": "top-left" },
      "watchButton": { "on": false, "feedback": true, "shorts": true },
      "cardMenu": { "on": false, "keepLinkMenu": false },
      "browserMenu": { "on": false, "feedback": true },
      "musicSection": false,
      "musicActions": {
        "on": false,
        "feedback": true,
        "preset": true,
        "buttons": { "next": true, "queue": true, "save": false, "like": false, "remove": false, "bar": false, "library": false, "mix": false, "album": false, "artist": false, "futureButton": true }
      },
      "musicKeys": {
        "on": false,
        "feedback": true,
        "preset": true,
        "keys": {
          "next": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "queue": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "save": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "like": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "remove": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "library": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "mix": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "album": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "artist": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } }
        }
      },
      "anyTabKeys": { "on": false, "feedback": true },
      "gather": {
        "on": false,
        "feedback": true,
        "to": "player",
        "order": "newest",
        "close": false,
        "auto": { "unvisited": true, "after": "1d", "background": true, "count": true, "n": 10, "futureTrigger": ["keep"] }
      },
      "futureRoot": { "keep": ["unknown", 0, null] }
    }
  },
  {
    "name": "cardMenu.keepLinkMenu",
    "change": { "kind": "option", "field": "cardMenu.keepLinkMenu", "value": true },
    "expectedSettings": {
      "theme": "system",
      "undoKey": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
      "autoAdd": { "on": false, "feedback": true, "pct": 50, "toolbarTick": true, "toolbarPaused": true, "futureAuto": { "keep": true } },
      "shortcuts": {
        "on": false,
        "feedback": true,
        "music": false,
        "preset": true,
        "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
        "list": [
          {
            "id": "save01",
            "key": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
            "label": "Kept shortcut",
            "watchLaterOnEveryAccount": true,
            "futureRow": ["keep"]
          }
        ]
      },
      "quickSave": { "on": false, "feedback": true, "shortsShelves": false },
      "queueButton": { "on": false, "feedback": true, "corner": "top-left" },
      "watchButton": { "on": false, "feedback": true, "shorts": false },
      "cardMenu": { "on": false, "keepLinkMenu": true },
      "browserMenu": { "on": false, "feedback": true },
      "musicSection": false,
      "musicActions": {
        "on": false,
        "feedback": true,
        "preset": true,
        "buttons": { "next": true, "queue": true, "save": false, "like": false, "remove": false, "bar": false, "library": false, "mix": false, "album": false, "artist": false, "futureButton": true }
      },
      "musicKeys": {
        "on": false,
        "feedback": true,
        "preset": true,
        "keys": {
          "next": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "queue": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "save": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "like": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "remove": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "library": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "mix": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "album": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "artist": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } }
        }
      },
      "anyTabKeys": { "on": false, "feedback": true },
      "gather": {
        "on": false,
        "feedback": true,
        "to": "player",
        "order": "newest",
        "close": false,
        "auto": { "unvisited": true, "after": "1d", "background": true, "count": true, "n": 10, "futureTrigger": ["keep"] }
      },
      "futureRoot": { "keep": ["unknown", 0, null] }
    }
  },
  {
    "name": "musicActions.buttons.next",
    "change": { "kind": "option", "field": "musicActions.buttons.next", "value": false },
    "expectedSettings": {
      "theme": "system",
      "undoKey": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
      "autoAdd": { "on": false, "feedback": true, "pct": 50, "toolbarTick": true, "toolbarPaused": true, "futureAuto": { "keep": true } },
      "shortcuts": {
        "on": false,
        "feedback": true,
        "music": false,
        "preset": true,
        "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
        "list": [
          {
            "id": "save01",
            "key": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
            "label": "Kept shortcut",
            "watchLaterOnEveryAccount": true,
            "futureRow": ["keep"]
          }
        ]
      },
      "quickSave": { "on": false, "feedback": true, "shortsShelves": false },
      "queueButton": { "on": false, "feedback": true, "corner": "top-left" },
      "watchButton": { "on": false, "feedback": true, "shorts": false },
      "cardMenu": { "on": false, "keepLinkMenu": false },
      "browserMenu": { "on": false, "feedback": true },
      "musicSection": false,
      "musicActions": {
        "on": false,
        "feedback": true,
        "preset": true,
        "buttons": { "next": false, "queue": true, "save": false, "like": false, "remove": false, "bar": false, "library": false, "mix": false, "album": false, "artist": false, "futureButton": true }
      },
      "musicKeys": {
        "on": false,
        "feedback": true,
        "preset": true,
        "keys": {
          "next": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "queue": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "save": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "like": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "remove": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "library": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "mix": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "album": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "artist": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } }
        }
      },
      "anyTabKeys": { "on": false, "feedback": true },
      "gather": {
        "on": false,
        "feedback": true,
        "to": "player",
        "order": "newest",
        "close": false,
        "auto": { "unvisited": true, "after": "1d", "background": true, "count": true, "n": 10, "futureTrigger": ["keep"] }
      },
      "futureRoot": { "keep": ["unknown", 0, null] }
    }
  },
  {
    "name": "musicActions.buttons.queue",
    "change": { "kind": "option", "field": "musicActions.buttons.queue", "value": false },
    "expectedSettings": {
      "theme": "system",
      "undoKey": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
      "autoAdd": { "on": false, "feedback": true, "pct": 50, "toolbarTick": true, "toolbarPaused": true, "futureAuto": { "keep": true } },
      "shortcuts": {
        "on": false,
        "feedback": true,
        "music": false,
        "preset": true,
        "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
        "list": [
          {
            "id": "save01",
            "key": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
            "label": "Kept shortcut",
            "watchLaterOnEveryAccount": true,
            "futureRow": ["keep"]
          }
        ]
      },
      "quickSave": { "on": false, "feedback": true, "shortsShelves": false },
      "queueButton": { "on": false, "feedback": true, "corner": "top-left" },
      "watchButton": { "on": false, "feedback": true, "shorts": false },
      "cardMenu": { "on": false, "keepLinkMenu": false },
      "browserMenu": { "on": false, "feedback": true },
      "musicSection": false,
      "musicActions": {
        "on": false,
        "feedback": true,
        "preset": true,
        "buttons": { "next": true, "queue": false, "save": false, "like": false, "remove": false, "bar": false, "library": false, "mix": false, "album": false, "artist": false, "futureButton": true }
      },
      "musicKeys": {
        "on": false,
        "feedback": true,
        "preset": true,
        "keys": {
          "next": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "queue": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "save": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "like": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "remove": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "library": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "mix": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "album": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "artist": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } }
        }
      },
      "anyTabKeys": { "on": false, "feedback": true },
      "gather": {
        "on": false,
        "feedback": true,
        "to": "player",
        "order": "newest",
        "close": false,
        "auto": { "unvisited": true, "after": "1d", "background": true, "count": true, "n": 10, "futureTrigger": ["keep"] }
      },
      "futureRoot": { "keep": ["unknown", 0, null] }
    }
  },
  {
    "name": "musicActions.buttons.save",
    "change": { "kind": "option", "field": "musicActions.buttons.save", "value": true },
    "expectedSettings": {
      "theme": "system",
      "undoKey": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
      "autoAdd": { "on": false, "feedback": true, "pct": 50, "toolbarTick": true, "toolbarPaused": true, "futureAuto": { "keep": true } },
      "shortcuts": {
        "on": false,
        "feedback": true,
        "music": false,
        "preset": true,
        "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
        "list": [
          {
            "id": "save01",
            "key": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
            "label": "Kept shortcut",
            "watchLaterOnEveryAccount": true,
            "futureRow": ["keep"]
          }
        ]
      },
      "quickSave": { "on": false, "feedback": true, "shortsShelves": false },
      "queueButton": { "on": false, "feedback": true, "corner": "top-left" },
      "watchButton": { "on": false, "feedback": true, "shorts": false },
      "cardMenu": { "on": false, "keepLinkMenu": false },
      "browserMenu": { "on": false, "feedback": true },
      "musicSection": false,
      "musicActions": {
        "on": false,
        "feedback": true,
        "preset": true,
        "buttons": { "next": true, "queue": true, "save": true, "like": false, "remove": false, "bar": false, "library": false, "mix": false, "album": false, "artist": false, "futureButton": true }
      },
      "musicKeys": {
        "on": false,
        "feedback": true,
        "preset": true,
        "keys": {
          "next": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "queue": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "save": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "like": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "remove": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "library": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "mix": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "album": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "artist": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } }
        }
      },
      "anyTabKeys": { "on": false, "feedback": true },
      "gather": {
        "on": false,
        "feedback": true,
        "to": "player",
        "order": "newest",
        "close": false,
        "auto": { "unvisited": true, "after": "1d", "background": true, "count": true, "n": 10, "futureTrigger": ["keep"] }
      },
      "futureRoot": { "keep": ["unknown", 0, null] }
    }
  },
  {
    "name": "musicActions.buttons.like",
    "change": { "kind": "option", "field": "musicActions.buttons.like", "value": true },
    "expectedSettings": {
      "theme": "system",
      "undoKey": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
      "autoAdd": { "on": false, "feedback": true, "pct": 50, "toolbarTick": true, "toolbarPaused": true, "futureAuto": { "keep": true } },
      "shortcuts": {
        "on": false,
        "feedback": true,
        "music": false,
        "preset": true,
        "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
        "list": [
          {
            "id": "save01",
            "key": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
            "label": "Kept shortcut",
            "watchLaterOnEveryAccount": true,
            "futureRow": ["keep"]
          }
        ]
      },
      "quickSave": { "on": false, "feedback": true, "shortsShelves": false },
      "queueButton": { "on": false, "feedback": true, "corner": "top-left" },
      "watchButton": { "on": false, "feedback": true, "shorts": false },
      "cardMenu": { "on": false, "keepLinkMenu": false },
      "browserMenu": { "on": false, "feedback": true },
      "musicSection": false,
      "musicActions": {
        "on": false,
        "feedback": true,
        "preset": true,
        "buttons": { "next": true, "queue": true, "save": false, "like": true, "remove": false, "bar": false, "library": false, "mix": false, "album": false, "artist": false, "futureButton": true }
      },
      "musicKeys": {
        "on": false,
        "feedback": true,
        "preset": true,
        "keys": {
          "next": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "queue": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "save": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "like": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "remove": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "library": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "mix": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "album": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "artist": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } }
        }
      },
      "anyTabKeys": { "on": false, "feedback": true },
      "gather": {
        "on": false,
        "feedback": true,
        "to": "player",
        "order": "newest",
        "close": false,
        "auto": { "unvisited": true, "after": "1d", "background": true, "count": true, "n": 10, "futureTrigger": ["keep"] }
      },
      "futureRoot": { "keep": ["unknown", 0, null] }
    }
  },
  {
    "name": "musicActions.buttons.remove",
    "change": { "kind": "option", "field": "musicActions.buttons.remove", "value": true },
    "expectedSettings": {
      "theme": "system",
      "undoKey": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
      "autoAdd": { "on": false, "feedback": true, "pct": 50, "toolbarTick": true, "toolbarPaused": true, "futureAuto": { "keep": true } },
      "shortcuts": {
        "on": false,
        "feedback": true,
        "music": false,
        "preset": true,
        "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
        "list": [
          {
            "id": "save01",
            "key": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
            "label": "Kept shortcut",
            "watchLaterOnEveryAccount": true,
            "futureRow": ["keep"]
          }
        ]
      },
      "quickSave": { "on": false, "feedback": true, "shortsShelves": false },
      "queueButton": { "on": false, "feedback": true, "corner": "top-left" },
      "watchButton": { "on": false, "feedback": true, "shorts": false },
      "cardMenu": { "on": false, "keepLinkMenu": false },
      "browserMenu": { "on": false, "feedback": true },
      "musicSection": false,
      "musicActions": {
        "on": false,
        "feedback": true,
        "preset": true,
        "buttons": { "next": true, "queue": true, "save": false, "like": false, "remove": true, "bar": false, "library": false, "mix": false, "album": false, "artist": false, "futureButton": true }
      },
      "musicKeys": {
        "on": false,
        "feedback": true,
        "preset": true,
        "keys": {
          "next": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "queue": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "save": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "like": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "remove": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "library": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "mix": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "album": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "artist": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } }
        }
      },
      "anyTabKeys": { "on": false, "feedback": true },
      "gather": {
        "on": false,
        "feedback": true,
        "to": "player",
        "order": "newest",
        "close": false,
        "auto": { "unvisited": true, "after": "1d", "background": true, "count": true, "n": 10, "futureTrigger": ["keep"] }
      },
      "futureRoot": { "keep": ["unknown", 0, null] }
    }
  },
  {
    "name": "musicActions.buttons.library",
    "change": { "kind": "option", "field": "musicActions.buttons.library", "value": true },
    "expectedSettings": {
      "theme": "system",
      "undoKey": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
      "autoAdd": { "on": false, "feedback": true, "pct": 50, "toolbarTick": true, "toolbarPaused": true, "futureAuto": { "keep": true } },
      "shortcuts": {
        "on": false,
        "feedback": true,
        "music": false,
        "preset": true,
        "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
        "list": [
          {
            "id": "save01",
            "key": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
            "label": "Kept shortcut",
            "watchLaterOnEveryAccount": true,
            "futureRow": ["keep"]
          }
        ]
      },
      "quickSave": { "on": false, "feedback": true, "shortsShelves": false },
      "queueButton": { "on": false, "feedback": true, "corner": "top-left" },
      "watchButton": { "on": false, "feedback": true, "shorts": false },
      "cardMenu": { "on": false, "keepLinkMenu": false },
      "browserMenu": { "on": false, "feedback": true },
      "musicSection": false,
      "musicActions": {
        "on": false,
        "feedback": true,
        "preset": true,
        "buttons": { "next": true, "queue": true, "save": false, "like": false, "remove": false, "bar": false, "library": true, "mix": false, "album": false, "artist": false, "futureButton": true }
      },
      "musicKeys": {
        "on": false,
        "feedback": true,
        "preset": true,
        "keys": {
          "next": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "queue": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "save": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "like": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "remove": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "library": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "mix": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "album": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "artist": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } }
        }
      },
      "anyTabKeys": { "on": false, "feedback": true },
      "gather": {
        "on": false,
        "feedback": true,
        "to": "player",
        "order": "newest",
        "close": false,
        "auto": { "unvisited": true, "after": "1d", "background": true, "count": true, "n": 10, "futureTrigger": ["keep"] }
      },
      "futureRoot": { "keep": ["unknown", 0, null] }
    }
  },
  {
    "name": "musicActions.buttons.mix",
    "change": { "kind": "option", "field": "musicActions.buttons.mix", "value": true },
    "expectedSettings": {
      "theme": "system",
      "undoKey": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
      "autoAdd": { "on": false, "feedback": true, "pct": 50, "toolbarTick": true, "toolbarPaused": true, "futureAuto": { "keep": true } },
      "shortcuts": {
        "on": false,
        "feedback": true,
        "music": false,
        "preset": true,
        "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
        "list": [
          {
            "id": "save01",
            "key": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
            "label": "Kept shortcut",
            "watchLaterOnEveryAccount": true,
            "futureRow": ["keep"]
          }
        ]
      },
      "quickSave": { "on": false, "feedback": true, "shortsShelves": false },
      "queueButton": { "on": false, "feedback": true, "corner": "top-left" },
      "watchButton": { "on": false, "feedback": true, "shorts": false },
      "cardMenu": { "on": false, "keepLinkMenu": false },
      "browserMenu": { "on": false, "feedback": true },
      "musicSection": false,
      "musicActions": {
        "on": false,
        "feedback": true,
        "preset": true,
        "buttons": { "next": true, "queue": true, "save": false, "like": false, "remove": false, "bar": false, "library": false, "mix": true, "album": false, "artist": false, "futureButton": true }
      },
      "musicKeys": {
        "on": false,
        "feedback": true,
        "preset": true,
        "keys": {
          "next": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "queue": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "save": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "like": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "remove": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "library": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "mix": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "album": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "artist": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } }
        }
      },
      "anyTabKeys": { "on": false, "feedback": true },
      "gather": {
        "on": false,
        "feedback": true,
        "to": "player",
        "order": "newest",
        "close": false,
        "auto": { "unvisited": true, "after": "1d", "background": true, "count": true, "n": 10, "futureTrigger": ["keep"] }
      },
      "futureRoot": { "keep": ["unknown", 0, null] }
    }
  },
  {
    "name": "musicActions.buttons.album",
    "change": { "kind": "option", "field": "musicActions.buttons.album", "value": true },
    "expectedSettings": {
      "theme": "system",
      "undoKey": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
      "autoAdd": { "on": false, "feedback": true, "pct": 50, "toolbarTick": true, "toolbarPaused": true, "futureAuto": { "keep": true } },
      "shortcuts": {
        "on": false,
        "feedback": true,
        "music": false,
        "preset": true,
        "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
        "list": [
          {
            "id": "save01",
            "key": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
            "label": "Kept shortcut",
            "watchLaterOnEveryAccount": true,
            "futureRow": ["keep"]
          }
        ]
      },
      "quickSave": { "on": false, "feedback": true, "shortsShelves": false },
      "queueButton": { "on": false, "feedback": true, "corner": "top-left" },
      "watchButton": { "on": false, "feedback": true, "shorts": false },
      "cardMenu": { "on": false, "keepLinkMenu": false },
      "browserMenu": { "on": false, "feedback": true },
      "musicSection": false,
      "musicActions": {
        "on": false,
        "feedback": true,
        "preset": true,
        "buttons": { "next": true, "queue": true, "save": false, "like": false, "remove": false, "bar": false, "library": false, "mix": false, "album": true, "artist": false, "futureButton": true }
      },
      "musicKeys": {
        "on": false,
        "feedback": true,
        "preset": true,
        "keys": {
          "next": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "queue": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "save": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "like": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "remove": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "library": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "mix": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "album": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "artist": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } }
        }
      },
      "anyTabKeys": { "on": false, "feedback": true },
      "gather": {
        "on": false,
        "feedback": true,
        "to": "player",
        "order": "newest",
        "close": false,
        "auto": { "unvisited": true, "after": "1d", "background": true, "count": true, "n": 10, "futureTrigger": ["keep"] }
      },
      "futureRoot": { "keep": ["unknown", 0, null] }
    }
  },
  {
    "name": "musicActions.buttons.artist",
    "change": { "kind": "option", "field": "musicActions.buttons.artist", "value": true },
    "expectedSettings": {
      "theme": "system",
      "undoKey": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
      "autoAdd": { "on": false, "feedback": true, "pct": 50, "toolbarTick": true, "toolbarPaused": true, "futureAuto": { "keep": true } },
      "shortcuts": {
        "on": false,
        "feedback": true,
        "music": false,
        "preset": true,
        "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
        "list": [
          {
            "id": "save01",
            "key": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
            "label": "Kept shortcut",
            "watchLaterOnEveryAccount": true,
            "futureRow": ["keep"]
          }
        ]
      },
      "quickSave": { "on": false, "feedback": true, "shortsShelves": false },
      "queueButton": { "on": false, "feedback": true, "corner": "top-left" },
      "watchButton": { "on": false, "feedback": true, "shorts": false },
      "cardMenu": { "on": false, "keepLinkMenu": false },
      "browserMenu": { "on": false, "feedback": true },
      "musicSection": false,
      "musicActions": {
        "on": false,
        "feedback": true,
        "preset": true,
        "buttons": { "next": true, "queue": true, "save": false, "like": false, "remove": false, "bar": false, "library": false, "mix": false, "album": false, "artist": true, "futureButton": true }
      },
      "musicKeys": {
        "on": false,
        "feedback": true,
        "preset": true,
        "keys": {
          "next": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "queue": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "save": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "like": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "remove": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "library": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "mix": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "album": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "artist": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } }
        }
      },
      "anyTabKeys": { "on": false, "feedback": true },
      "gather": {
        "on": false,
        "feedback": true,
        "to": "player",
        "order": "newest",
        "close": false,
        "auto": { "unvisited": true, "after": "1d", "background": true, "count": true, "n": 10, "futureTrigger": ["keep"] }
      },
      "futureRoot": { "keep": ["unknown", 0, null] }
    }
  },
  {
    "name": "musicActions.buttons.bar",
    "change": { "kind": "option", "field": "musicActions.buttons.bar", "value": true },
    "expectedSettings": {
      "theme": "system",
      "undoKey": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
      "autoAdd": { "on": false, "feedback": true, "pct": 50, "toolbarTick": true, "toolbarPaused": true, "futureAuto": { "keep": true } },
      "shortcuts": {
        "on": false,
        "feedback": true,
        "music": false,
        "preset": true,
        "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
        "list": [
          {
            "id": "save01",
            "key": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
            "label": "Kept shortcut",
            "watchLaterOnEveryAccount": true,
            "futureRow": ["keep"]
          }
        ]
      },
      "quickSave": { "on": false, "feedback": true, "shortsShelves": false },
      "queueButton": { "on": false, "feedback": true, "corner": "top-left" },
      "watchButton": { "on": false, "feedback": true, "shorts": false },
      "cardMenu": { "on": false, "keepLinkMenu": false },
      "browserMenu": { "on": false, "feedback": true },
      "musicSection": false,
      "musicActions": {
        "on": false,
        "feedback": true,
        "preset": true,
        "buttons": { "next": true, "queue": true, "save": false, "like": false, "remove": false, "bar": true, "library": false, "mix": false, "album": false, "artist": false, "futureButton": true }
      },
      "musicKeys": {
        "on": false,
        "feedback": true,
        "preset": true,
        "keys": {
          "next": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "queue": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "save": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "like": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "remove": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "library": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "mix": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "album": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "artist": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } }
        }
      },
      "anyTabKeys": { "on": false, "feedback": true },
      "gather": {
        "on": false,
        "feedback": true,
        "to": "player",
        "order": "newest",
        "close": false,
        "auto": { "unvisited": true, "after": "1d", "background": true, "count": true, "n": 10, "futureTrigger": ["keep"] }
      },
      "futureRoot": { "keep": ["unknown", 0, null] }
    }
  },
  {
    "name": "gather.to",
    "change": { "kind": "option", "field": "gather.to", "value": "playlist" },
    "expectedSettings": {
      "theme": "system",
      "undoKey": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
      "autoAdd": { "on": false, "feedback": true, "pct": 50, "toolbarTick": true, "toolbarPaused": true, "futureAuto": { "keep": true } },
      "shortcuts": {
        "on": false,
        "feedback": true,
        "music": false,
        "preset": true,
        "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
        "list": [
          {
            "id": "save01",
            "key": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
            "label": "Kept shortcut",
            "watchLaterOnEveryAccount": true,
            "futureRow": ["keep"]
          }
        ]
      },
      "quickSave": { "on": false, "feedback": true, "shortsShelves": false },
      "queueButton": { "on": false, "feedback": true, "corner": "top-left" },
      "watchButton": { "on": false, "feedback": true, "shorts": false },
      "cardMenu": { "on": false, "keepLinkMenu": false },
      "browserMenu": { "on": false, "feedback": true },
      "musicSection": false,
      "musicActions": {
        "on": false,
        "feedback": true,
        "preset": true,
        "buttons": { "next": true, "queue": true, "save": false, "like": false, "remove": false, "bar": false, "library": false, "mix": false, "album": false, "artist": false, "futureButton": true }
      },
      "musicKeys": {
        "on": false,
        "feedback": true,
        "preset": true,
        "keys": {
          "next": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "queue": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "save": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "like": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "remove": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "library": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "mix": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "album": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "artist": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } }
        }
      },
      "anyTabKeys": { "on": false, "feedback": true },
      "gather": {
        "on": false,
        "feedback": true,
        "to": "playlist",
        "order": "newest",
        "close": false,
        "auto": { "unvisited": true, "after": "1d", "background": true, "count": true, "n": 10, "futureTrigger": ["keep"] }
      },
      "futureRoot": { "keep": ["unknown", 0, null] }
    }
  },
  {
    "name": "gather.order",
    "change": { "kind": "option", "field": "gather.order", "value": "shuffled" },
    "expectedSettings": {
      "theme": "system",
      "undoKey": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
      "autoAdd": { "on": false, "feedback": true, "pct": 50, "toolbarTick": true, "toolbarPaused": true, "futureAuto": { "keep": true } },
      "shortcuts": {
        "on": false,
        "feedback": true,
        "music": false,
        "preset": true,
        "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
        "list": [
          {
            "id": "save01",
            "key": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
            "label": "Kept shortcut",
            "watchLaterOnEveryAccount": true,
            "futureRow": ["keep"]
          }
        ]
      },
      "quickSave": { "on": false, "feedback": true, "shortsShelves": false },
      "queueButton": { "on": false, "feedback": true, "corner": "top-left" },
      "watchButton": { "on": false, "feedback": true, "shorts": false },
      "cardMenu": { "on": false, "keepLinkMenu": false },
      "browserMenu": { "on": false, "feedback": true },
      "musicSection": false,
      "musicActions": {
        "on": false,
        "feedback": true,
        "preset": true,
        "buttons": { "next": true, "queue": true, "save": false, "like": false, "remove": false, "bar": false, "library": false, "mix": false, "album": false, "artist": false, "futureButton": true }
      },
      "musicKeys": {
        "on": false,
        "feedback": true,
        "preset": true,
        "keys": {
          "next": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "queue": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "save": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "like": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "remove": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "library": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "mix": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "album": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "artist": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } }
        }
      },
      "anyTabKeys": { "on": false, "feedback": true },
      "gather": {
        "on": false,
        "feedback": true,
        "to": "player",
        "order": "shuffled",
        "close": false,
        "auto": { "unvisited": true, "after": "1d", "background": true, "count": true, "n": 10, "futureTrigger": ["keep"] }
      },
      "futureRoot": { "keep": ["unknown", 0, null] }
    }
  },
  {
    "name": "gather.close",
    "change": { "kind": "option", "field": "gather.close", "value": true },
    "expectedSettings": {
      "theme": "system",
      "undoKey": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
      "autoAdd": { "on": false, "feedback": true, "pct": 50, "toolbarTick": true, "toolbarPaused": true, "futureAuto": { "keep": true } },
      "shortcuts": {
        "on": false,
        "feedback": true,
        "music": false,
        "preset": true,
        "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
        "list": [
          {
            "id": "save01",
            "key": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
            "label": "Kept shortcut",
            "watchLaterOnEveryAccount": true,
            "futureRow": ["keep"]
          }
        ]
      },
      "quickSave": { "on": false, "feedback": true, "shortsShelves": false },
      "queueButton": { "on": false, "feedback": true, "corner": "top-left" },
      "watchButton": { "on": false, "feedback": true, "shorts": false },
      "cardMenu": { "on": false, "keepLinkMenu": false },
      "browserMenu": { "on": false, "feedback": true },
      "musicSection": false,
      "musicActions": {
        "on": false,
        "feedback": true,
        "preset": true,
        "buttons": { "next": true, "queue": true, "save": false, "like": false, "remove": false, "bar": false, "library": false, "mix": false, "album": false, "artist": false, "futureButton": true }
      },
      "musicKeys": {
        "on": false,
        "feedback": true,
        "preset": true,
        "keys": {
          "next": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "queue": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "save": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "like": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "remove": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "library": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "mix": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "album": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "artist": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } }
        }
      },
      "anyTabKeys": { "on": false, "feedback": true },
      "gather": {
        "on": false,
        "feedback": true,
        "to": "player",
        "order": "newest",
        "close": true,
        "auto": { "unvisited": true, "after": "1d", "background": true, "count": true, "n": 10, "futureTrigger": ["keep"] }
      },
      "futureRoot": { "keep": ["unknown", 0, null] }
    }
  },
  {
    "name": "gather.auto.unvisited",
    "change": { "kind": "option", "field": "gather.auto.unvisited", "value": false },
    "expectedSettings": {
      "theme": "system",
      "undoKey": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
      "autoAdd": { "on": false, "feedback": true, "pct": 50, "toolbarTick": true, "toolbarPaused": true, "futureAuto": { "keep": true } },
      "shortcuts": {
        "on": false,
        "feedback": true,
        "music": false,
        "preset": true,
        "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
        "list": [
          {
            "id": "save01",
            "key": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
            "label": "Kept shortcut",
            "watchLaterOnEveryAccount": true,
            "futureRow": ["keep"]
          }
        ]
      },
      "quickSave": { "on": false, "feedback": true, "shortsShelves": false },
      "queueButton": { "on": false, "feedback": true, "corner": "top-left" },
      "watchButton": { "on": false, "feedback": true, "shorts": false },
      "cardMenu": { "on": false, "keepLinkMenu": false },
      "browserMenu": { "on": false, "feedback": true },
      "musicSection": false,
      "musicActions": {
        "on": false,
        "feedback": true,
        "preset": true,
        "buttons": { "next": true, "queue": true, "save": false, "like": false, "remove": false, "bar": false, "library": false, "mix": false, "album": false, "artist": false, "futureButton": true }
      },
      "musicKeys": {
        "on": false,
        "feedback": true,
        "preset": true,
        "keys": {
          "next": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "queue": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "save": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "like": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "remove": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "library": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "mix": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "album": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "artist": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } }
        }
      },
      "anyTabKeys": { "on": false, "feedback": true },
      "gather": {
        "on": false,
        "feedback": true,
        "to": "player",
        "order": "newest",
        "close": false,
        "auto": { "unvisited": false, "after": "1d", "background": true, "count": true, "n": 10, "futureTrigger": ["keep"] }
      },
      "futureRoot": { "keep": ["unknown", 0, null] }
    }
  },
  {
    "name": "gather.auto.background",
    "change": { "kind": "option", "field": "gather.auto.background", "value": false },
    "expectedSettings": {
      "theme": "system",
      "undoKey": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
      "autoAdd": { "on": false, "feedback": true, "pct": 50, "toolbarTick": true, "toolbarPaused": true, "futureAuto": { "keep": true } },
      "shortcuts": {
        "on": false,
        "feedback": true,
        "music": false,
        "preset": true,
        "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
        "list": [
          {
            "id": "save01",
            "key": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
            "label": "Kept shortcut",
            "watchLaterOnEveryAccount": true,
            "futureRow": ["keep"]
          }
        ]
      },
      "quickSave": { "on": false, "feedback": true, "shortsShelves": false },
      "queueButton": { "on": false, "feedback": true, "corner": "top-left" },
      "watchButton": { "on": false, "feedback": true, "shorts": false },
      "cardMenu": { "on": false, "keepLinkMenu": false },
      "browserMenu": { "on": false, "feedback": true },
      "musicSection": false,
      "musicActions": {
        "on": false,
        "feedback": true,
        "preset": true,
        "buttons": { "next": true, "queue": true, "save": false, "like": false, "remove": false, "bar": false, "library": false, "mix": false, "album": false, "artist": false, "futureButton": true }
      },
      "musicKeys": {
        "on": false,
        "feedback": true,
        "preset": true,
        "keys": {
          "next": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "queue": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "save": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "like": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "remove": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "library": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "mix": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "album": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "artist": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } }
        }
      },
      "anyTabKeys": { "on": false, "feedback": true },
      "gather": {
        "on": false,
        "feedback": true,
        "to": "player",
        "order": "newest",
        "close": false,
        "auto": { "unvisited": true, "after": "1d", "background": false, "count": true, "n": 10, "futureTrigger": ["keep"] }
      },
      "futureRoot": { "keep": ["unknown", 0, null] }
    }
  },
  {
    "name": "gather.auto.count",
    "change": { "kind": "option", "field": "gather.auto.count", "value": false },
    "expectedSettings": {
      "theme": "system",
      "undoKey": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
      "autoAdd": { "on": false, "feedback": true, "pct": 50, "toolbarTick": true, "toolbarPaused": true, "futureAuto": { "keep": true } },
      "shortcuts": {
        "on": false,
        "feedback": true,
        "music": false,
        "preset": true,
        "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
        "list": [
          {
            "id": "save01",
            "key": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
            "label": "Kept shortcut",
            "watchLaterOnEveryAccount": true,
            "futureRow": ["keep"]
          }
        ]
      },
      "quickSave": { "on": false, "feedback": true, "shortsShelves": false },
      "queueButton": { "on": false, "feedback": true, "corner": "top-left" },
      "watchButton": { "on": false, "feedback": true, "shorts": false },
      "cardMenu": { "on": false, "keepLinkMenu": false },
      "browserMenu": { "on": false, "feedback": true },
      "musicSection": false,
      "musicActions": {
        "on": false,
        "feedback": true,
        "preset": true,
        "buttons": { "next": true, "queue": true, "save": false, "like": false, "remove": false, "bar": false, "library": false, "mix": false, "album": false, "artist": false, "futureButton": true }
      },
      "musicKeys": {
        "on": false,
        "feedback": true,
        "preset": true,
        "keys": {
          "next": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "queue": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "save": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "like": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "remove": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "library": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "mix": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "album": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "artist": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } }
        }
      },
      "anyTabKeys": { "on": false, "feedback": true },
      "gather": {
        "on": false,
        "feedback": true,
        "to": "player",
        "order": "newest",
        "close": false,
        "auto": { "unvisited": true, "after": "1d", "background": true, "count": false, "n": 10, "futureTrigger": ["keep"] }
      },
      "futureRoot": { "keep": ["unknown", 0, null] }
    }
  },
  {
    "name": "gather.auto.after",
    "change": { "kind": "option", "field": "gather.auto.after", "value": "1w" },
    "expectedSettings": {
      "theme": "system",
      "undoKey": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
      "autoAdd": { "on": false, "feedback": true, "pct": 50, "toolbarTick": true, "toolbarPaused": true, "futureAuto": { "keep": true } },
      "shortcuts": {
        "on": false,
        "feedback": true,
        "music": false,
        "preset": true,
        "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
        "list": [
          {
            "id": "save01",
            "key": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
            "label": "Kept shortcut",
            "watchLaterOnEveryAccount": true,
            "futureRow": ["keep"]
          }
        ]
      },
      "quickSave": { "on": false, "feedback": true, "shortsShelves": false },
      "queueButton": { "on": false, "feedback": true, "corner": "top-left" },
      "watchButton": { "on": false, "feedback": true, "shorts": false },
      "cardMenu": { "on": false, "keepLinkMenu": false },
      "browserMenu": { "on": false, "feedback": true },
      "musicSection": false,
      "musicActions": {
        "on": false,
        "feedback": true,
        "preset": true,
        "buttons": { "next": true, "queue": true, "save": false, "like": false, "remove": false, "bar": false, "library": false, "mix": false, "album": false, "artist": false, "futureButton": true }
      },
      "musicKeys": {
        "on": false,
        "feedback": true,
        "preset": true,
        "keys": {
          "next": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "queue": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "save": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "like": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "remove": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "library": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "mix": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "album": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "artist": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } }
        }
      },
      "anyTabKeys": { "on": false, "feedback": true },
      "gather": {
        "on": false,
        "feedback": true,
        "to": "player",
        "order": "newest",
        "close": false,
        "auto": { "unvisited": true, "after": "1w", "background": true, "count": true, "n": 10, "futureTrigger": ["keep"] }
      },
      "futureRoot": { "keep": ["unknown", 0, null] }
    }
  },
  {
    "name": "gather.auto.n",
    "change": { "kind": "option", "field": "gather.auto.n", "value": 50 },
    "expectedSettings": {
      "theme": "system",
      "undoKey": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
      "autoAdd": { "on": false, "feedback": true, "pct": 50, "toolbarTick": true, "toolbarPaused": true, "futureAuto": { "keep": true } },
      "shortcuts": {
        "on": false,
        "feedback": true,
        "music": false,
        "preset": true,
        "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
        "list": [
          {
            "id": "save01",
            "key": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
            "label": "Kept shortcut",
            "watchLaterOnEveryAccount": true,
            "futureRow": ["keep"]
          }
        ]
      },
      "quickSave": { "on": false, "feedback": true, "shortsShelves": false },
      "queueButton": { "on": false, "feedback": true, "corner": "top-left" },
      "watchButton": { "on": false, "feedback": true, "shorts": false },
      "cardMenu": { "on": false, "keepLinkMenu": false },
      "browserMenu": { "on": false, "feedback": true },
      "musicSection": false,
      "musicActions": {
        "on": false,
        "feedback": true,
        "preset": true,
        "buttons": { "next": true, "queue": true, "save": false, "like": false, "remove": false, "bar": false, "library": false, "mix": false, "album": false, "artist": false, "futureButton": true }
      },
      "musicKeys": {
        "on": false,
        "feedback": true,
        "preset": true,
        "keys": {
          "next": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "queue": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "save": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "picker": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "like": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "remove": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "library": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "mix": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "album": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } },
          "artist": { "char": "n", "code": "KeyN", "ctrl": false, "alt": true, "shift": false, "meta": false, "futureKey": { "keep": [1, null] } }
        }
      },
      "anyTabKeys": { "on": false, "feedback": true },
      "gather": {
        "on": false,
        "feedback": true,
        "to": "player",
        "order": "newest",
        "close": false,
        "auto": { "unvisited": true, "after": "1d", "background": true, "count": true, "n": 50, "futureTrigger": ["keep"] }
      },
      "futureRoot": { "keep": ["unknown", 0, null] }
    }
  }
]
