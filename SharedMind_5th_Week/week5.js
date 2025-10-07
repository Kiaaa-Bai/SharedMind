/**
 * SharedMind Week 5 – Danmu + Firebase + YouTube
 *
 * This module wires the page up to Firebase Realtime Database and the YouTube IFrame API.
 * - Every submitted comment is stored in Firebase with its text, the video's current timestamp,
 *   and the randomly chosen Y position used to render the floating danmu.
 * - onChildAdded keeps all connected clients synchronized by streaming comments through a timeline.
 * - Comments are scheduled to appear in sync with the video's playback using simple CSS keyframes.
 *
 * Replace firebaseConfig with your own project credentials before deploying.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase,
  ref,
  push,
  onChildAdded,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

/**
 * Firebase project configuration.
 * swap the placeholder values with the credentials for your Firebase project.
 * These keys are safe to expose on the client when using Firebase-hosted front-ends.
 */
const firebaseConfig = {
  apiKey: "AIzaSyC9gdfy4tQ4c7hpqFechbQ2dQfbGELrzI4",
  authDomain: "sharedmind-92aa5.firebaseapp.com",
  databaseURL: "https://sharedmind-92aa5-default-rtdb.firebaseio.com/",
  projectId: "sharedmind-92aa5",
  storageBucket: "sharedmind-92aa5.firebasestorage.app",
  messagingSenderId: "607006971395",
  appId: "1:607006971395:web:2f73e1e47ae40ec4916036",
};

// Initialize Firebase exactly once at module load and grab a reference to the danmu list path.
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const danmuRef = ref(database, "week5-danmu");

// Cache useful DOM nodes for the form and danmu overlay.
const danmuLayer = document.getElementById("danmu-layer");
const danmuForm = document.getElementById("danmu-form");
const danmuInput = document.getElementById("danmu-input");

if (!danmuLayer || !danmuForm || !danmuInput) {
  throw new Error(
    "Required danmu elements are missing from the DOM. Check index.html for #danmu-layer, #danmu-form, and #danmu-input."
  );
}

const YOUTUBE_VIDEO_ID = "CUJPF3Hh1WI";
const YOUTUBE_START_SECONDS = 17;

// Track the YouTube player instance and whether it is ready to report timestamps.
let player = null;
let playerReady = false;

/**
 * Instantiate the YouTube player if the API is ready.
 * Wrapped in a guard so late calls (e.g., Firebase errors) do not create duplicates.
 */
function createYouTubePlayer() {
  if (player || !window.YT || typeof window.YT.Player !== "function") {
    return;
  }

  player = new YT.Player("player", {
    videoId: YOUTUBE_VIDEO_ID,
    playerVars: {
      autoplay: 1,
      playsinline: 1,
      rel: 0,
      modestbranding: 1,
      start: YOUTUBE_START_SECONDS,
    },
    events: {
      onReady: handlePlayerReady,
    },
  });
}

/**
 * The iframe API calls window.onYouTubeIframeAPIReady once it is loaded.
 * We also guard against the case where the API loads before this module, in which
 * case we create the player immediately.
 */
const priorReadyHook = window.onYouTubeIframeAPIReady;
window.onYouTubeIframeAPIReady = () => {
  if (typeof priorReadyHook === "function") {
    try {
      priorReadyHook();
    } catch (error) {
      console.error("Previous onYouTubeIframeAPIReady hook threw:", error);
    }
  }
  createYouTubePlayer();
};

// If the API is already available (e.g., cached), spin up the player right away.
if (window.YT && typeof window.YT.Player === "function") {
  createYouTubePlayer();
}

/**
 * Mark the player as ready and attempt to start playback right away.
 * Browsers may still block autoplay with sound; the catch clause helps during debugging.
 */
function handlePlayerReady(event) {
  playerReady = true;
  try {
    const iframe = typeof event.target.getIframe === "function" ? event.target.getIframe() : null;
    if (iframe) {
      const existingAllow = iframe.getAttribute("allow") || "";
      const tokens = existingAllow
        .split(";")
        .map((token) => token.trim())
        .filter(Boolean);
      ["autoplay", "encrypted-media", "fullscreen"].forEach((perm) => {
        if (!tokens.includes(perm)) {
          tokens.push(perm);
        }
      });
      iframe.setAttribute("allow", tokens.join("; "));
    }
    event.target.seekTo(YOUTUBE_START_SECONDS, true);
    event.target.unMute();
    event.target.setVolume(100);
    event.target.playVideo();
  } catch (error) {
    // Autoplay can be blocked; failure is non-fatal so we simply log it for debugging.
    console.info("Autoplay was blocked by the browser:", error);
  }
}

/**
 * Helper that returns the current timestamp (in seconds) of the YouTube video.
 * Falls back to zero if the player is not ready yet.
 */
function getCurrentVideoTime() {
  if (!playerReady || !player || typeof player.getCurrentTime !== "function") {
    return 0;
  }
  const timeInSeconds = Number(player.getCurrentTime() || 0);
  return Number(timeInSeconds.toFixed(2)); // store with two decimal precision.
}

/**
 * Render a danmu comment on the overlay, animating it from right to left.
 * The same payload is reused for local submissions and remote updates.
 */
