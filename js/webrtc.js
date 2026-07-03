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
    console.log("[webrtc] RTCPeerConnection created");

    if (localStream) {
        console.log("[webrtc] adding local tracks", {
            trackCount: localStream.getTracks().length
        });

        localStream.getTracks().forEach((track) => {
            peerConnection.addTrack(track, localStream);
        });
    }

    peerConnection.ontrack = (event) => {
        console.log("[webrtc] ontrack fired", event);

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
        console.log("[webrtc] ICE sent candidate generated", event.candidate);

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
    console.log("[webrtc] beginSignaling", { shouldOffer });

    const connection = await ensurePeerConnection();

    if (shouldOffer) {
        console.log("[webrtc] createOffer start");

        const offer = await connection.createOffer();
        console.log("[webrtc] createOffer complete", offer);

        await connection.setLocalDescription(offer);
        console.log("[webrtc] setLocalDescription offer complete", connection.localDescription);

        if (typeof emitOffer === "function") {
            emitOffer(connection.localDescription);
        }
    }
}

async function handleRemoteOffer(description) {
    console.log("[webrtc] handleRemoteOffer", description);

    const connection = await ensurePeerConnection();

    console.log("[webrtc] setRemoteDescription offer start");

    await connection.setRemoteDescription(new RTCSessionDescription(description));
    console.log("[webrtc] setRemoteDescription offer complete");

    remoteDescriptionReady = true;
    await flushPendingIceCandidates();

    console.log("[webrtc] createAnswer start");

    const answer = await connection.createAnswer();
    console.log("[webrtc] createAnswer complete", answer);

    await connection.setLocalDescription(answer);
    console.log("[webrtc] setLocalDescription answer complete", connection.localDescription);

    if (typeof emitAnswer === "function") {
        emitAnswer(connection.localDescription);
    }
}

async function handleRemoteAnswer(description) {
    console.log("[webrtc] handleRemoteAnswer", description);

    if (!peerConnection) return;

    console.log("[webrtc] setRemoteDescription answer start");

    await peerConnection.setRemoteDescription(new RTCSessionDescription(description));
    console.log("[webrtc] setRemoteDescription answer complete");

    remoteDescriptionReady = true;
    await flushPendingIceCandidates();
}

async function handleRemoteIceCandidate(candidate) {
    console.log("[webrtc] ICE received handleRemoteIceCandidate", {
        candidate,
        hasPeerConnection: Boolean(peerConnection),
        remoteDescriptionReady
    });

    if (!candidate) return;

    if (!peerConnection || !remoteDescriptionReady) {
        pendingIceCandidates.push(candidate);
        return;
    }

    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    console.log("[webrtc] ICE received addIceCandidate complete");
}

async function flushPendingIceCandidates() {
    if (!peerConnection || !remoteDescriptionReady) return;

    while (pendingIceCandidates.length) {
        const candidate = pendingIceCandidates.shift();
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        console.log("[webrtc] ICE received queued addIceCandidate complete");
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
