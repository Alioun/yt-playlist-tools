const clientIDField = document.getElementById("clientID");
const clientSecretField = document.getElementById("clientSecret");
const authButton = document.getElementById("auth");
const debugButton = document.getElementById("debugButton");
const redirectURI = `http://127.0.0.1/mozoauth2/${
  new URL(browser.identity.getRedirectURL()).host.split(".")[0]
}`;

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

async function restoreOptions() {
  const data = await browser.storage.local.get([
    "clientID",
    "clientSecret",
    "accessToken",
    "refreshToken",
  ]);

  if (data.clientID) document.getElementById("clientID").value = data.clientID;
  if (data.clientSecret)
    document.getElementById("clientSecret").value = data.clientSecret;

  document.getElementById("redirectURI").innerText = redirectURI;

  if (data.refreshToken) {
    authButton.classList.add("authorized");
    authButton.textContent = "Authorized";
    authButton.disabled = true;
  }
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

document.addEventListener("DOMContentLoaded", restoreOptions);

clientIDField.addEventListener("input", (event) => {
  const value = event.target.value;
  browser.storage.local.set({ clientID: value });
});
clientSecretField.addEventListener("input", (event) => {
  const value = event.target.value;
  browser.storage.local.set({ clientSecret: value });
});

// Start the OAuth flow
document.getElementById("auth").addEventListener("click", async () => {
  const data = await browser.storage.local.get(["clientID", "clientSecret"]);
  if (!(data.clientID && data.clientSecret))
    showToast("ClientID and/or Secret missing");

  const clientID = data.clientID;
  const clientSecret = data.clientSecret;
  const scopes = "https://www.googleapis.com/auth/youtube.force-ssl";

  const authUrl = `https://accounts.google.com/o/oauth2/auth?client_id=${clientID}&redirect_uri=${encodeURIComponent(
    redirectURI
  )}&response_type=code&scope=${encodeURIComponent(
    scopes
  )}&access_type=offline`;

  browser.identity
    .launchWebAuthFlow({
      interactive: true,
      url: authUrl,
    })
    .then(async (redirectUrl) => {
      const code = new URL(redirectUrl).searchParams.get("code");
      const tokenUrl = "https://oauth2.googleapis.com/token";

      const response = await fetch(tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          code,
          client_id: clientID,
          client_secret: clientSecret,
          redirect_uri: redirectURI,
          grant_type: "authorization_code",
        }),
      });

      const data = await response.json();
      const { access_token, refresh_token } = data;

      if (access_token && refresh_token) {
        await browser.storage.local.set({
          accessToken: access_token,
          refreshToken: refresh_token,
        });
        const authorizeButton = document.getElementById("auth");
        authorizeButton.classList.add("authorized");
        authorizeButton.textContent = "Authorized";
        authorizeButton.disabled = true;
      } else {
        console.error("Authorization failed");
      }
    })
    .catch((error) => {
      console.error("Error during authorization", error);
    });
});
