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
let hasStartedDownloadHandoff = false;

function readSession() {
    const params = new URLSearchParams(window.location.search);

    session.room = params.get("room") || sessionStorage.getItem("boothly:room");
    session.participantId = params.get("participant") || sessionStorage.getItem("boothly:participantId");
    session.token = sessionStorage.getItem("boothly:token");
    session.role = sessionStorage.getItem("boothly:role");
}

function request(event, payload) {
    return new Promise((resolve) => {
        if (payload === undefined) {
            socket.emit(event, resolve);
            return;
        }

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

async function handleRoomState(state) {
    updateState(state);

    if (state.status !== "completed" || hasStartedDownloadHandoff) return;

    hasStartedDownloadHandoff = true;

    if (typeof window.BoothlyDownloader?.storeCapturedImagesAndRedirect === "function") {
        await window.BoothlyDownloader.storeCapturedImagesAndRedirect();
    }
}

async function authenticate() {
    readSession();

    if (!session.room || !session.participantId || !session.token) {
        alert("Your room session is missing. Please create or join a room again.");
        window.location.href = "room.html";
        return;
    }

    console.log("[socket] emit room:authenticate", {
        room: session.room,
        participantId: session.participantId
    });

    const response = await request("room:authenticate", {
        room: session.room,
        participantId: session.participantId,
        token: session.token
    });

    console.log("[socket] ack room:authenticate", response);

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

    console.log("[socket] emit client:camera-ready");

    await request("client:camera-ready");

    if (typeof ensurePeerConnection === "function") {
        await ensurePeerConnection();
    }

    console.log("[socket] emit client:peer-ready");

    await request("client:peer-ready");
}

function emitOffer(description) {
    console.log("[socket] emit signal:offer", { description });

    socket.emit("signal:offer", { description });
}

function emitAnswer(description) {
    console.log("[socket] emit signal:answer", { description });

    socket.emit("signal:answer", { description });
}

function emitIceCandidate(candidate) {
    console.log("[socket] ICE sent signal:ice", { candidate });

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

function markSelected(buttons, selectedButton) {
    buttons.forEach((button) => {
        button.classList.remove("border-2", "border-blue-500", "bg-blue-50");
        button.classList.add("border");
    });

    selectedButton.classList.add("border-2", "border-blue-500", "bg-blue-50");
}

function bindSettingGroup(options, settingName, valueMapper) {
    const buttons = options
        .map((option) => document.getElementById(option.id))
        .filter(Boolean);

    options.forEach((option) => {
        const button = document.getElementById(option.id);

        if (!button) return;

        button.addEventListener("click", async () => {
            markSelected(buttons, button);

            if (!session.authenticated || session.role !== "host") return;

            const response = await request("session:update-settings", {
                settings: {
                    [settingName]: valueMapper(option.value)
                }
            });

            if (!response?.ok) {
                alert(response?.error || "Could not update settings.");
            }
        });
    });
}

function bindSettingsControls() {
    bindSettingGroup([
        { id: "themeMinimal", value: "minimal" },
        { id: "themePastel", value: "pastel" },
        { id: "themeVintage", value: "vintage" },
        { id: "themeDark", value: "dark" }
    ], "theme", String);

    bindSettingGroup([
        { id: "filterNormal", value: "normal" },
        { id: "filterBW", value: "bw" },
        { id: "filterSepia", value: "sepia" },
        { id: "filterVintage", value: "vintage" }
    ], "filter", String);

    bindSettingGroup([
        { id: "photos2", value: 2 },
        { id: "photos4", value: 4 },
        { id: "photos6", value: 6 },
        { id: "photos8", value: 8 }
    ], "photoCount", Number);

    bindSettingGroup([
        { id: "count3", value: 3000 },
        { id: "count5", value: 5000 },
        { id: "count10", value: 10000 }
    ], "countdownMs", Number);
}

socket.on("connect", authenticate);

socket.on("room:state", handleRoomState);

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
    console.log("[socket] received signal:begin", { role });

    await beginSignaling({
        shouldOffer: role === "host"
    });
});

socket.on("signal:offer", async ({ description }) => {
    console.log("[socket] received signal:offer", { description });

    await handleRemoteOffer(description);
});

socket.on("signal:answer", async ({ description }) => {
    console.log("[socket] received signal:answer", { description });

    await handleRemoteAnswer(description);
});

socket.on("signal:ice", async ({ candidate }) => {
    console.log("[socket] ICE received signal:ice", { candidate });

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

bindSettingsControls();
