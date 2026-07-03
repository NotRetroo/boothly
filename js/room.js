const roomSocket = io();

const createBtn = document.getElementById("createBtn");
const joinBtn = document.getElementById("joinBtn");
const statusPanel = document.getElementById("status");
const generatedCode = document.getElementById("generatedCode");
const waitingRoom = document.getElementById("waitingRoom");
const waitingCode = document.getElementById("waitingCode");
const waitingMessage = document.getElementById("waitingMessage");
const copyCodeBtn = document.getElementById("copyCodeBtn");
const shareRoomBtn = document.getElementById("shareRoomBtn");
const friendConnected = document.getElementById("friendConnected");
const nameInput = document.getElementById("name");
const roomInput = document.getElementById("roomCode");

let activeCredentials = null;

function setBusy(isBusy) {
    createBtn.disabled = isBusy;
    joinBtn.disabled = isBusy;
    createBtn.classList.toggle("opacity-50", isBusy);
    joinBtn.classList.toggle("opacity-50", isBusy);
}

function saveCredentials(credentials) {
    sessionStorage.setItem("boothly:room", credentials.room);
    sessionStorage.setItem("boothly:participantId", credentials.participantId);
    sessionStorage.setItem("boothly:token", credentials.token);
    sessionStorage.setItem("boothly:role", credentials.role);
}

function goToBooth(credentials) {
    saveCredentials(credentials);

    const params = new URLSearchParams({
        room: credentials.room,
        participant: credentials.participantId
    });

    window.location.href = `booth.html?${params.toString()}`;
}

function roomUrl(room) {
    const url = new URL("room.html", window.location.href);
    url.searchParams.set("code", room);
    return url.toString();
}

function showWaitingRoom(credentials) {
    activeCredentials = credentials;
    saveCredentials(credentials);

    generatedCode.textContent = credentials.room;
    waitingCode.textContent = credentials.room;
    statusPanel.classList.add("hidden");
    waitingRoom.classList.remove("hidden");
    waitingMessage.textContent = "Waiting for your friend...";
    friendConnected.classList.add("hidden");
}

function showFriendConnected() {
    waitingMessage.textContent = "Your friend joined. Opening the booth...";
    friendConnected.classList.remove("hidden");

    setTimeout(() => {
        goToBooth(activeCredentials);
    }, 900);
}

function request(event, payload) {
    return new Promise((resolve) => {
        roomSocket.emit(event, payload, resolve);
    });
}

createBtn.addEventListener("click", async () => {
    const name = nameInput.value.trim();

    if (!name) {
        alert("Please enter your name.");
        return;
    }

    setBusy(true);

    console.log("[room] emit room:create", { name });

    const response = await request("room:create", { name });

    console.log("[room] ack room:create", response);

    setBusy(false);

    if (!response?.ok) {
        alert(response?.error || "Could not create room.");
        return;
    }

    showWaitingRoom(response.credentials);
});

joinBtn.addEventListener("click", async () => {
    const name = nameInput.value.trim();
    const room = roomInput.value.trim().toUpperCase();

    if (!name || !room) {
        alert("Please enter your name and room code.");
        return;
    }

    setBusy(true);

    console.log("[room] emit room:join", { room, name });

    const response = await request("room:join", {
        room,
        name
    });

    console.log("[room] ack room:join", response);

    setBusy(false);

    if (!response?.ok) {
        alert(response?.error || "Could not join room.");
        return;
    }

    goToBooth(response.credentials);
});

copyCodeBtn?.addEventListener("click", async () => {
    if (!activeCredentials) return;

    await navigator.clipboard.writeText(activeCredentials.room);
    copyCodeBtn.textContent = "Copied";

    setTimeout(() => {
        copyCodeBtn.textContent = "Copy";
    }, 1200);
});

shareRoomBtn?.addEventListener("click", async () => {
    if (!activeCredentials) return;

    const shareData = {
        title: "Join my Boothly room",
        text: `Join my Boothly room: ${activeCredentials.room}`,
        url: roomUrl(activeCredentials.room)
    };

    if (navigator.share) {
        await navigator.share(shareData);
        return;
    }

    await navigator.clipboard.writeText(shareData.url);
    shareRoomBtn.textContent = "Link Copied";

    setTimeout(() => {
        shareRoomBtn.textContent = "Share";
    }, 1200);
});

roomSocket.on("room:state", (state) => {
    if (!activeCredentials) return;
    if (state.room !== activeCredentials.room) return;

    if (state.guest?.connected || state.guest) {
        showFriendConnected();
    }
});

const initialCode = new URLSearchParams(window.location.search).get("code");

if (initialCode) {
    roomInput.value = initialCode.trim().toUpperCase();
}
