console.log("script.js loaded");

// Initialize variables
let timer;
let timeLeft;
let audio;
let isRunning = false;
let videoFilterInterval;

// Update status on page load
document.getElementById("status").textContent = "App loaded, waiting for Zoom SDK...";

// Function to check audio URL validity
async function checkAudioUrl(url) {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('audio/')) {
      throw new Error('Invalid audio content type');
    }
    return true;
  } catch (err) {
    console.error("Audio URL check failed:", err);
    return false;
  }
}

// Function to render timer on canvas
function renderTimerOnCanvas(timeLeft) {
  const canvas = document.getElementById("timerCanvas");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
  ctx.fillRect(0, 0, canvas.width, 50);
  ctx.font = "30px Arial";
  ctx.fillStyle = "white";
  ctx.textAlign = "center";
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  ctx.fillText(
    `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`,
    canvas.width / 2,
    35
  );
}

// Function to initialize Zoom SDK with retry
function initializeZoomSdk(attempts = 10, delay = 2000) {
  console.log(`Attempting Zoom SDK initialization (${attempts} attempts left)`);
  if (typeof zoomSdk === "undefined") {
    if (attempts > 0) {
      console.warn(`Zoom SDK not available, retrying in ${delay}ms...`);
      setTimeout(() => initializeZoomSdk(attempts - 1, delay), delay);
    } else {
      console.error("Zoom SDK not available after retries");
      document.getElementById("status").textContent = "Error: Zoom SDK not available. This app must be run within a Zoom meeting. Please ensure the app is installed and the meeting supports apps.";
    }
    return;
  }

  zoomSdk.config({
    capabilities: ["notifyAppEvent", "postMessage", "onMessage", "setVideoFilter", "getUserContext"]
  }).then(() => {
    console.log("Zoom SDK Initialized Successfully");
    document.getElementById("status").textContent = "Ready to start timer";

    // Listen for timer data from other participants
    zoomSdk.onMessage(data => {
      console.log("Received message:", data);
      if (data.type === "timer_start") {
        const { startTime, duration, audioUrl, starterId } = data;
        startSynchronizedTimer(startTime, duration, audioUrl, starterId);
      }
    });
  }).catch(err => {
    console.error("Zoom SDK Initialization Failed:", err);
    document.getElementById("status").textContent = "Error initializing Zoom SDK: " + err.message;
  });
}

// Update button state
function updateButtonState() {
  const button = document.getElementById("timerButton");
  if (isRunning || (audio && !audio.paused)) {
    button.textContent = "Stop Timer";
    button.className = "stop";
  } else {
    button.textContent = "Start Timer";
    button.className = "start";
  }
}

// Attach event listeners
document.getElementById("preset2Min").addEventListener("click", () => setPreset(120));
document.getElementById("preset1Min").addEventListener("click", () => setPreset(60));
document.getElementById("timerButton").addEventListener("click", toggleTimer);

// Initialize Zoom SDK
initializeZoomSdk();

function setPreset(seconds) {
  console.log("Setting preset to", seconds, "seconds");
  document.getElementById("timeInput").value = seconds;
  document.getElementById("status").textContent = `Preset set to ${seconds} seconds`;
}

async function toggleTimer() {
  if (isRunning || (audio && !audio.paused)) {
    stopTimer();
  } else {
    await startTimer();
  }
  updateButtonState();
}

async function startTimer() {
  console.log("Start Timer clicked");
  document.getElementById("status").textContent = "Validating inputs...";
  const timeInput = document.getElementById("timeInput").value;
  const audioUrl = document.getElementById("audioUrl").value;

  if (!timeInput || timeInput <= 0) {
    console.error("Invalid time input:", timeInput);
    document.getElementById("status").textContent = "Please enter a valid time";
    return;
  }
  if (!audioUrl) {
    console.error("No audio URL provided");
    document.getElementById("status").textContent = "Please select a valid audio URL";
    return;
  }

  // Check audio URL validity
  document.getElementById("status").textContent = "Checking audio URL...";
  const isAudioValid = await checkAudioUrl(audioUrl);
  if (!isAudioValid) {
    console.error("Invalid audio URL:", audioUrl);
    document.getElementById("status").textContent = "Error: Invalid or inaccessible audio URL";
    return;
  }

  // Get user ID to identify the starter
  let starterId = null;
  if (typeof zoomSdk !== "undefined") {
    try {
      const userContext = await zoomSdk.callZoomApi("getUserContext");
      starterId = userContext.userId;
    } catch (err) {
      console.error("Error getting user context:", err);
    }
  }

  // Broadcast timer data to all participants
  const startTime = Date.now();
  const duration = parseInt(timeInput);
  if (typeof zoomSdk !== "undefined") {
    try {
      await zoomSdk.callZoomApi("postMessage", {
        payload: JSON.stringify({
          type: "timer_start",
          startTime,
          duration,
          audioUrl,
          starterId
        })
      });
    } catch (err) {
      console.error("Error sending message:", err);
    }
  }

  // Start the timer locally
  startSynchronizedTimer(startTime, duration, audioUrl, starterId);
}

