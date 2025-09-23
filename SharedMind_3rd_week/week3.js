
let canvas;
let imageInputElement;
let uploadedImageElement;
let generatedImageElement;
let imagePreviewContainer;
let uploadedImageDataUrl = null;

init();

function init() {
    initInterface();
}

function initInterface() {
    canvas = document.getElementById('backgroundCanvas');
    imagePreviewContainer = document.getElementById('imagePreviewContainer');
    imageInputElement = document.getElementById('imageInput');
    uploadedImageElement = document.getElementById('uploadedReferenceImage');
    generatedImageElement = document.getElementById('generatedCharacterImage');

    if (!canvas || !imagePreviewContainer || !imageInputElement || !uploadedImageElement || !generatedImageElement) {
        console.error('Required interface elements are missing from the HTML layout.');
        return;
    }

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    imageInputElement.addEventListener('change', handleImageSelection);
}

function resizeCanvas() {
    if (!canvas) {
        return;
    }
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

function handleImageSelection(event) {
    const input = event.target;
    const file = input.files && input.files[0];
    if (!file) {
        return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
        const result = reader.result;
        if (typeof result !== 'string') {
            return;
        }
        uploadedImageDataUrl = result;
        showUploadedImage(result);
        input.value = '';
        await generateCharacterFromImage();
    };
    reader.readAsDataURL(file);
}

async function generateCharacterFromImage() {
    if (!uploadedImageDataUrl) {
        return;
    }

    const url = "https://itp-ima-replicate-proxy.web.app/api/create_n_get";
    //Get Auth Token from: https://itp-ima-replicate-proxy.web.app/
    let authToken = "";

    const prompt = `Create a brand-new Chinese character in the style of traditional Kaishu (regular script Chinese calligraphy).

Rules:
- The character must NOT be made of existing Chinese radicals, but must be entirely invented.  
- Its form should be a pictographic abstraction of the uploaded image, capturing its **essence, shapes, or dynamics** rather than literally drawing the objects.  
- Construct it only with standard Chinese character strokes: dots, horizontals, verticals, diagonals, hooks, and turns.  
- The overall structure must look like a **plausible Chinese character**, square in proportion, balanced, and aesthetically consistent with traditional Kaishu calligraphy.  
- Stroke count should be moderate.  
- Output must be **pure black ink strokes on a plain white background**, with visible brush-style variation in stroke width.  

The result should look like a completely new Chinese character, inspired abstractly by the uploaded image, as if it were written by a calligrapher in Kaishu style.`;

    document.body.style.cursor = 'progress';
    const imageInput = uploadedImageDataUrl.startsWith('data:')
        ? uploadedImageDataUrl
        : `data:image/png;base64,${uploadedImageDataUrl}`;

    const data = {
        model: "google/nano-banana",
        input: {
            prompt: prompt,
            image_input: [imageInput],
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
    const json_response = await raw_response.json();
    console.log("json_response", json_response);
    document.body.style.cursor = 'auto';

    const outputs = json_response && json_response.output;
    let imageOutput = null;
    if (Array.isArray(outputs)) {
        imageOutput = outputs[0];
    } else if (typeof outputs === 'string') {
        imageOutput = outputs;
    }

    if (typeof imageOutput === 'string' && imageOutput.length > 0) {
        displayGeneratedImage(imageOutput);
    } else {
        console.error('No usable image output', outputs);
    }
}

function displayGeneratedImage(imageSource) {
    if (!generatedImageElement) {
        return;
    }
    if (imageSource.startsWith('data:') || imageSource.startsWith('http')) {
        generatedImageElement.src = imageSource;
    } else {
        generatedImageElement.src = `data:image/png;base64,${imageSource}`;
    }
    generatedImageElement.classList.add('is-visible');
}

function showUploadedImage(imageSource) {
    if (!uploadedImageElement) {
        return;
    }
    uploadedImageElement.src = imageSource;
    uploadedImageElement.classList.add('is-visible');
}
