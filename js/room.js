const roomSocket = io();

const createBtn = document.getElementById("createBtn");
const joinBtn = document.getElementById("joinBtn");
const statusPanel = document.getElementById("status");
const generatedCode = document.getElementById("generatedCode");
const nameInput = document.getElementById("name");
const roomInput = document.getElementById("roomCode");

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

    const response = await request("room:create", { name });

    setBusy(false);

    if (!response?.ok) {
        alert(response?.error || "Could not create room.");
        return;
    }

    generatedCode.textContent = response.credentials.room;
    statusPanel.classList.remove("hidden");

    setTimeout(() => {
        goToBooth(response.credentials);
    }, 700);
});

joinBtn.addEventListener("click", async () => {
    const name = nameInput.value.trim();
    const room = roomInput.value.trim().toUpperCase();

    if (!name || !room) {
        alert("Please enter your name and room code.");
        return;
    }

    setBusy(true);

    const response = await request("room:join", {
        room,
        name
    });

    setBusy(false);

    if (!response?.ok) {
        alert(response?.error || "Could not join room.");
        return;
    }

    goToBooth(response.credentials);
});
