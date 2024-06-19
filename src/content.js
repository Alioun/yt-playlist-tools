let toastCount = 0;  // To keep track of the number of active toasts

// Function to create and show a toast notification on the YouTube page
function showToast(message) {
  browser.storage.local.get('toastEnabled', (data) => {
    if (data.toastEnabled) {
      const toast = document.createElement('div');
      toast.textContent = message;
      toast.className = 'toast';
      toast.style.position = 'fixed';
      toast.style.top = '20px'; // Initial position for the newest toast
      toast.style.left = '50%';
      toast.style.transform = 'translateX(-50%)';
      toast.style.backgroundColor = '#333';
      toast.style.color = '#fff';
      toast.style.padding = '10px 20px';
      toast.style.borderRadius = '5px';
      toast.style.zIndex = '10000';
      toast.style.fontSize = '16px';
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease, top 0.3s ease';
    
      // Insert the new toast at the top of the body
      document.body.insertBefore(toast, document.body.firstChild);
      toastCount++;
    
      // Slide down existing toasts
      const existingToasts = document.querySelectorAll('.toast');
      existingToasts.forEach((t, index) => {
        t.style.top = `${20 + index * 50}px`;
      });
    
      // Fade in the new toast
      setTimeout(() => {
        toast.style.opacity = '1';
      }, 10);
    
      // Fade out and remove the toast after 3 seconds
      setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => {
          toast.remove();
          toastCount--; // Decrement toast count when a toast is removed
          // Adjust positions of remaining toasts
          const remainingToasts = document.querySelectorAll('.toast');
          remainingToasts.forEach((t, index) => {
            t.style.top = `${20 + index * 50}px`;
          });
        }, 300);
      }, 3000);
    }
  });
  
}

function waitForElement(selector, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const interval = 100;
    const endTime = Date.now() + timeout;

    (function check() {
      const element = document.querySelector(selector);
      if (element) {
        resolve(element);
      } else if (Date.now() > endTime) {
        reject(new Error("Element not found: " + selector));
      } else {
        setTimeout(check, interval);
      }
    })();
  });
}

function isSearchBarFocused() {
  const activeElement = document.activeElement;
  return activeElement.tagName.toLowerCase() === 'input' && activeElement.id === 'search';
}
async function addToPlaylists(playlists) {
  const videoId = new URLSearchParams(window.location.search).get('v');
  if (!videoId) return;
  try {
    // Wait for the "Save" button to appear and click it
    const saveButton = await waitForElement('button[aria-label="Save to playlist"]');
    saveButton.click();

    // Wait for the playlist menu to appear
    const playlistMenu = await waitForElement('ytd-add-to-playlist-renderer');

    for (const playlistName of playlists) {
      const playlistCheckbox = Array.from(playlistMenu.querySelectorAll('yt-formatted-string'))
        .find(element => element.innerText.trim() === playlistName);

      if (!playlistCheckbox) {
        showToast(`Playlist not found: ${playlistName}`);
        console.warn('Playlist not found:', playlistName);
        continue;
      }

      // Check if the video is already in the playlist
      const checkboxElement = playlistCheckbox.closest('ytd-playlist-add-to-option-renderer')
        .querySelector('tp-yt-paper-checkbox');

      if (checkboxElement.hasAttribute('checked')) {
        showToast(`Video is already in the playlist: ${playlistName}`);
        console.log(`Video is already in the playlist: ${playlistName}`);
      } else {
        // Add the video to the playlist
        playlistCheckbox.click();
        showToast(`Video added to playlist: ${playlistName}`);
        console.log(`Video added to playlist: ${playlistName}`);
      }
    }

    // Close the playlist menu
    const closeButton = playlistMenu.querySelector('button[aria-label="Cancel"]');
    closeButton.click();
    showToast('Video added to playlists');

  } catch (error) {
    showToast(`Failed to add video to playlists: ${error}`);
    console.error('Failed to add video to playlists:', error);
  }
}

async function addToWatchLater() {
  try {
    await addToPlaylists(['Watch later']);
  } catch (error) {
    console.error('Failed to add video to Watch Later:', error);
  }
}
  
