const overlay = document.getElementById("countdownOverlay");
const number = document.getElementById("countdownNumber");

let countdownTimer = null;
let captureTimer = null;

function clearCountdownTimers() {
    if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
    }

    if (captureTimer) {
        clearTimeout(captureTimer);
        captureTimer = null;
    }
}

function showCountdown() {
    overlay?.classList.remove("hidden");
}

function hideCountdown() {
    overlay?.classList.add("hidden");
}

function runScheduledCountdown({ shotIndex, captureAt, onCapture }) {
    clearCountdownTimers();
    showCountdown();

    const render = () => {
        const remainingMs = Math.max(0, captureAt - Date.now());
        number.textContent = Math.max(1, Math.ceil(remainingMs / 1000));
    };

    render();
    countdownTimer = setInterval(render, 100);

    captureTimer = setTimeout(() => {
        clearCountdownTimers();
        hideCountdown();

        console.log("[countdown] Timeout fired", { shotIndex });

        try {
            if (typeof captureCurrentFrame === "function") {
                console.log("[countdown] Before captureCurrentFrame");
                captureCurrentFrame(shotIndex);
                console.log("[countdown] After captureCurrentFrame");
            } else {
                console.warn("[countdown] captureCurrentFrame is not defined");
            }

            if (typeof onCapture === "function") {
                console.log("[countdown] Calling onCapture");
                onCapture();
                console.log("[countdown] onCapture finished");
            } else {
                console.warn("[countdown] onCapture is not a function");
            }

            console.log("[countdown] Countdown callback completed");
        } catch (err) {
            console.error("[countdown] Error during capture:", err);
        }
    }, Math.max(0, captureAt - Date.now()));
}