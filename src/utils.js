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

export { refreshAccessToken };
