let peerConnection = null;
let remoteDescriptionReady = false;

const pendingIceCandidates = [];
const rtcConfiguration = {
    iceServers: [
        {
            urls: "stun:stun.l.google.com:19302"
        }
    ]
};

const friendVideos = [
    document.getElementById("friendVideo1"),
    document.getElementById("friendVideo2"),
    document.getElementById("friendVideo3"),
    document.getElementById("friendVideo4")
];

const friendPlaceholders = [
    document.getElementById("friendPlaceholder1"),
    document.getElementById("friendPlaceholder2"),
    document.getElementById("friendPlaceholder3"),
    document.getElementById("friendPlaceholder4")
];

async function ensurePeerConnection() {
    if (peerConnection) {
        return peerConnection;
    }

    if (typeof waitForCamera === "function") {
        await waitForCamera();
    }

    peerConnection = new RTCPeerConnection(rtcConfiguration);

    if (localStream) {
        localStream.getTracks().forEach((track) => {
            peerConnection.addTrack(track, localStream);
        });
    }

    peerConnection.ontrack = (event) => {
        const [remoteStream] = event.streams;

        friendVideos.forEach((video, index) => {
            video.srcObject = remoteStream;
            video.classList.remove("hidden");
            video.play().catch(() => {});
            friendPlaceholders[index]?.classList.add("hidden");
        });
    };

    peerConnection.onicecandidate = (event) => {
        if (!event.candidate) return;
        if (typeof emitIceCandidate === "function") {
            emitIceCandidate(event.candidate);
        }
    };

    peerConnection.onconnectionstatechange = () => {
        if (peerConnection.connectionState === "failed") {
            peerConnection.restartIce();
        }
    };

    return peerConnection;
}

async function beginSignaling({ shouldOffer }) {
    const connection = await ensurePeerConnection();

    if (shouldOffer) {
        const offer = await connection.createOffer();
        await connection.setLocalDescription(offer);

        if (typeof emitOffer === "function") {
            emitOffer(connection.localDescription);
        }
    }
}

async function handleRemoteOffer(description) {
    const connection = await ensurePeerConnection();

    await connection.setRemoteDescription(new RTCSessionDescription(description));
    remoteDescriptionReady = true;
    await flushPendingIceCandidates();

    const answer = await connection.createAnswer();
    await connection.setLocalDescription(answer);

    if (typeof emitAnswer === "function") {
        emitAnswer(connection.localDescription);
    }
}

async function handleRemoteAnswer(description) {
    if (!peerConnection) return;

    await peerConnection.setRemoteDescription(new RTCSessionDescription(description));
    remoteDescriptionReady = true;
    await flushPendingIceCandidates();
}

async function handleRemoteIceCandidate(candidate) {
    if (!candidate) return;

    if (!peerConnection || !remoteDescriptionReady) {
        pendingIceCandidates.push(candidate);
        return;
    }

    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
}

async function flushPendingIceCandidates() {
    if (!peerConnection || !remoteDescriptionReady) return;

    while (pendingIceCandidates.length) {
        const candidate = pendingIceCandidates.shift();
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
}

function resetPeerConnection() {
    remoteDescriptionReady = false;
    pendingIceCandidates.length = 0;

    if (!peerConnection) return;

    peerConnection.getSenders().forEach((sender) => {
        sender.track?.stop();
    });

    peerConnection.close();
    peerConnection = null;
}
