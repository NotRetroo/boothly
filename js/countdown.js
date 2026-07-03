const overlay = document.getElementById("countdownOverlay");
const number = document.getElementById("countdownNumber");

let countdownTimer = null;
let captureTimer = null;

function clearCountdownTimers() {
    clearInterval(countdownTimer);
    clearTimeout(captureTimer);
    countdownTimer = null;
    captureTimer = null;
}

function showCountdown() {
    overlay.classList.remove("hidden");
    overlay.classList.add("flex");
}

function hideCountdown() {
    overlay.classList.remove("flex");
    overlay.classList.add("hidden");
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

        if (typeof captureCurrentFrame === "function") {
            captureCurrentFrame(shotIndex);
        }

        if (typeof onCapture === "function") {
            onCapture();
        }
    }, Math.max(0, captureAt - Date.now()));
}