async function startSynchronizedTimer(startTime, duration, audioUrl, starterId) {
  // Stop any existing timer and audio
  stopTimer();

  // Initialize audio
  console.log("Initializing audio with URL:", audioUrl);
  audio = new Audio(audioUrl);
  audio.onerror = () => {
    console.error("Error loading audio URL:", audioUrl);
    document.getElementById("status").textContent = "Error loading audio URL";
    isRunning = false;
    updateButtonState();
  };
  audio.onended = () => {
    console.log("Audio playback ended");
    isRunning = false;
    updateButtonState();
    if (videoFilterInterval) {
      clearInterval(videoFilterInterval);
      if (typeof zoomSdk !== "undefined") {
        zoomSdk.callZoomApi("setVideoFilter", { filter: null }).catch(err => {
          console.error("Error removing video filter:", err);
        });
      }
    }
  };

  // Calculate initial time left based on start time
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  timeLeft = duration - elapsed;
  if (timeLeft <= 0) {
    document.getElementById("status").textContent = "Timer already finished";
    return;
  }

  // Apply video filter if this is the starter
  let isStarter = false;
  if (typeof zoomSdk !== "undefined") {
    try {
      const userContext = await zoomSdk.callZoomApi("getUserContext");
      isStarter = userContext.userId === starterId;
    } catch (err) {
      console.error("Error checking user context:", err);
    }
    if (isStarter) {
      const canvas = document.getElementById("timerCanvas");
      renderTimerOnCanvas(timeLeft);
      try {
        await zoomSdk.callZoomApi("setVideoFilter", {
          filter: canvas.captureStream()
        });
      } catch (err) {
        console.error("Error setting video filter:", err);
        document.getElementById("status").textContent = "Error applying video filter";
      }
    }
  }

  // Set timer
  console.log("Starting synchronized timer with", timeLeft, "seconds");
  document.getElementById("status").textContent = "Timer started";
  isRunning = true;
  updateButtonState();
  updateTimerDisplay();
  timer = setInterval(() => {
    timeLeft--;
    updateTimerDisplay();
    if (isStarter) {
      renderTimerOnCanvas(timeLeft);
    }
    if (timeLeft <= 0) {
      clearInterval(timer);
      document.getElementById("status").textContent = "Timer finished! Playing song...";
      console.log("Timer finished, playing audio");
      audio.play().catch(err => {
        console.error("Error playing audio:", err);
        document.getElementById("status").textContent = "Error playing audio: " + err.message;
        isRunning = false;
        updateButtonState();
      });
      if (isStarter && videoFilterInterval) {
        clearInterval(videoFilterInterval);
        if (typeof zoomSdk !== "undefined") {
          zoomSdk.callZoomApi("setVideoFilter", { filter: null }).catch(err => {
            console.error("Error removing video filter:", err);
          });
        }
      }
      if (typeof zoomSdk !== "undefined") {
        zoomSdk.callZoomApi("notifyAppEvent", {
          event: "timer_finished",
          data: { message: "Timer reached zero and audio played" }
        }).catch(err => {
          console.error("Error notifying Zoom event:", err);
        });
      }
    }
  }, 1000);

  // Update video filter stream
  if (isStarter) {
    videoFilterInterval = setInterval(() => {
      renderTimerOnCanvas(timeLeft);
    }, 1000);
  }
}

function stopTimer() {
  if (timer) {
    clearInterval(timer);
    document.getElementById("status").textContent = "Timer stopped";
    console.log("Timer stopped");
  }
  if (audio) {
    audio.pause();
    audio.currentTime = 0;
    console.log("Audio paused and reset");
  }
  if (videoFilterInterval) {
    clearInterval(videoFilterInterval);
    if (typeof zoomSdk !== "undefined") {
      zoomSdk.callZoomApi("setVideoFilter", { filter: null }).catch(err => {
        console.error("Error removing video filter:", err);
      });
    }
  }
  isRunning = false;
  updateButtonState();
  updateTimerDisplay();
}

function updateTimerDisplay() {
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  document.getElementById("timerDisplay").textContent = 
    `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}
