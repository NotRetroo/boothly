const socket = io();

const session = {
    room: null,
    participantId: null,
    token: null,
    role: null,
    state: null,
    authenticated: false
};

const startSessionButton = document.getElementById("startSession");

function readSession() {
    const params = new URLSearchParams(window.location.search);

    session.room = params.get("room") || sessionStorage.getItem("boothly:room");
    session.participantId = params.get("participant") || sessionStorage.getItem("boothly:participantId");
    session.token = sessionStorage.getItem("boothly:token");
    session.role = sessionStorage.getItem("boothly:role");
}

function request(event, payload) {
    return new Promise((resolve) => {
        socket.emit(event, payload, resolve);
    });
}

function setStartEnabled(enabled) {
    if (!startSessionButton) return;

    startSessionButton.disabled = !enabled;
    startSessionButton.classList.toggle("opacity-50", !enabled);
    startSessionButton.classList.toggle("cursor-not-allowed", !enabled);
}

function updateState(state) {
    session.state = state;

    const isHost = session.role === "host";
    const canStart = isHost && (state.status === "ready" || state.status === "completed");

    setStartEnabled(canStart);
}

async function authenticate() {
    readSession();

    if (!session.room || !session.participantId || !session.token) {
        alert("Your room session is missing. Please create or join a room again.");
        window.location.href = "room.html";
        return;
    }

    const response = await request("room:authenticate", {
        room: session.room,
        participantId: session.participantId,
        token: session.token
    });

    if (!response?.ok) {
        alert(response?.error || "Could not reconnect to the room.");
        window.location.href = "room.html";
        return;
    }

    session.authenticated = true;
    session.role = response.role;
    sessionStorage.setItem("boothly:role", response.role);
    updateState(response.state);

    if (typeof waitForCamera === "function") {
        await waitForCamera();
    }

    await request("client:camera-ready");

    if (typeof ensurePeerConnection === "function") {
        await ensurePeerConnection();
    }

    await request("client:peer-ready");
}

function emitOffer(description) {
    socket.emit("signal:offer", { description });
}

function emitAnswer(description) {
    socket.emit("signal:answer", { description });
}

function emitIceCandidate(candidate) {
    socket.emit("signal:ice", { candidate });
}

async function requestStartSession() {
    if (!session.authenticated) return;

    setStartEnabled(false);

    const response = await request("session:start");

    if (!response?.ok) {
        alert(response?.error || "Could not start the session.");
        setStartEnabled(session.role === "host" && session.state?.status === "ready");
    }
}

socket.on("connect", authenticate);

socket.on("room:state", updateState);

socket.on("room:expired", () => {
    alert("This room has expired.");
    window.location.href = "room.html";
});

socket.on("session:replaced", () => {
    alert("This session was opened in another tab.");
    window.location.href = "room.html";
});

socket.on("partner:left", () => {
    setStartEnabled(false);
});

socket.on("signal:begin", async ({ role }) => {
    await beginSignaling({
        shouldOffer: role === "host"
    });
});

socket.on("signal:offer", async ({ description }) => {
    await handleRemoteOffer(description);
});

socket.on("signal:answer", async ({ description }) => {
    await handleRemoteAnswer(description);
});

socket.on("signal:ice", async ({ candidate }) => {
    await handleRemoteIceCandidate(candidate);
});

socket.on("session:countdown", ({ shotIndex, captureAt }) => {
    if (typeof runScheduledCountdown === "function") {
        runScheduledCountdown({
            shotIndex,
            captureAt,
            onCapture: () => {
                socket.emit("session:capture-ack", { shotIndex });
            }
        });
    }
});

if (startSessionButton) {
    setStartEnabled(false);
    startSessionButton.addEventListener("click", requestStartSession);
}
