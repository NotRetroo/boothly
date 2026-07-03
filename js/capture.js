const canvases = [
    document.getElementById("myCanvas1"),
    document.getElementById("myCanvas2"),
    document.getElementById("myCanvas3"),
    document.getElementById("myCanvas4")
];

const friendCanvases = [
    document.getElementById("friendCanvas1"),
    document.getElementById("friendCanvas2"),
    document.getElementById("friendCanvas3"),
    document.getElementById("friendCanvas4")
];

function captureCurrentFrame(shotIndex) {
    const frameIndex = typeof shotIndex === "number" ? shotIndex - 1 : currentFrame;

    if (frameIndex < 0 || frameIndex >= videos.length) {
        return;
    }

    const video = videos[frameIndex];
    const canvas = canvases[frameIndex];

    if (!video || !canvas || video.readyState < 2) {
        return;
    }

    const ctx = canvas.getContext("2d");

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    canvas.classList.remove("hidden");
    canvas.style.display = "block";
    canvas.style.zIndex = "20";

    video.style.display = "none";
    placeholders[frameIndex]?.classList.add("hidden");

    captureFriendFrame(frameIndex);

    flash();

    currentFrame = Math.max(currentFrame, frameIndex + 1);

    if (currentFrame < videos.length) {
        videos[currentFrame].style.display = "block";
        showLiveFrame(currentFrame);
    }
}

function captureFriendFrame(frameIndex) {
    const video = friendVideos?.[frameIndex];
    const canvas = friendCanvases[frameIndex];

    if (!video || !canvas || video.readyState < 2) {
        return;
    }

    const ctx = canvas.getContext("2d");

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.classList.remove("hidden");
    canvas.style.display = "block";
    canvas.style.zIndex = "20";

    video.style.display = "none";
    friendPlaceholders?.[frameIndex]?.classList.add("hidden");
}

function flash() {
    const flashElement = document.getElementById("cameraFlash");

    flashElement.style.opacity = "1";

    setTimeout(() => {
        flashElement.style.opacity = "0";
    }, 150);
}
