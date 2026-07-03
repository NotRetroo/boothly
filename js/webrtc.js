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
    console.log("[webrtc:ensure] entered", {
        hasExistingPeerConnection: Boolean(peerConnection),
        hasWaitForCamera: typeof waitForCamera === "function",
        hasLocalStream: typeof localStream !== "undefined" && Boolean(localStream)
    });

    if (peerConnection) {
        console.log("[webrtc:ensure] returning existing peerConnection");
        return peerConnection;
    }

    if (typeof waitForCamera === "function") {
        console.log("[webrtc:ensure] before await waitForCamera()");
        await waitForCamera();
        console.log("[webrtc:ensure] after await waitForCamera()");
    }

    console.log("[webrtc:ensure] before new RTCPeerConnection()");
    peerConnection = new RTCPeerConnection(rtcConfiguration);
    console.log("[webrtc:ensure] after new RTCPeerConnection()", peerConnection);
    console.log("[webrtc] RTCPeerConnection created");

    console.log("[webrtc:ensure] before localStream check", {
        localStreamType: typeof localStream,
        hasLocalStream: Boolean(localStream)
    });

    if (localStream) {
        console.log("[webrtc:ensure] inside localStream block");

        console.log("[webrtc] adding local tracks", {
            trackCount: localStream.getTracks().length
        });

        console.log("[webrtc:ensure] before localStream.getTracks()");
        const tracks = localStream.getTracks();
        console.log("[webrtc:ensure] after localStream.getTracks()", {
            trackCount: tracks.length,
            tracks
        });

        tracks.forEach((track, index) => {
            console.log("[webrtc:ensure] before peerConnection.addTrack()", {
                index,
                kind: track.kind,
                id: track.id,
                readyState: track.readyState
            });

            peerConnection.addTrack(track, localStream);

            console.log("[webrtc:ensure] after peerConnection.addTrack()", {
                index
            });
        });
    }

    console.log("[webrtc:ensure] before assigning ontrack");
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
    console.log("[webrtc:ensure] after assigning ontrack");

    console.log("[webrtc:ensure] before assigning onicecandidate");
    peerConnection.onicecandidate = (event) => {
        if (!event.candidate) return;
        console.log("[webrtc] ICE sent candidate generated", event.candidate);

        if (typeof emitIceCandidate === "function") {
            emitIceCandidate(event.candidate);
        }
    };
    console.log("[webrtc:ensure] after assigning onicecandidate");

    console.log("[webrtc:ensure] before assigning onconnectionstatechange");
    peerConnection.onconnectionstatechange = () => {
        if (peerConnection.connectionState === "failed") {
            peerConnection.restartIce();
        }
    };
    console.log("[webrtc:ensure] after assigning onconnectionstatechange");

    console.log("[webrtc:ensure] returning new peerConnection");
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
