const playlistContainer = document.getElementById("playlistContainer");
const addButton = document.getElementById("addButton");
const recordShortcutButton = document.getElementById("recordShortcutButton");
const addToPlaylistShortcutField = document.getElementById(
  "addToPlaylistShortcutField"
);
const shortcutDisplay = document.getElementById("shortcutDisplay");
const toastToggle = document.getElementById("toastToggle");
const watchPercentageSlider = document.getElementById("watchPercentageSlider");
const watchPercentageField = document.getElementById("watchPercentageField");
let shortcutKeys = [];

function savePlaylists() {
  const playlistInputs = document.querySelectorAll(".playlist");
  const playlists = Array.from(playlistInputs)
    .map((input) => input.value.trim())
    .filter((name) => name);

  browser.storage.local.set({ playlists });
}

function addPlaylistInput(value = "") {
  const div = document.createElement("div");
  const input = document.createElement("input");
  const removeButton = document.createElement("button");

  input.type = "text";
  input.className = "playlist";
  input.placeholder = "Playlist ID";
  input.value = value;
  input.addEventListener("input", savePlaylists);

  removeButton.textContent = "Remove";
  removeButton.addEventListener("click", () => {
    div.remove();
    savePlaylists();
  });

  div.appendChild(input);
  div.appendChild(removeButton);
  playlistContainer.appendChild(div);
}

function recordShortcut(event) {
  event.preventDefault();
  shortcutKeys.push(event.key);
  if (["Control", "Alt", "Shift", "Meta"].includes(event.key)) {
    return;
  }

  shortcutKeys[shortcutKeys.length - 1] =
    shortcutKeys[shortcutKeys.length - 1].toUpperCase(); //example: instead of Shift + p it now prints Shift + P; much good; much improvement

  const shortcut = shortcutKeys.join("+");
  shortcutDisplay.textContent = `Shortcut: ${shortcut}`;
  browser.storage.local.set({ watchLaterShortcut: shortcut });
  stopRecordingShortcut();
}

function stopRecordingShortcut() {
  document.removeEventListener("keydown", recordShortcut);
  recordShortcutButton.disabled = false;
}

document.addEventListener("DOMContentLoaded", () => {
  browser.storage.local.get(
    [
      "playlists",
      "addToPlaylistID",
      "watchLaterShortcut",
      "toastEnabled",
      "requiredWatchPercentage",
    ],
    (data) => {
      if (data.playlists && data.playlists.length > 0) {
        data.playlists.forEach((playlist) => {
          addPlaylistInput(playlist);
        });
      } else {
        addPlaylistInput("");
      }

      if (data.addToPlaylistID) {
        addToPlaylistShortcutField.value = data.addToPlaylistID;
      }

      if (data.watchLaterShortcut) {
        shortcutDisplay.textContent = `Shortcut: ${data.watchLaterShortcut}`;
      }

      if (typeof data.toastEnabled !== "undefined") {
        toastToggle.checked = data.toastEnabled;
      }

      if (data.requiredWatchPercentage) {
        watchPercentageSlider.value = data.requiredWatchPercentage;
        watchPercentageField.value = data.requiredWatchPercentage;
      }
    }
  );
});

// Sync slider and number input, and save the value to storage
document
  .getElementById("watchPercentageSlider")
  .addEventListener("input", (event) => {
    const value = event.target.value;
    document.getElementById("watchPercentageField").value = value;
    browser.storage.local.set({ requiredWatchPercentage: value });
  });

document
  .getElementById("watchPercentageField")
  .addEventListener("input", (event) => {
    const value = event.target.value;
    if (value >= 0 && value <= 100) {
      document.getElementById("watchPercentageSlider").value = value;
      browser.storage.local.set({ requiredWatchPercentage: value });
    }
  });

addButton.addEventListener("click", () => {
  addPlaylistInput("");
});

addToPlaylistShortcutField.addEventListener("input", (event) => {
  const value = event.target.value;
  browser.storage.local.set({ addToPlaylistID: value });
});

recordShortcutButton.addEventListener("click", () => {
  shortcutKeys = [];
  shortcutDisplay.textContent = "Press the shortcut key combination";
  recordShortcutButton.disabled = true;
  document.addEventListener("keydown", recordShortcut);
});

toastToggle.addEventListener("change", () => {
  browser.storage.local.set({ toastEnabled: toastToggle.checked }, () => {
    showToast("Toast notification setting saved!");
  });
});