function renderDanmu({ text, y = Math.random(), timestamp = 0 }) {
  if (!text) {
    return;
  }

  // Clamp Y to the [0, 1] range in case malformed data sneaks in.
  const clampedY = Math.min(Math.max(y, 0), 1);

  const danmu = document.createElement("span");
  danmu.className = "danmu";
  danmu.textContent = text;

  // Position the comment along the vertical axis using percentage-based layout.
  const verticalPosition = 5 + clampedY * 20;
  danmu.style.top = `${verticalPosition}%`;

  // Vary animation speed slightly so the overlay feels more organic.
  const duration = 9 + Math.random() * 5;
  danmu.style.animationDuration = `${duration}s`;

  // Store context on the element for debugging (hover to see the timestamp).
  danmu.title = `Timestamp: ${timestamp}s`;

  // Remove the element once the animation finishes to avoid DOM bloat.
  danmu.addEventListener("animationend", () => {
    danmu.remove();
  });

  danmuLayer.appendChild(danmu);
}

/**
 * Danmu scheduling state
 * ----------------------
 * Incoming comments are queued and only rendered once the YouTube playback time reaches
 * their recorded timestamp. This keeps historic comments aligned with the original moment
 * they were sent while still updating in real time for new submissions.
 */
const danmuTimeline = [];
const danmuByKey = new Map();
const LOOKAHEAD_SECONDS = 0.35; // render slightly ahead to hide scheduling jitter.
const SEEK_THRESHOLD_SECONDS = 1.5; // detect jumps in the scrubber.
const SEEK_RESET_PADDING = 0.5; // comments newer than (time - padding) are replayed after a seek.

let schedulerStarted = false;
let schedulerBaselineEstablished = false;
let lastPlaybackTime = 0;

function enqueueDanmuEntry({ key, text, timestamp, y }) {
  if (!text) {
    return;
  }

  const entryKey = key || `local-${Date.now()}-${Math.random()}`;
  if (danmuByKey.has(entryKey)) {
    return;
  }

  const rawTimestamp = Number(timestamp);
  const normalizedTimestamp = Number.isFinite(rawTimestamp)
    ? Number(rawTimestamp.toFixed(2))
    : 0;

  const normalizedY =
    typeof y === "number" && Number.isFinite(y) ? y : Math.random();

  const entry = {
    key: entryKey,
    text,
    timestamp: normalizedTimestamp,
    y: normalizedY,
    rendered: false,
  };

  danmuByKey.set(entryKey, entry);
  danmuTimeline.push(entry);
  danmuTimeline.sort((a, b) => a.timestamp - b.timestamp);
}

function clearActiveDanmu() {
  while (danmuLayer.firstChild) {
    danmuLayer.removeChild(danmuLayer.firstChild);
  }
}

function handleSeek(targetTime) {
  clearActiveDanmu();
  const resumeThreshold = Math.max(0, targetTime - SEEK_RESET_PADDING);
  for (const entry of danmuTimeline) {
    entry.rendered = entry.timestamp < resumeThreshold;
  }
}

function dispatchDueDanmu(currentTime) {
  const playbackThreshold = currentTime + LOOKAHEAD_SECONDS;
  for (const entry of danmuTimeline) {
    if (!entry.rendered && entry.timestamp <= playbackThreshold) {
      renderDanmu(entry);
      entry.rendered = true;
    }
  }
}

function startDanmuScheduler() {
  if (schedulerStarted) {
    return;
  }
  schedulerStarted = true;

  const step = () => {
    requestAnimationFrame(step);
    if (!playerReady) {
      return;
    }
    const currentTime = getCurrentVideoTime();
    if (!Number.isFinite(currentTime)) {
      return;
    }

    if (!schedulerBaselineEstablished) {
      handleSeek(currentTime);
      lastPlaybackTime = currentTime;
      schedulerBaselineEstablished = true;
    } else if (Math.abs(currentTime - lastPlaybackTime) > SEEK_THRESHOLD_SECONDS) {
      handleSeek(currentTime);
    }

    dispatchDueDanmu(currentTime);
    lastPlaybackTime = currentTime;
  };

  requestAnimationFrame(step);
}

/**
 * Listen for new comments in Firebase.
 * onChildAdded emits existing records first, then streams new comments as they arrive.
 */
onChildAdded(danmuRef, (snapshot) => {
  const data = snapshot.val();
  enqueueDanmuEntry({
    key: snapshot.key,
    text: data?.text,
    y: typeof data?.y === "number" ? data.y : Math.random(),
    timestamp: typeof data?.timestamp === "number" ? data.timestamp : 0,
  });
  startDanmuScheduler();
});

/**
 * Submit handler:
 *  - prevent the default form POST
 *  - gather input + the current video timestamp
 *  - push the comment to Firebase so every client receives it
 */
danmuForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const text = danmuInput.value.trim();
  if (!text) {
    return;
  }

  const payload = {
    text,
    timestamp: getCurrentVideoTime(),
    // Store a normalized Y position so each client renders the same vertical lane.
    y: Math.random(),
    createdAt: serverTimestamp(),
  };

  try {
    await push(danmuRef, payload);
  } catch (error) {
    console.error("Failed to send danmu to Firebase:", error);
    enqueueDanmuEntry({
      key: `local-fallback-${Date.now()}`,
      ...payload,
    });
  } finally {
    danmuInput.value = "";
    danmuInput.focus();
  }
});

// Give keyboard users a helpful starting point.
setTimeout(() => danmuInput.focus(), 0);

// Kick the scheduler in case comments are loaded before the player is ready.
startDanmuScheduler();
