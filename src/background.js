async function refreshAccessToken() {
  const data = await browser.storage.local.get([
    "clientID",
    "clientSecret",
    "refreshToken",
  ]);
  const clientID = data.clientID;
  const clientSecret = data.clientSecret;
  const refreshToken = data.refreshToken;

  const tokenUrl = "https://oauth2.googleapis.com/token";

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientID,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (response.ok) {
    const data = await response.json();
    const { access_token } = data;
    await browser.storage.local.set({ accessToken: access_token });
    return access_token;
  } else {
    browser.tabs.sendMessage(sender.tab.id, {
      action: "showToast",
      toastMessage: `Failed to refresh access token, please check credentials`,
    });
    console.error(
      "[Youtube Playlist Tools]: Failed to refresh access token",
      response.statusText
    );
    return null;
  }
}

function preventDuplicates() {
  return localStorage.getItem("preventDuplicates") === "true";
}

function getCachedVideos() {
  return JSON.parse(localStorage.getItem("cachedVideos") || "{}");
}

function cacheVideo(playlistId, videoId) {
  let cachedVideos = getCachedVideos();
  if (!cachedVideos[playlistId]) {
    cachedVideos[playlistId] = [];
  }
  if (!cachedVideos[playlistId].includes(videoId)) {
    cachedVideos[playlistId].push(videoId);
    localStorage.setItem("cachedVideos", JSON.stringify(cachedVideos));
  }
}

function isVideoCached(playlistId, videoId) {
  let cachedVideos = getCachedVideos();
  if (cachedVideos && cachedVideos[playlistId])
    return cachedVideos[playlistId].includes(videoId);
  return false;
}

async function addToPlaylist(sender, playlistId, videoId, accessToken) {
  if (preventDuplicates) {
    if (isVideoCached(playlistId, videoId)) {
      browser.tabs.sendMessage(sender.tab.id, {
        action: "showToast",
        toastMessage: `Video already in playlist.`,
      });
      return;
    }
  }

  const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet`;
  const body = {
    snippet: {
      playlistId,
      resourceId: {
        kind: "youtube#video",
        videoId,
      },
    },
  };

  let response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (response.status === 200) {
    cacheVideo(playlistId, videoId);

    browser.tabs.sendMessage(sender.tab.id, {
      action: "showToast",
      toastMessage: `Added ${videoId} to shortcut playlist`,
    });
  } else if (response.status === 401) {
    // Token expired or invalid, try to refresh
    const newAccessToken = await refreshAccessToken();
    if (newAccessToken) {
      response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${newAccessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } else {
      console.error("Failed to refresh access token");
    }
  }

  if (!response.ok) {
    console.error("Failed to add video to playlist:", response.statusText);
  }
}

browser.runtime.onMessage.addListener(async (message, sender) => {
  if (message.action === "addVideoToPlaylists") {
    const { videoId } = message;

    browser.storage.local.get(["playlists", "accessToken"], async (result) => {
      const playlists = result.playlists || [];
      const accessToken = result.accessToken;

      if (!accessToken) {
        browser.tabs.sendMessage(sender.tab.id, {
          action: "showToast",
          toastMessage: `No access token found`,
        });
        console.error("[Youtube Playlist Tools]: No access token found");
        return;
      }

      for (const playlistId of playlists) {
        await addToPlaylist(sender, playlistId, videoId, accessToken);
      }
    });
  } else if (message.action === "addVideoToShortcutPlaylist") {
    const { videoId } = message;
    browser.storage.local.get(
      ["addToPlaylistID", "accessToken"],
      async (result) => {
        const playlistId = result.addToPlaylistID;
        const accessToken = result.accessToken;

        if (!accessToken) {
          browser.tabs.sendMessage(sender.tab.id, {
            action: "showToast",
            toastMessage: `No access token found`,
          });
          console.error("[Youtube Playlist Tools]: No access token found");
          return;
        }

        await addToPlaylist(playlistId, videoId, accessToken);
      }
    );
  }
});
