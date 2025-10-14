/**
 * SharedMind Week 6 – Danmu + Firebase + YouTube
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
import {
  getAuth,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

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
const danmuRef = ref(database, "week6-danmu");
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

// Cache useful DOM nodes for the form and danmu overlay.
const danmuLayer = document.getElementById("danmu-layer");
const danmuForm = document.getElementById("danmu-form");
const danmuInput = document.getElementById("danmu-input");
const loginButton = document.getElementById("login-button");
const logoutButton = document.getElementById("logout-button");
const userNameLabel = document.getElementById("user-name");
const userAvatar = document.getElementById("user-avatar");

if (!danmuLayer || !danmuForm || !danmuInput) {
  throw new Error(
    "Required danmu elements are missing from the DOM. Check index.html for #danmu-layer, #danmu-form, and #danmu-input."
  );
}

const YOUTUBE_VIDEO_ID = "ow2pwBMG89w";
const YOUTUBE_START_SECONDS = 0;
const LANE_COUNT = 10;
const LANE_RELEASE_PADDING = 0.8;

let currentUser = null;

function updateAuthUi() {
  const isSignedIn = Boolean(currentUser);
  const displayName =
    currentUser?.displayName?.trim() || "Anonymous";

  if (loginButton) {
    loginButton.classList.toggle("hidden", isSignedIn);
    loginButton.disabled = isSignedIn;
  }

  if (logoutButton) {
    logoutButton.classList.toggle("hidden", !isSignedIn);
    logoutButton.disabled = !isSignedIn;
  }

  if (userNameLabel) {
    userNameLabel.textContent = displayName;
  }

  if (userAvatar) {
    if (currentUser?.photoURL) {
      userAvatar.src = currentUser.photoURL;
      userAvatar.alt = `${displayName}'s avatar`;
      userAvatar.classList.remove("hidden");
    } else {
      userAvatar.removeAttribute("src");
      userAvatar.alt = "";
      userAvatar.classList.add("hidden");
    }
  }
}

if (loginButton) {
  loginButton.addEventListener("click", async () => {
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Google sign-in failed:", error);
    }
  });
}

if (logoutButton) {
  logoutButton.addEventListener("click", async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Sign-out failed:", error);
    }
  });
}

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  updateAuthUi();
});

updateAuthUi();

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
function createDanmuAvatar(photoURL, displayName) {
  const name = displayName?.trim() || "Anonymous";
  if (photoURL) {
    const img = document.createElement("img");
    img.className = "danmu-avatar";
    img.src = photoURL;
    img.alt = `${name}'s avatar`;
    img.loading = "lazy";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    return img;
  }

  const fallback = document.createElement("span");
  fallback.className = "danmu-avatar danmu-avatar--fallback";
  fallback.textContent = name.charAt(0).toUpperCase() || "A";
  fallback.setAttribute("aria-hidden", "true");
  return fallback;
}

function ensureLane(entry, currentTime, duration) {
  if (
    typeof entry.lane === "number" &&
    entry.lane >= 0 &&
    entry.lane < LANE_COUNT
  ) {
    laneStates[entry.lane] = currentTime + duration + LANE_RELEASE_PADDING;
    return entry.lane;
  }

  for (let i = 0; i < LANE_COUNT; i += 1) {
    if (currentTime >= laneStates[i]) {
      entry.lane = i;
      laneStates[i] = currentTime + duration + LANE_RELEASE_PADDING;
      return i;
    }
  }

  let fallbackLane = 0;
  let earliestRelease = laneStates[0];
  for (let i = 1; i < LANE_COUNT; i += 1) {
    if (laneStates[i] < earliestRelease) {
      earliestRelease = laneStates[i];
      fallbackLane = i;
    }
  }

  entry.lane = fallbackLane;
  laneStates[fallbackLane] = currentTime + duration + LANE_RELEASE_PADDING;
  return fallbackLane;
}

function renderDanmu(entry, currentTime) {
  const { text, timestamp = 0, displayName, photoURL } = entry;
  if (!text) {
    return;
  }

  const name = displayName?.trim() || "Anonymous";

  const danmu = document.createElement("span");
  danmu.className = "danmu";
  danmu.style.visibility = "hidden";

  const avatar = createDanmuAvatar(photoURL, name);
  const content = document.createElement("span");
  content.className = "danmu-content";

  const sender = document.createElement("span");
  sender.className = "danmu-sender";
  sender.textContent = `${name}:`;

  const message = document.createElement("span");
  message.className = "danmu-text";
  message.textContent = text;

  content.append(sender, message);
  danmu.append(avatar, content);
  danmuLayer.appendChild(danmu);

  const viewportWidth = danmuLayer.clientWidth || window.innerWidth || 1920;
  const danmuWidth = danmu.getBoundingClientRect().width || 0;
  const travelDistance = viewportWidth + danmuWidth;
  const pixelsPerSecond = 140;
  const jitter = 0.9 + Math.random() * 0.25;
  const duration = Math.max(8, (travelDistance / pixelsPerSecond) * jitter);

  const laneIndex = ensureLane(entry, currentTime, duration);
  const laneHeight = 100 / LANE_COUNT;
  const laneOffset = laneHeight / 2;
  const verticalPosition = Math.min(
    97,
    Math.max(3, laneIndex * laneHeight + laneOffset)
  );

  danmu.style.top = `${verticalPosition}%`;
  danmu.style.animationDuration = `${duration.toFixed(2)}s`;
  danmu.title = `${name} @ ${timestamp}s`;
  danmu.style.visibility = "visible";

  danmu.addEventListener("animationend", () => {
    danmu.remove();
  });
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
const laneStates = new Array(LANE_COUNT).fill(0);

let schedulerStarted = false;
let schedulerBaselineEstablished = false;
let lastPlaybackTime = 0;

function enqueueDanmuEntry({ key, text, timestamp, y, displayName, photoURL, lane }) {
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
    displayName,
    photoURL,
    lane: Number.isInteger(lane) ? Math.max(0, Math.min(LANE_COUNT - 1, lane)) : undefined,
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
  laneStates.fill(0);
}

function handleSeek(targetTime) {
  clearActiveDanmu();
  const resumeThreshold = Math.max(0, targetTime - SEEK_RESET_PADDING);
  for (const entry of danmuTimeline) {
    entry.rendered = entry.timestamp < resumeThreshold;
    if (!entry.rendered) {
      entry.lane = undefined;
    }
  }
}

function dispatchDueDanmu(currentTime) {
  const playbackThreshold = currentTime + LOOKAHEAD_SECONDS;
  for (const entry of danmuTimeline) {
    if (!entry.rendered && entry.timestamp <= playbackThreshold) {
      renderDanmu(entry, currentTime);
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
    displayName: typeof data?.displayName === "string" ? data.displayName : undefined,
    photoURL: typeof data?.photoURL === "string" ? data.photoURL : undefined,
    lane: Number.isInteger(data?.lane) ? data.lane : undefined,
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

  const authorName = currentUser?.displayName?.trim() || "Anonymous";

  const payload = {
    text,
    timestamp: getCurrentVideoTime(),
    // Store a normalized Y position so each client renders the same vertical lane.
    y: Math.random(),
    createdAt: serverTimestamp(),
    displayName: authorName,
  };

  if (currentUser?.photoURL) {
    payload.photoURL = currentUser.photoURL;
  }

  if (currentUser?.uid) {
    payload.uid = currentUser.uid;
  }

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
