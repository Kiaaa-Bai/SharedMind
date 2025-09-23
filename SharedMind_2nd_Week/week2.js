
let inputLocationX = window.innerWidth / 2;
let inputLocationY = window.innerHeight / 2;
let inputBoxDirectionX = 1;
let inputBoxDirectionY = 1;

let canvas;
let inputBox;
let wordsContainer;
let overlay;
let generationCount = 0;
let overlayShown = false;
const overlayThreshold = 12;
const collisionPadding = 24;
const edgeMargin = 40;


init();

function init() {

    // Perform initialization logic here
    initInterface();
}

function drawWord(response, location, parentWord = null) {
    const wordElement = document.createElement('span');
    wordElement.className = 'generated-word';
    wordElement.textContent = response;
    const placement = findAvailablePosition(location, response);
    wordElement.style.left = `${placement.x}px`;
    wordElement.style.top = `${placement.y}px`;
    wordElement.dataset.triggered = 'false';
    wordElement.addEventListener('mouseenter', (event) => {
        const hoveredWord = event.currentTarget;
        if (hoveredWord.dataset.triggered === 'true') {
            return;
        }
        hoveredWord.dataset.triggered = 'true';
        const rect = hoveredWord.getBoundingClientRect();
        const center = {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
        };
        const wordText = hoveredWord.textContent;
        askWord(wordText, center, hoveredWord);
    });
    wordsContainer.appendChild(wordElement);
    wordsContainer.style.pointerEvents = 'auto';
    if (parentWord) {
        requestAnimationFrame(() => createArrow(parentWord, wordElement));
    }
    checkOverlay();
    return wordElement;
}


async function askWord(word, location, parentElement = null) {
    const url = "https://itp-ima-replicate-proxy.web.app/api/create_n_get";
    //Get Auth Token from: https://itp-ima-replicate-proxy.web.app/
    let authToken = ""
    generationCount += 1;
    let prompt = buildPrompt(word);
    document.body.style.cursor = "progress";
    const data = {
        model: "openai/gpt-5",
        input: {
            prompt: prompt,
        },
    };
    console.log("Making a Fetch Request", data);
    const options = {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: 'application/json',
            'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify(data),
    };
    const raw_response = await fetch(url, options);
    //turn it into json
    const json_response = await raw_response.json();
    console.log("json_response", json_response);
    document.body.style.cursor = "auto";
    let parsedResponse;
    try {
        parsedResponse = JSON.parse(json_response.output.join(""));
    } catch (error) {
        console.error('Failed to parse response', error, json_response.output);
        document.body.style.cursor = "auto";
        return;
    }
    if (!Array.isArray(parsedResponse)) {
        console.error('Unexpected response shape', parsedResponse);
        document.body.style.cursor = "auto";
        return;
    }
    let responseCount = parsedResponse.length;
    for (let i = 0; i < responseCount; i++) {
        let textResponse = parsedResponse[i];
        if (typeof textResponse !== 'string') {
            continue;
        }
        const spawnLocation = jitterLocation(location, i, responseCount);
        drawWord(textResponse.trim(), spawnLocation, parentElement);
    }
    inputBoxDirectionX = 1;
    inputBoxDirectionY = 1;
}

function buildPrompt(word) {
    const stages = [
        "Slightly lean toward anxiety.",
        "Introduce faint echoes of death.",
        "Allow chaos to ripple beneath the surface.",
        "Make consciousness and self-awareness unavoidable.",
        "Let the tone feel tense, fragile, and introspective.",
        "Avoid uncommon word."
    ];
    const appliedStages = stages.slice(0, Math.min(stages.length, Math.ceil(generationCount / 2)));
    const themeDirective = appliedStages.join(' ');
    return `a json list of 2 single evocative words related to ${word}. ${themeDirective} respond only with a JSON array of two lowercase word strings`;
}

function jitterLocation(location, index, total) {
    const baseAngle = Math.random() * Math.PI * 2;
    const angle = baseAngle + (index / Math.max(total, 1)) * Math.PI / 2;
    const radius = 80 + Math.random() * 60;
    let x = location.x + Math.cos(angle) * radius;
    let y = location.y + Math.sin(angle) * radius;
    return clampToViewport({ x, y });
}

function createArrow(parentWord, childWord) {
    const parentRect = parentWord.getBoundingClientRect();
    const childRect = childWord.getBoundingClientRect();
    const containerRect = wordsContainer.getBoundingClientRect();
    const startX = parentRect.left + parentRect.width / 2 - containerRect.left;
    const startY = parentRect.top + parentRect.height / 2 - containerRect.top;
    const endX = childRect.left + childRect.width / 2 - containerRect.left;
    const endY = childRect.top + childRect.height / 2 - containerRect.top;
    const length = Math.hypot(endX - startX, endY - startY);
    const angle = Math.atan2(endY - startY, endX - startX) * 180 / Math.PI;
    const arrow = document.createElement('div');
    arrow.className = 'word-arrow';
    arrow.style.width = `${length}px`;
    arrow.style.left = `${startX}px`;
    arrow.style.top = `${startY}px`;
    arrow.style.transform = `translateY(-50%) rotate(${angle}deg)`;
    wordsContainer.appendChild(arrow);
}

