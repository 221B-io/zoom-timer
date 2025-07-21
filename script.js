console.log("script.js loaded");

// Initialize variables
let timer;
let timeLeft;
let audio;

// Update status on page load
document.getElementById("status").textContent = "App loaded, waiting for Zoom SDK...";

// Function to initialize Zoom SDK with retry
function initializeZoomSdk(attempts = 5, delay = 1000) {
  if (typeof zoomSdk === "undefined") {
    if (attempts > 0) {
      console.warn(`Zoom SDK not available, retrying (${attempts} attempts left)...`);
      setTimeout(() => initializeZoomSdk(attempts - 1, delay), delay);
    } else {
      console.error("Zoom SDK not available after retries");
      document.getElementById("status").textContent = "Error: Zoom SDK not available. Are you running this in Zoom?";
    }
    return;
  }

  zoomSdk.config({
    capabilities: ["notifyAppEvent"]
  }).then(() => {
    console.log("Zoom SDK Initialized Successfully");
    document.getElementById("status").textContent = "Ready to start timer";
  }).catch(err => {
    console.error("Zoom SDK Initialization Failed:", err);
    document.getElementById("status").textContent = "Error initializing Zoom SDK: " + err.message;
  });
}

// Attach event listeners
document.getElementById("preset2Min").addEventListener("click", () => setPreset(120));
document.getElementById("preset1Min").addEventListener("click", () => setPreset(60));
document.getElementById("startTimer").addEventListener("click", startTimer);
document.getElementById("stopTimer").addEventListener("click", stopTimer);

// Initialize Zoom SDK with retry
initializeZoomSdk();

function setPreset(seconds) {
  console.log("Setting preset to", seconds, "seconds");
  document.getElementById("timeInput").value = seconds;
  document.getElementById("status").textContent = `Preset set to ${seconds} seconds`;
}

function startTimer() {
  console.log("Start Timer clicked");
  document.getElementById("status").textContent = "Starting timer...";
  const timeInput = document.getElementById("timeInput").value;
  const audioUrl = document.getElementById("audioUrl").value;

  if (!timeInput || timeInput <= 0) {
    console.error("Invalid time input:", timeInput);
    document.getElementById("status").textContent = "Please enter a valid time";
    return;
  }
  if (!audioUrl) {
    console.error("No audio URL provided");
    document.getElementById("status").textContent = "Please enter a valid audio URL";
    return;
  }

  // Stop any existing timer and audio
  stopTimer();

  // Initialize audio
  console.log("Initializing audio with URL:", audioUrl);
  audio = new Audio(audioUrl);
  audio.onerror = () => {
    console.error("Error loading audio URL:", audioUrl);
    document.getElementById("status").textContent = "Error loading audio URL";
  };

  // Set timer
  timeLeft = parseInt(timeInput);
  console.log("Starting timer with", timeLeft, "seconds");
  updateTimerDisplay();
  timer = setInterval(() => {
    timeLeft--;
    updateTimerDisplay();
    if (timeLeft <= 0) {
      clearInterval(timer);
      document.getElementById("status").textContent = "Timer finished! Playing song...";
      console.log("Timer finished, playing audio");
      audio.play().catch(err => {
        console.error("Error playing audio:", err);
        document.getElementById("status").textContent = "Error playing audio: " + err.message;
      });
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
  updateTimerDisplay();
}

function updateTimerDisplay() {
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  document.getElementById("timerDisplay").textContent = 
    `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}
