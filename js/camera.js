// ======================================
// Boothly Camera
// ======================================

const videos = [
    document.getElementById("myVideo1"),
    document.getElementById("myVideo2"),
    document.getElementById("myVideo3"),
    document.getElementById("myVideo4")
];

const placeholders = [
    document.getElementById("myPlaceholder1"),
    document.getElementById("myPlaceholder2"),
    document.getElementById("myPlaceholder3"),
    document.getElementById("myPlaceholder4")
];

let localStream = null;
let currentFrame = 0;
let cameraReady = false;

// ======================================
// Start Camera
// ======================================

async function startCamera() {

    try {

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {

            alert("Camera not supported in this browser.");

            return;

        }

        localStream = await navigator.mediaDevices.getUserMedia({

            video: {

                width: 1280,
                height: 720,
                facingMode: "user"

            },

            audio: false

        });

        cameraReady = true;

        showLiveFrame(0);

        console.log("✅ Camera Started");

        // Notify the rest of the app that the camera is ready
        window.dispatchEvent(new Event("camera-ready"));

    }

    catch (err) {

        console.error(err);

        alert(err.message);

    }

}

// ======================================
// Show Live Camera
// ======================================

function showLiveFrame(index) {

    videos.forEach(video => {

        video.classList.add("hidden");

    });

    placeholders.forEach(p => {

        p.classList.remove("hidden");

    });

    const currentVideo = videos[index];

    currentVideo.srcObject = localStream;

    currentVideo.classList.remove("hidden");

    currentVideo.style.transform = "scaleX(-1)";

    currentVideo.play();

    placeholders[index].classList.add("hidden");

}

// ======================================
// Wait Until Camera Starts
// ======================================

function waitForCamera() {

    return new Promise(resolve => {

        if (cameraReady) {

            resolve();

            return;

        }

        window.addEventListener("camera-ready", () => {

            resolve();

        }, { once: true });

    });

}

// ======================================

window.addEventListener("DOMContentLoaded", startCamera);