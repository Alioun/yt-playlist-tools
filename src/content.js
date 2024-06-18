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

  } catch (error) {
    showToast(`Failed to add video to playlists: ${error}`);
    console.error('Failed to add video to playlists:', error);
  }
}

async function addToWatchLater() {
    try {
      
      // Wait for the "Save" button to appear and click it
      const saveButton = await waitForElement('button[aria-label="Save to playlist"]');
      saveButton.click();
      
      // Wait for the playlist menu to appear
      const playlistMenu = await waitForElement('ytd-add-to-playlist-renderer');
      const playlistName = "Watch later"
      
      const watchLaterCheckbox = Array.from(playlistMenu.querySelectorAll('yt-formatted-string'))
        .find(element => element.innerText.trim() === playlistName);

      if (!watchLaterCheckbox) {
        showToast(`Playlist not found: ${playlistName}`);
        console.warn('Playlist not found:', playlistName);
        // Close the playlist menu
        const closeButton = playlistMenu.querySelector('button[aria-label="Cancel"]');
        closeButton.click();
        throw Error;
      }

      // Check if the video is already in the playlist
      const checkboxElement = watchLaterCheckbox.closest('ytd-playlist-add-to-option-renderer')
        .querySelector('tp-yt-paper-checkbox');

      if (checkboxElement.hasAttribute('checked')) {
        showToast(`Video is already in the playlist: ${playlistName}`);
        console.log(`Video is already in the playlist: ${playlistName}`);
        
      } else {
        // Add the video to the playlist
        watchLaterCheckbox.click();
        showToast(`Video added to playlist: ${playlistName}`);
        console.log(`Video added to playlist: ${playlistName}`);
        
      }
      
      // Close the playlist menu
      const closeButton = playlistMenu.querySelector('button[aria-label="Cancel"]');
      closeButton.click();
  
    } catch (error) {
      console.error('Failed to add video to Watch Later:', error);
    }
  }
  
  function handleShortcut(event) {
    browser.storage.local.get('watchLaterShortcut', (data) => {
      if (data.watchLaterShortcut) {
        const [key, ...modifiers] = data.watchLaterShortcut.split('+').reverse();
        const allModifiersMatch = modifiers.every(mod => event[`${mod.toLowerCase()}Key`]);
        if (event.key.toLowerCase() === key.toLowerCase() && allModifiersMatch && !isSearchBarFocused()) {
          addToWatchLater().then(r => showToast("Added to Watch Later"));
        }
      }
    });
  }

browser.storage.local.get('playlists', (data) => {
  if (data.playlists && data.playlists.length > 0) {
    addToPlaylists(data.playlists).then(r => showToast("Added to Playlists"));
  } else {
    console.warn('No playlists found in storage.');
  }
});

window.addEventListener('keydown', handleShortcut);
