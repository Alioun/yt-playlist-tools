async function addToPlaylist(playlistId, videoId, accessToken) {
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

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    console.error("Failed to add video to playlist:", response.statusText);
  }
}

browser.runtime.onMessage.addListener(async (message) => {
  if (message.action === "addVideoToPlaylists") {
    const { videoId } = message;

    // Fetch the playlist IDs and access token from storage
    browser.storage.local.get(
      ["playlistIds", "accessToken"],
      async (result) => {
        const playlistIds = result.playlistIds || [];
        const accessToken = result.accessToken;

        if (!accessToken) {
          console.error("No access token found");
          return;
        }

        for (const playlistId of playlistIds) {
          await addToPlaylist(playlistId, videoId, accessToken);
        }
      }
    );
  }
});
