const crypto = require("crypto");
const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: process.env.CORS_ORIGIN || "*"
    }
});

const PORT = process.env.PORT || 3000;
const ROOM_TTL_MS = 30 * 60 * 1000;
const EMPTY_ROOM_TTL_MS = 2 * 60 * 1000;
const CAPTURE_TIMEOUT_MS = 8000;
const COUNTDOWN_MS = 3000;
const MAX_NAME_LENGTH = 40;

const rooms = new Map();
const socketSessions = new Map();

app.use("/css", express.static(path.join(__dirname, "css")));
app.use("/js", express.static(path.join(__dirname, "js")));
app.use("/assests", express.static(path.join(__dirname, "assests")));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/index.html", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/room.html", (req, res) => {
    res.sendFile(path.join(__dirname, "room.html"));
});

app.get("/booth.html", (req, res) => {
    res.sendFile(path.join(__dirname, "booth.html"));
});

function now() {
    return Date.now();
}

function createId(bytes = 16) {
    return crypto.randomBytes(bytes).toString("hex");
}

function hashToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
}

function sanitizeName(name) {
    return String(name || "").trim().slice(0, MAX_NAME_LENGTH);
}

function createCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";

    for (let i = 0; i < 8; i++) {
        code += alphabet[crypto.randomInt(alphabet.length)];
    }

    return `${code.slice(0, 4)}-${code.slice(4)}`;
}

function publicParticipant(participant) {
    if (!participant) return null;

    return {
        id: participant.id,
        role: participant.role,
        name: participant.name,
        connected: Boolean(participant.socketId),
        cameraReady: participant.cameraReady,
        peerReady: participant.peerReady
    };
}

function publicRoom(room) {
    return {
        room: room.code,
        status: room.status,
        settings: room.settings,
        shotIndex: room.shotIndex,
        host: publicParticipant(room.host),
        guest: publicParticipant(room.guest)
    };
}

function emitRoomState(room) {
    io.to(room.code).emit("room:state", publicRoom(room));
}

function getPartner(room, role) {
    return role === "host" ? room.guest : room.host;
}

function scheduleExpiry(room) {
    clearTimeout(room.expiryTimer);

    room.expiryTimer = setTimeout(() => {
        rooms.delete(room.code);
        io.to(room.code).emit("room:expired");
    }, ROOM_TTL_MS);
}

function scheduleEmptyDeletion(room) {
    clearTimeout(room.emptyTimer);

    if (room.host?.socketId || room.guest?.socketId) return;

    room.emptyTimer = setTimeout(() => {
        const latest = rooms.get(room.code);

        if (!latest) return;
        if (latest.host?.socketId || latest.guest?.socketId) return;

        rooms.delete(room.code);
        io.to(room.code).emit("room:expired");
    }, EMPTY_ROOM_TTL_MS);
}

function createParticipant(role, name) {
    const token = createId(24);

    return {
        id: createId(12),
        role,
        name,
        tokenHash: hashToken(token),
        socketId: null,
        cameraReady: false,
        peerReady: false,
        lastSeenAt: now(),
        token
    };
}

function issueCredentials(room, participant) {
    const token = participant.token;
    delete participant.token;

    return {
        room: room.code,
        participantId: participant.id,
        role: participant.role,
        token,
        state: publicRoom(room)
    };
}

function findRoom(code) {
    return rooms.get(String(code || "").trim().toUpperCase());
}

function validateSession(socket, payload = {}) {
    const room = findRoom(payload.room);

    if (!room) {
        return { error: "Room not found or expired." };
    }

    const participant =
        room.host?.id === payload.participantId
            ? room.host
            : room.guest?.id === payload.participantId
                ? room.guest
                : null;

    if (!participant) {
        return { error: "Participant not found." };
    }

    if (participant.tokenHash !== hashToken(String(payload.token || ""))) {
        return { error: "Invalid participant token." };
    }

    return { room, participant };
}

function getSocketSession(socket) {
    return socketSessions.get(socket.id);
}