function findAvailablePosition(initialLocation, text) {
    const existingRects = Array.from(wordsContainer.querySelectorAll('.generated-word'))
        .map(word => word.getBoundingClientRect());
    const wordSize = measureWordDimensions(text);
    let attempt = 0;
    const maxAttempts = 60;
    let candidate = clampToViewport(initialLocation);
    while (attempt < maxAttempts) {
        if (!isOverlapping(candidate, wordSize, existingRects)) {
            return candidate;
        }
        const angle = Math.random() * Math.PI * 2 + attempt * 0.6;
        const radius = 60 + attempt * 16;
        candidate = clampToViewport({
            x: initialLocation.x + Math.cos(angle) * radius,
            y: initialLocation.y + Math.sin(angle) * radius,
        });
        attempt += 1;
    }
    return candidate;
}

function clampToViewport(point) {
    return {
        x: Math.max(edgeMargin, Math.min(window.innerWidth - edgeMargin, point.x)),
        y: Math.max(edgeMargin, Math.min(window.innerHeight - edgeMargin, point.y)),
    };
}

function isOverlapping(candidate, size, rects) {
    if (rects.length === 0) {
        return false;
    }
    const halfWidth = size.width / 2 + collisionPadding;
    const halfHeight = size.height / 2 + collisionPadding;
    const candidateRect = {
        left: candidate.x - halfWidth,
        right: candidate.x + halfWidth,
        top: candidate.y - halfHeight,
        bottom: candidate.y + halfHeight,
    };
    return rects.some(rect => {
        const expanded = {
            left: rect.left - collisionPadding,
            right: rect.right + collisionPadding,
            top: rect.top - collisionPadding,
            bottom: rect.bottom + collisionPadding,
        };
        const separated = candidateRect.right < expanded.left ||
            candidateRect.left > expanded.right ||
            candidateRect.bottom < expanded.top ||
            candidateRect.top > expanded.bottom;
        return !separated;
    });
}

function measureWordDimensions(text) {
    const measureSpan = document.createElement('span');
    measureSpan.className = 'generated-word measuring';
    measureSpan.textContent = text;
    measureSpan.style.visibility = 'hidden';
    measureSpan.style.left = '0px';
    measureSpan.style.top = '0px';
    measureSpan.style.transform = 'none';
    wordsContainer.appendChild(measureSpan);
    const rect = measureSpan.getBoundingClientRect();
    wordsContainer.removeChild(measureSpan);
    return { width: rect.width || 60, height: rect.height || 28 };
}

function checkOverlay() {
    if (overlayShown) {
        return;
    }
    const wordCount = wordsContainer.querySelectorAll('.generated-word').length;
    if (wordCount >= overlayThreshold) {
        overlayShown = true;
        overlay.style.opacity = '1';
    }
}

function initInterface() {
    // Get the input box and the canvas element
    canvas = document.createElement('canvas');
    canvas.setAttribute('id', 'myCanvas');
    canvas.className = 'background-canvas';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    console.log('canvas', canvas.width, canvas.height);

    wordsContainer = document.createElement('div');
    wordsContainer.setAttribute('id', 'wordsContainer');
    wordsContainer.className = 'words-container';
    document.body.appendChild(wordsContainer);

    overlay = document.createElement('div');
    overlay.setAttribute('id', 'thoughtOverlay');
    overlay.className = 'thought-overlay';
    overlay.textContent = 'Thoughts think themselves.';
    document.body.appendChild(overlay);

    inputBox = document.createElement('input');
    inputBox.setAttribute('type', 'text');
    inputBox.setAttribute('id', 'inputBox');
    inputBox.setAttribute('placeholder', 'words in your mind');
    inputBox.className = 'floating-input';
    document.body.appendChild(inputBox);
    inputBox.setAttribute('autocomplete', 'off');

    // Add event listener to the input box
    inputBox.addEventListener('keydown', function (event) {
        // Check if the Enter key is pressed

        if (event.key === 'Enter') {
            const inputValue = inputBox.value;
            if (!inputValue.trim()) {
                return;
            }
            const rect = inputBox.getBoundingClientRect();
            const center = {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2,
            };
            inputBox.value = '';
            drawWord(inputValue.trim(), center);
            inputBox.blur();
            inputBox.style.display = 'none';
            wordsContainer.style.pointerEvents = 'auto';

        }
    });

    // Add event listener to the document for mouse down event
    document.addEventListener('mousedown', (event) => {
        // Set the location of the input box to the mouse location
        inputLocationX = event.clientX;
        inputLocationY = event.clientY;
        inputBoxDirectionX = 0;
        inputBoxDirectionY = 0;
    });
}
