let timer;
let timeLeft;
let audio;

// Initialize Zoom Apps SDK
zoomSdk.config({
  capabilities: [
    "notifyAppEvent"
  ]
}).then(() => {
  console.log("Zoom SDK Initialized Successfully");
}).catch(err => {
  console.error("Zoom SDK Initialization Failed:", err);
  document.getElementById("status").textContent = "Error initializing Zoom SDK: " + err.message;
});

function setPreset(seconds) {
  console.log("Setting preset to", seconds, "seconds");
  document.getElementById("timeInput").value = seconds;
}

function startTimer() {
  console.log("Start Timer clicked");
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
      // Notify Zoom app event
      zoomSdk.callZoomApi("notifyAppEvent", {
        event: "timer_finished",
        data: { message: "Timer reached zero and audio played" }
      }).catch(err => {
        console.error("Error notifying Zoom event:", err);
      });
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
