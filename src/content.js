let toastCount = 0; // To keep track of the number of active toasts

// Function to create and show a toast notification on the YouTube page
function showToast(message) {
  browser.storage.local.get("toastEnabled", (data) => {
    if (data.toastEnabled) {
      const toast = document.createElement("div");
      toast.textContent = message;
      toast.className = "toast";
      toast.style.position = "fixed";
      toast.style.top = "20px"; // Initial position for the newest toast
      toast.style.left = "50%";
      toast.style.transform = "translateX(-50%)";
      toast.style.backgroundColor = "#333";
      toast.style.color = "#fff";
      toast.style.padding = "10px 20px";
      toast.style.borderRadius = "5px";
      toast.style.zIndex = "10000";
      toast.style.fontSize = "16px";
      toast.style.opacity = "0";
      toast.style.transition = "opacity 0.3s ease, top 0.3s ease";

      // Insert the new toast at the top of the body
      document.body.insertBefore(toast, document.body.firstChild);
      toastCount++;

      // Slide down existing toasts
      const existingToasts = document.querySelectorAll(".toast");
      existingToasts.forEach((t, index) => {
        t.style.top = `${20 + index * 50}px`;
      });

      // Fade in the new toast
      setTimeout(() => {
        toast.style.opacity = "1";
      }, 10);

      // Fade out and remove the toast after 3 seconds
      setTimeout(() => {
        toast.style.opacity = "0";
        setTimeout(() => {
          toast.remove();
          toastCount--; // Decrement toast count when a toast is removed
          // Adjust positions of remaining toasts
          const remainingToasts = document.querySelectorAll(".toast");
          remainingToasts.forEach((t, index) => {
            t.style.top = `${20 + index * 50}px`;
          });
        }, 300);
      }, 3000);
    }
  });
}

function addWatchListener() {
  let videoId = new URL(location.href).searchParams.get("v");
  let videoElement = document.querySelector("video");

  if (videoId && videoElement) {
    videoElement.addEventListener("timeupdate", () => {
      let watchedPercentage =
        (videoElement.currentTime / videoElement.duration) * 100;
      browser.storage.local.get("requiredWatchPercentage", (result) => {
        let requiredPercentage = result.requiredWatchPercentage || 0;
        if (watchedPercentage >= requiredPercentage) {
          browser.runtime.sendMessage({
            action: "addVideoToPlaylists",
            videoId,
          });
        }
      });
    });
  }
}

addWatchListener();