function maybeStartSignaling(room) {
    if (room.status === "signaling" || room.status === "ready" || room.status === "shooting") {
        return;
    }

    if (!room.host || !room.guest) return;
    if (!room.host.socketId || !room.guest.socketId) return;
    if (!room.host.cameraReady || !room.guest.cameraReady) return;
    if (!room.host.peerReady || !room.guest.peerReady) return;

    room.status = "signaling";
    emitRoomState(room);

    console.log("[server] signal:begin emitting", {
        room: room.code,
        hostSocketId: room.host.socketId,
        guestSocketId: room.guest.socketId
    });

    io.to(room.host.socketId).emit("signal:begin", { polite: false, role: "host" });
    io.to(room.guest.socketId).emit("signal:begin", { polite: true, role: "guest" });
}

function completeCaptureIfReady(room) {
    if (room.status !== "shooting") return;
    if (!room.pendingCapture) return;

    const pending = room.pendingCapture;

    if (pending.acks.host && pending.acks.guest) {
        clearTimeout(pending.timer);
        room.pendingCapture = null;
        room.status = room.shotIndex >= room.settings.photoCount ? "completed" : "ready";
        emitRoomState(room);
    }
}

io.on("connection", (socket) => {
    console.log("[server] socket connected", socket.id);

    socket.onAny((event, ...args) => {
        const payload = args
            .filter((arg) => typeof arg !== "function")
            .map((arg) => JSON.stringify(arg))
            .join(" ");

        console.log(`[server:onAny] ${socket.id} -> ${event}`, payload);
    });

    socket.on("room:create", ({ name } = {}, ack) => {
        console.log("[server] room:create received", { socketId: socket.id, name });

        const displayName = sanitizeName(name);

        if (!displayName) {
            ack?.({ ok: false, error: "Please enter your name." });
            return;
        }

        let code = createCode();

        while (rooms.has(code)) {
            code = createCode();
        }

        const host = createParticipant("host", displayName);
        const room = {
            code,
            status: "waiting",
            createdAt: now(),
            expiresAt: now() + ROOM_TTL_MS,
            host,
            guest: null,
            settings: {
                photoCount: 4,
                countdownMs: COUNTDOWN_MS,
                theme: "minimal",
                filter: "normal"
            },
            shotIndex: 0,
            pendingCapture: null,
            expiryTimer: null,
            emptyTimer: null
        };

        rooms.set(code, room);
        scheduleExpiry(room);

        console.log("[server] room:create success", {
            room: code,
            hostParticipantId: host.id
        });

        ack?.({ ok: true, credentials: issueCredentials(room, host) });
    });

    socket.on("room:join", ({ room: code, name } = {}, ack) => {
        console.log("[server] room:join received", {
            socketId: socket.id,
            room: code,
            name
        });

        const room = findRoom(code);
        const displayName = sanitizeName(name);

        if (!displayName) {
            ack?.({ ok: false, error: "Please enter your name." });
            return;
        }

        if (!room) {
            ack?.({ ok: false, error: "Room not found." });
            return;
        }

        if (room.guest) {
            ack?.({ ok: false, error: "Room is full." });
            return;
        }

        const guest = createParticipant("guest", displayName);
        room.guest = guest;
        room.status = "paired";

        console.log("[server] room:join success", {
            room: room.code,
            guestParticipantId: guest.id
        });

        ack?.({ ok: true, credentials: issueCredentials(room, guest) });
        emitRoomState(room);
    });

    socket.on("room:authenticate", (payload = {}, ack) => {
        console.log("[server] room:authenticate received", {
            socketId: socket.id,
            room: payload.room,
            participantId: payload.participantId
        });

        const result = validateSession(socket, payload);

        if (result.error) {
            ack?.({ ok: false, error: result.error });
            return;
        }

        const { room, participant } = result;

        if (participant.socketId && participant.socketId !== socket.id) {
            io.to(participant.socketId).emit("session:replaced");
            socketSessions.delete(participant.socketId);
        }

        participant.socketId = socket.id;
        participant.lastSeenAt = now();

        clearTimeout(room.emptyTimer);

        socket.join(room.code);
        socketSessions.set(socket.id, {
            roomCode: room.code,
            participantId: participant.id,
            role: participant.role
        });

        console.log("[server] room:authenticate success", {
            socketId: socket.id,
            room: room.code,
            participantId: participant.id,
            role: participant.role
        });

        ack?.({
            ok: true,
            role: participant.role,
            state: publicRoom(room)
        });

        emitRoomState(room);
        maybeStartSignaling(room);
    });

    socket.on("client:camera-ready", (_, ack) => {
        console.log("[server] client:camera-ready received", {
            socketId: socket.id
        });

        const session = getSocketSession(socket);
        if (!session) return ack?.({ ok: false, error: "Not authenticated." });

        const room = rooms.get(session.roomCode);
        const participant = session.role === "host" ? room?.host : room?.guest;
        if (!room || !participant) return ack?.({ ok: false, error: "Room expired." });

        participant.cameraReady = true;
        participant.lastSeenAt = now();
        ack?.({ ok: true });

        console.log("[server] client:camera-ready success", {
            room: room.code,
            role: session.role,
            participantId: participant.id
        });

        emitRoomState(room);
        maybeStartSignaling(room);
    });

    socket.on("client:peer-ready", (_, ack) => {
        console.log("[server] client:peer-ready received", {
            socketId: socket.id
        });

        const session = getSocketSession(socket);
        if (!session) return ack?.({ ok: false, error: "Not authenticated." });

        const room = rooms.get(session.roomCode);
        const participant = session.role === "host" ? room?.host : room?.guest;
        if (!room || !participant) return ack?.({ ok: false, error: "Room expired." });

        participant.peerReady = true;
        participant.lastSeenAt = now();
        ack?.({ ok: true });

        console.log("[server] client:peer-ready success", {
            room: room.code,
            role: session.role,
            participantId: participant.id
        });

        emitRoomState(room);
        maybeStartSignaling(room);
    });

    socket.on("signal:offer", ({ description } = {}) => {
        console.log("[server] signal:offer received", { socketId: socket.id });

        const session = getSocketSession(socket);
        if (!session) return;

        const room = rooms.get(session.roomCode);
        const participant = session.role === "host" ? room?.host : room?.guest;
        const partner = room ? getPartner(room, session.role) : null;

        if (!room || !participant || !partner?.socketId) return;
        if (room.status !== "signaling" && room.status !== "ready") return;

        console.log("[server] signal:offer forwarding", {
            room: room.code,
            from: participant.id,
            toSocketId: partner.socketId
        });

        io.to(partner.socketId).emit("signal:offer", {
            from: participant.id,
            description
        });
    });

    socket.on("signal:answer", ({ description } = {}) => {
        console.log("[server] signal:answer received", { socketId: socket.id });

        const session = getSocketSession(socket);
        if (!session) return;

        const room = rooms.get(session.roomCode);
        const participant = session.role === "host" ? room?.host : room?.guest;
        const partner = room ? getPartner(room, session.role) : null;

        if (!room || !participant || !partner?.socketId) return;
        if (room.status !== "signaling" && room.status !== "ready") return;

        room.status = "ready";
        console.log("[server] signal:answer forwarding", {
            room: room.code,
            from: participant.id,
            toSocketId: partner.socketId
        });

        io.to(partner.socketId).emit("signal:answer", {
            from: participant.id,
            description
        });
        emitRoomState(room);
    });

    socket.on("signal:ice", ({ candidate } = {}) => {
        console.log("[server] signal:ice received", {
            socketId: socket.id,
            hasCandidate: Boolean(candidate)
        });

        const session = getSocketSession(socket);
        if (!session) return;

        const room = rooms.get(session.roomCode);
        const participant = session.role === "host" ? room?.host : room?.guest;
        const partner = room ? getPartner(room, session.role) : null;

        if (!room || !participant || !partner?.socketId) return;

        console.log("[server] signal:ice forwarding", {
            room: room.code,
            from: participant.id,
            toSocketId: partner.socketId
        });

        io.to(partner.socketId).emit("signal:ice", {
            from: participant.id,
            candidate
        });
    });

    socket.on("session:update-settings", ({ settings } = {}, ack) => {
        const session = getSocketSession(socket);
        if (!session) return ack?.({ ok: false, error: "Not authenticated." });

        const room = rooms.get(session.roomCode);
        if (!room) return ack?.({ ok: false, error: "Room expired." });
        if (session.role !== "host") return ack?.({ ok: false, error: "Only host can change settings." });
        if (room.status === "shooting") return ack?.({ ok: false, error: "Cannot change settings while shooting." });

        room.settings = {
            ...room.settings,
            ...settings,
            photoCount: Number(settings?.photoCount) || room.settings.photoCount,
            countdownMs: Number(settings?.countdownMs) || room.settings.countdownMs
        };

        ack?.({ ok: true, state: publicRoom(room) });
        emitRoomState(room);
    });

    socket.on("session:start", (ack) => {
        const session = getSocketSession(socket);
        if (!session) return ack?.({ ok: false, error: "Not authenticated." });

        const room = rooms.get(session.roomCode);
        if (!room) return ack?.({ ok: false, error: "Room expired." });
        if (session.role !== "host") return ack?.({ ok: false, error: "Only host can start." });
        if (room.status !== "ready" && room.status !== "completed") {
            return ack?.({ ok: false, error: "Both cameras must be connected first." });
        }

        if (room.status === "completed") {
            room.shotIndex = 0;
        }

        room.status = "shooting";
        room.shotIndex += 1;

        const shotIndex = room.shotIndex;
        const captureAt = now() + room.settings.countdownMs;

        room.pendingCapture = {
            shotIndex,
            captureAt,
            acks: {
                host: false,
                guest: false
            },
            timer: setTimeout(() => {
                const latest = rooms.get(room.code);

                if (!latest?.pendingCapture) return;
                if (latest.pendingCapture.shotIndex !== shotIndex) return;

                latest.pendingCapture = null;
                latest.status = latest.shotIndex >= latest.settings.photoCount ? "completed" : "ready";
                emitRoomState(latest);
            }, room.settings.countdownMs + CAPTURE_TIMEOUT_MS)
        };

        io.to(room.code).emit("session:countdown", {
            shotIndex,
            captureAt,
            countdownMs: room.settings.countdownMs
        });

        ack?.({ ok: true, shotIndex, captureAt });
        emitRoomState(room);
    });

    socket.on("session:capture-ack", ({ shotIndex } = {}) => {
        const session = getSocketSession(socket);
        if (!session) return;

        const room = rooms.get(session.roomCode);
        if (!room?.pendingCapture) return;
        if (room.pendingCapture.shotIndex !== shotIndex) return;

        room.pendingCapture.acks[session.role] = true;
        completeCaptureIfReady(room);
    });

    socket.on("disconnect", () => {
        const session = socketSessions.get(socket.id);
        socketSessions.delete(socket.id);

        if (!session) return;

        const room = rooms.get(session.roomCode);
        if (!room) return;

        const participant = session.role === "host" ? room.host : room.guest;

        if (participant?.socketId === socket.id) {
            participant.socketId = null;
            participant.cameraReady = false;
            participant.peerReady = false;
            participant.lastSeenAt = now();
        }

        if (room.status === "ready" || room.status === "signaling") {
            room.status = room.guest ? "paired" : "waiting";
        }

        socket.to(room.code).emit("partner:left", {
            role: session.role
        });

        emitRoomState(room);
        scheduleEmptyDeletion(room);
    });
});

server.listen(PORT, "0.0.0.0", () => {
    console.log(`Boothly server running at http://localhost:${PORT}`);
});
