document.addEventListener("DOMContentLoaded", () => {
  const playlistContainer = document.getElementById("playlistContainer");
  const addButton = document.getElementById("addButton");
  const recordShortcutButton = document.getElementById("recordShortcutButton");
  const shortcutDisplay = document.getElementById("shortcutDisplay");
  const debugButton = document.getElementById("debugButton");
  const toastToggle = document.getElementById("toastToggle");
  const toastContainer = document.getElementById("toastContainer");
  const authorizeButton = document.getElementById("authorize");
  const watchPercentageSlider = document.getElementById(
    "watchPercentageSlider"
  );
  const watchPercentageField = document.getElementById("watchPercentageField");
  let shortcutKeys = [];
  let debounceTimeout;

  function debounce(func, wait) {
    return function (...args) {
      clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  const savePlaylists = debounce(() => {
    const playlistInputs = document.querySelectorAll(".playlist");
    const playlists = Array.from(playlistInputs)
      .map((input) => input.value.trim())
      .filter((name) => name);

    browser.storage.local.set({ playlists }, () => {
      showToast("Playlists saved!");
    });
  }, 500);

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
      showToast("Playlist removed!");
    });

    div.appendChild(input);
    div.appendChild(removeButton);
    playlistContainer.appendChild(div);
  }

  addButton.addEventListener("click", () => {
    addPlaylistInput("");
    showToast("Playlist added!");
  });

  recordShortcutButton.addEventListener("click", () => {
    shortcutKeys = [];
    shortcutDisplay.textContent = "Press the shortcut key combination";
    recordShortcutButton.disabled = true;
    document.addEventListener("keydown", recordShortcut);
  });

  function recordShortcut(event) {
    event.preventDefault();
    shortcutKeys.push(event.key);
    if (["Control", "Alt", "Shift", "Meta"].includes(event.key)) {
      return;
    }

    const shortcut = shortcutKeys.join("+");
    shortcutDisplay.textContent = `Shortcut: ${shortcut}`;
    browser.storage.local.set({ watchLaterShortcut: shortcut }, () => {
      showToast("Shortcut saved!");
    });
    stopRecordingShortcut();
  }

  function stopRecordingShortcut() {
    document.removeEventListener("keydown", recordShortcut);
    recordShortcutButton.disabled = false;
  }

  function showToast(message) {
    const toast = document.createElement("div");
    toast.textContent = message;
    toast.className = "toast";

    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "1";
    }, 10);

    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, 3000);
  }

  debugButton.addEventListener("click", () => {
    browser.storage.local
      .clear()
      .then(() => {
        showToast("Storage cleared!");
        playlistContainer.innerHTML = "";
        shortcutDisplay.textContent = "";
        addPlaylistInput("");
        toastToggle.checked = false;
      })
      .catch((error) => {
        console.error("Error clearing storage:", error);
        showToast("Failed to clear storage");
      });
  });

  toastToggle.addEventListener("change", () => {
    browser.storage.local.set({ toastEnabled: toastToggle.checked }, () => {
      showToast("Toast notification setting saved!");
    });
  });

  browser.storage.local.get(
    [
      "playlists",
      "watchLaterShortcut",
      "toastEnabled",
      "requiredWatchPercentage",
      "accessToken",
    ],
    (data) => {
      if (data.playlists && data.playlists.length > 0) {
        data.playlists.forEach((playlist, index) => {
          addPlaylistInput(playlist);
        });
      } else {
        addPlaylistInput("");
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

      if (data.accessToken) {
        authorizeButton.classList.add("authorized");
        authorizeButton.textContent = "Authorized";
        authorizeButton.disabled = true;
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

// Start the OAuth flow
document.getElementById("authorize").addEventListener("click", () => {
  const clientId =
    "1075675665707-58cpdng6bp1holno32a5ivomf72d17fc.apps.googleusercontent.com";
  const redirectUri =
    "http://127.0.0.1/mozoauth2/3674d031f91c4d1f63992b40b32667c173e578cd";
  const scopes = "https://www.googleapis.com/auth/youtube.force-ssl";

  const authUrl = `https://accounts.google.com/o/oauth2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&response_type=token&scope=${encodeURIComponent(scopes)}`;

  browser.identity
    .launchWebAuthFlow({
      interactive: true,
      url: authUrl,
    })
    .then((redirectUrl) => {
      const params = new URL(redirectUrl).hash.substring(1);
      const accessToken = new URLSearchParams(params).get("access_token");

      if (accessToken) {
        browser.storage.local.set({ accessToken }).then(() => {
          const authorizeButton = document.getElementById("authorize");
          authorizeButton.classList.add("authorized");
          authorizeButton.textContent = "Authorized";
          authorizeButton.disabled = true;
        });
      } else {
        console.error("Authorization failed");
      }
    })
    .catch((error) => {
      console.error("Error during authorization", error);
    });
});