// Function to handle keyboard shortcut
async function handleShortcut(event) {
  try {
    // Fetch watchLaterShortcut from local storage
    const data = await browser.storage.local.get('watchLaterShortcut');
    const watchLaterShortcut = data.watchLaterShortcut;

    if (watchLaterShortcut) {
      // Parse the shortcut combination
      const [key, ...modifiers] = watchLaterShortcut.split('+').reverse();
      const allModifiersMatch = modifiers.every(mod => event[`${mod.toLowerCase()}Key`]);

      // Check if the event matches the shortcut and the search bar is not focused
      if (event.key.toLowerCase() === key.toLowerCase() && allModifiersMatch && !isSearchBarFocused()) {
        await addToWatchLater();
      }
    }
  } catch (error) {
    console.error('Error fetching watchLaterShortcut:', error);
  }
}

// Function to handle URL changes after delay
async function handleUrlChangeDelayed() {
  clearTimeout(urlChangeTimeout); // Clear any existing timeout

  // Set a new timeout to handle URL change after 20 seconds
  urlChangeTimeout = setTimeout(async () => {
    await handleUrlChange();
  }, 20000); // Delay of 20 seconds (20000 milliseconds)
}

// Function to handle URL changes
async function handleUrlChange() {
  if (window.location.href.includes('youtube.com/watch')) {
    try {
      const data = await browser.storage.local.get('playlists');
      const playlists = data.playlists || [];

      if (playlists.length > 0) {
          await addToPlaylists(playlists);
      } else {
        console.warn('No playlists found in storage.');
      }
    } catch (error) {
      console.error('Error fetching playlists from storage:', error);
    }
  }
}

// Below starts the "inspiration" from the return-youtube-dislike extension, thanks!

// yoinked from https://github.com/Anarios/return-youtube-dislike/blob/main/Extensions/UserScript/Return%20Youtube%20Dislike.user.js#L519
function isVideoLoaded() {
  const videoId = getVideoId();
  return (
    // desktop: spring 2024 UI
    document.querySelector(`ytd-watch-grid[video-id='${videoId}']`) !== null ||
    // desktop: older UI
    document.querySelector(`ytd-watch-flexy[video-id='${videoId}']`) !== null ||
    // mobile: no video-id attribute
    document.querySelector('#player[loading="false"]:not([hidden])') !== null
  );
}

function getVideoId() {
  const urlObject = new URL(window.location.href);
  const pathname = urlObject.pathname;
  if (pathname.startsWith("/clip")) {
    return (document.querySelector("meta[itemprop='videoId']") || document.querySelector("meta[itemprop='identifier']")).content;
  } else {
    if (pathname.startsWith("/shorts")) {
      return pathname.slice(8);
    }
    return urlObject.searchParams.get("v");
  }
}

// yoinked from https://github.com/Anarios/return-youtube-dislike/blob/main/Extensions/UserScript/Return%20Youtube%20Dislike.user.js#L76
function getButtons() {
  if (document.getElementById("menu-container")?.offsetParent === null) {
    return (
      document.querySelector("ytd-menu-renderer.ytd-watch-metadata > div") ??
      document.querySelector("ytd-menu-renderer.ytd-video-primary-info-renderer > div")
    );
  } else {
    return document.getElementById("menu-container")?.querySelector("#top-level-buttons-computed");
  }
}

let jsInitChecktimer = null;

async function setEventListeners(evt) {
  async function checkForJS_Finish() {
    try {
      if ((getButtons()?.offsetParent && isVideoLoaded())) {
        clearInterval(jsInitChecktimer);
        jsInitChecktimer = null;
        await handleUrlChange();
      }
    } catch (exception) {
      console.error('Error checking for JS_Finish:', exception);
    }
  }

  if (jsInitChecktimer !== null) clearInterval(jsInitChecktimer);
  jsInitChecktimer = setInterval(await checkForJS_Finish, 111);
}

// listeners
window.addEventListener('keydown', async function(event) {
        await handleShortcut(event);
    });
window.addEventListener('yt-navigate-finish', async function() {
    await setEventListeners();
});
