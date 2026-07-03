(function () {
    const PHOTO_COUNT = 4;
    const JPEG_QUALITY = 0.92;
    const DB_NAME = "BoothlyDB";
    const DB_VERSION = 1;
    const CAPTURE_STORE = "captures";
    const CURRENT_STRIP_KEY = "currentStrip";

    const THEMES = {
        classic: {
            page: "#eef3f8",
            strip: "#fffdf7",
            text: "#172554",
            muted: "#52647a",
            border: "#172554",
            frame: "#ffffff",
            accent: "#ef5da8",
            accentAlt: "#fbbf24",
            decoration: "#2563eb",
            shadow: "rgba(15,23,42,0.20)"
        },
        minimal: {
            page: "#f8fafc",
            strip: "#ffffff",
            text: "#111827",
            muted: "#64748b",
            border: "#334155",
            frame: "#ffffff",
            accent: "#0f766e",
            accentAlt: "#94a3b8",
            decoration: "#475569",
            shadow: "rgba(15,23,42,0.14)"
        },
        vintage: {
            page: "#efe3cf",
            strip: "#fff7df",
            text: "#3f2f23",
            muted: "#8a6b4f",
            border: "#744f2b",
            frame: "#fffaf0",
            accent: "#b45309",
            accentAlt: "#d97706",
            decoration: "#7c2d12",
            shadow: "rgba(92,64,51,0.22)"
        },
        dark: {
            page: "#0f172a",
            strip: "#111827",
            text: "#f8fafc",
            muted: "#cbd5e1",
            border: "#93c5fd",
            frame: "#020617",
            accent: "#f472b6",
            accentAlt: "#fde68a",
            decoration: "#bfdbfe",
            shadow: "rgba(0,0,0,0.42)"
        }
    };

    const LAYOUT = {

    // Canvas size
    width: 920,
    height: 2450,

    // Paper margins
    outerMargin: 36,
    innerPadding: 52,

    // Header
    headerHeight: 250,

    // Photos
    photoWidth: 710,
    photoHeight: 285,
    photoGap: 34,

    // Rounded corners
    frameRadius: 24,
    stripRadius: 34,

    // Footer
    footerHeight: 330,

    // Shadows
    shadowBlur: 30,
    shadowOffset: 10,

    // Decorative spacing
    decorationMargin: 26
};

    function openCapturesDb() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = () => {
                const db = request.result;

                if (!db.objectStoreNames.contains(CAPTURE_STORE)) {
                    db.createObjectStore(CAPTURE_STORE);
                }
            };

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error("Could not open BoothlyDB."));
        });
    }

    function canvasToBlob(canvas) {
        return new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (!blob) {
                    reject(new Error("Could not save one of your captured photos."));
                    return;
                }

                resolve(blob);
            }, "image/png");
        });
    }

    function writeCurrentStrip(strip) {
        return openCapturesDb().then((db) => new Promise((resolve, reject) => {
            const transaction = db.transaction(CAPTURE_STORE, "readwrite");
            const store = transaction.objectStore(CAPTURE_STORE);

            transaction.oncomplete = () => {
                db.close();
                resolve();
            };
            transaction.onerror = () => {
                db.close();
                reject(transaction.error || new Error("Could not save your captured photos."));
            };
            transaction.onabort = () => {
                db.close();
                reject(transaction.error || new Error("Saving your captured photos was interrupted."));
            };

            store.clear();
            store.put(strip, CURRENT_STRIP_KEY);
        }));
    }

    function readCurrentStrip() {
        return openCapturesDb().then((db) => new Promise((resolve, reject) => {
            const transaction = db.transaction(CAPTURE_STORE, "readonly");
            const store = transaction.objectStore(CAPTURE_STORE);
            const request = store.get(CURRENT_STRIP_KEY);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error("Could not read your saved photo strip."));
            transaction.oncomplete = () => db.close();
            transaction.onerror = () => {
                db.close();
                reject(transaction.error || new Error("Could not read your saved photo strip."));
            };
            transaction.onabort = () => {
                db.close();
                reject(transaction.error || new Error("Reading your saved photo strip was interrupted."));
            };
        }));
    }

    async function storeCapturedImagesAndRedirect() {
        const capturedAt = new Date();
        const canvases = [];

        for (let index = 1; index <= PHOTO_COUNT; index += 1) {
            const myId = `myCanvas${index}`;
            const friendId = `friendCanvas${index}`;
            const myCanvas = document.getElementById(myId);
            const friendCanvas = document.getElementById(friendId);

            console.log("[download] canvas pair", {
                id: myId,
                width: myCanvas instanceof HTMLCanvasElement ? myCanvas.width : 0,
                height: myCanvas instanceof HTMLCanvasElement ? myCanvas.height : 0
            });
            console.log("[download] canvas pair", {
                id: friendId,
                width: friendCanvas instanceof HTMLCanvasElement ? friendCanvas.width : 0,
                height: friendCanvas instanceof HTMLCanvasElement ? friendCanvas.height : 0
            });

            if (
                !(myCanvas instanceof HTMLCanvasElement) ||
                !(friendCanvas instanceof HTMLCanvasElement) ||
                myCanvas.width <= 0 ||
                myCanvas.height <= 0 ||
                friendCanvas.width <= 0 ||
                friendCanvas.height <= 0
            ) {
                return false;
            }

            canvases.push({ index, myCanvas, friendCanvas });
        }

        try {
            const strip = {
                me: await Promise.all(canvases.map(({ myCanvas }) => canvasToBlob(myCanvas))),
                friend: await Promise.all(canvases.map(({ friendCanvas }) => canvasToBlob(friendCanvas))),
                createdAt: capturedAt.getTime()
            };

            await writeCurrentStrip(strip);

            if (strip.me.length !== PHOTO_COUNT || strip.friend.length !== PHOTO_COUNT) {
                console.warn("[download] final IndexedDB strip incomplete; not redirecting", {
                    me: strip.me.length,
                    friend: strip.friend.length
                });
                return false;
            }

            window.location.href = "/download.html";
            return true;
        } catch (error) {
            console.error(error);
            return false;
        }
    }

    function selectedValue(name, fallback) {
        const selected = document.querySelector(`input[name="${name}"]:checked`);
        return selected?.value || fallback;
    }

    function loadImage(src) {
        return new Promise((resolve, reject) => {
            const image = new Image();

            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error("Could not load one of your saved photos."));
            image.src = src;
        });
    }

    async function loadStoredPhotos() {
        const strip = await readCurrentStrip();
        const pairs = [];
        const objectUrls = [];

        if (
            !strip ||
            !Array.isArray(strip.me) ||
            !Array.isArray(strip.friend) ||
            strip.me.length !== PHOTO_COUNT ||
            strip.friend.length !== PHOTO_COUNT
        ) {
            throw new Error("Your saved photo strip is missing. Please finish a booth session again.");
        }

        try {
            for (let index = 1; index <= PHOTO_COUNT; index += 1) {
                const myBlob = strip.me[index - 1];
                const friendBlob = strip.friend[index - 1];

                if (!(myBlob instanceof Blob) || !(friendBlob instanceof Blob)) {
                    throw new Error("Your saved photo strip is missing. Please finish a booth session again.");
                }

                const mySrc = URL.createObjectURL(myBlob);
                const friendSrc = URL.createObjectURL(friendBlob);

                objectUrls.push(mySrc, friendSrc);

                pairs.push({
                    index,
                    my: await loadImage(mySrc),
                    friend: await loadImage(friendSrc)
                });
            }
        } catch (error) {
            objectUrls.forEach((url) => URL.revokeObjectURL(url));
            throw error;
        }

        return {
            pairs,
            objectUrls,
            createdAt: strip.createdAt
        };
    }

    function drawRoundedRect(ctx, x, y, width, height, radius) {
        const safeRadius = Math.min(radius, width / 2, height / 2);

        ctx.beginPath();
        ctx.moveTo(x + safeRadius, y);
        ctx.lineTo(x + width - safeRadius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
        ctx.lineTo(x + width, y + height - safeRadius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
        ctx.lineTo(x + safeRadius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
        ctx.lineTo(x, y + safeRadius);
        ctx.quadraticCurveTo(x, y, x + safeRadius, y);
        ctx.closePath();
    }

    function drawCroppedImage(ctx, image, x, y, width, height) {
        const sourceRatio = image.width / image.height;
        const targetRatio = width / height;
        let sx = 0;
        let sy = 0;
        let sw = image.width;
        let sh = image.height;

        if (sourceRatio > targetRatio) {
            sw = image.height * targetRatio;
            sx = (image.width - sw) / 2;
        } else {
            sh = image.width / targetRatio;
            sy = (image.height - sh) / 2;
        }

        ctx.drawImage(image, sx, sy, sw, sh, x, y, width, height);
    }

function createStripLayout(pairs, quality) {

    const scale = quality === "standard" ? 0.5 : 1;

    const singleWidth =
        Math.round(
            Math.max(
                ...pairs.map(pair => Math.max(pair.my.width, pair.friend.width))
            ) * scale
        );

    const singleHeight =
        Math.round(
            Math.max(
                ...pairs.map(pair => Math.max(pair.my.height, pair.friend.height))
            ) * scale
        );

    const photoWidth = singleWidth * 2;

    const photoHeight =
        Math.round(
            photoWidth * 0.52
        );

    return {

        width: photoWidth + LAYOUT.innerPadding * 2,

        height:
            LAYOUT.headerHeight +
            LAYOUT.footerHeight +
            photoHeight * 4 +
            LAYOUT.photoGap * 3,

        padding: LAYOUT.innerPadding,

        headerHeight: LAYOUT.headerHeight,

        footerHeight: LAYOUT.footerHeight,

        photoWidth,

        photoHeight,

        singlePhotoWidth: singleWidth,

        photoGap: LAYOUT.photoGap,

        photoTop: LAYOUT.headerHeight,

        frameInset: 16,

        borderRadius: LAYOUT.frameRadius,

        shadowBlur: LAYOUT.shadowBlur,

        outerBorder: LAYOUT.outerMargin,

        lineWidth: 3
    };

}

    const DECORATIONS = [
        { type: "sparkle", x: 0.12, y: 0.07, size: 0.032, color: "accentAlt" },
        { type: "heart", x: 0.88, y: 0.075, size: 0.036, color: "accent" },
        { type: "star", x: 0.16, y: 0.18, size: 0.025, color: "decoration" },
        { type: "dot", x: 0.84, y: 0.19, size: 0.014, color: "accentAlt" },
        { type: "squiggle", x: 0.1, y: 0.91, size: 0.05, color: "decoration" },
        { type: "heart", x: 0.86, y: 0.9, size: 0.027, color: "accent" },
        { type: "dot", x: 0.18, y: 0.96, size: 0.012, color: "accent" },
        { type: "star", x: 0.78, y: 0.955, size: 0.021, color: "accentAlt" }
    ];

    class StripRenderer {
        constructor(canvas, pairs, options, createdAt) {
            this.canvas = canvas;
            this.pairs = pairs;
            this.theme = THEMES[options.theme] || THEMES.classic;
            this.layout = createStripLayout(pairs, options.quality);
            this.createdAt = createdAt;
        }

        // Base paper and surrounding page color.
        drawBackground() {
            const { ctx, layout, theme } = this;

            ctx.fillStyle = theme.page;
            ctx.fillRect(0, 0, layout.width, layout.height);

            ctx.save();
            ctx.shadowColor = theme.shadow;
            ctx.shadowBlur = layout.shadowBlur;
            ctx.shadowOffsetY = Math.round(layout.shadowBlur * 0.44);
            ctx.fillStyle = theme.strip;
            drawRoundedRect(
                ctx,
                layout.outerBorder,
                layout.outerBorder,
                layout.width - layout.outerBorder * 2,
                layout.height - layout.outerBorder * 2,
                layout.borderRadius + layout.outerBorder
            );
            ctx.fill();
            ctx.restore();
        }

        // Thin printed border around the strip.
        drawOuterBorder() {
            const { ctx, layout, theme } = this;
            const borderInset = layout.outerBorder + layout.lineWidth;

            ctx.strokeStyle = theme.border;
            ctx.lineWidth = layout.lineWidth;
            drawRoundedRect(
                ctx,
                borderInset,
                borderInset,
                layout.width - borderInset * 2,
                layout.height - borderInset * 2,
                layout.borderRadius
            );
            ctx.stroke();
        }

        // Brand lockup at the top of the printed strip.
       drawHeader() {

    const { ctx, layout, theme } = this;

    const center = layout.width / 2;

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.fillStyle = theme.text;

    ctx.font = "900 70px Inter";

    ctx.fillText(
        "Boothly",
        center,
        82
    );

    ctx.font = "600 24px Inter";

    ctx.fillStyle = theme.muted;

    ctx.fillText(
        "Memories Together",
        center,
        132
    );

}
        // Single rounded frame containing both Boothly captures as one row.
        drawPhotoFrame(pair, rowIndex) {
            const { ctx, layout, theme } = this;
            const x = layout.padding;
            const y = layout.photoTop + rowIndex * (layout.photoHeight + layout.photoGap);
            const radius = layout.borderRadius;

            ctx.save();
            ctx.shadowColor = theme.shadow;
            ctx.shadowBlur = Math.round(layout.shadowBlur * 0.56);
            ctx.shadowOffsetY = Math.round(layout.shadowBlur * 0.22);
            ctx.fillStyle = theme.frame;
            drawRoundedRect(
                ctx,
                x - layout.frameInset,
                y - layout.frameInset,
                layout.photoWidth + layout.frameInset * 2,
                layout.photoHeight + layout.frameInset * 2,
                radius + layout.frameInset
            );
            ctx.fill();
            ctx.restore();

            ctx.save();
            drawRoundedRect(ctx, x, y, layout.photoWidth, layout.photoHeight, radius);
            ctx.clip();
            drawCroppedImage(ctx, pair.my, x, y, layout.singlePhotoWidth, layout.photoHeight);
            drawCroppedImage(ctx, pair.friend, x + layout.singlePhotoWidth, y, layout.singlePhotoWidth, layout.photoHeight);
            ctx.fillStyle = "rgba(255,255,255,0.16)";
            ctx.fillRect(x + layout.singlePhotoWidth - 1, y, 2, layout.photoHeight);
            ctx.restore();

            ctx.strokeStyle = theme.border;
            ctx.lineWidth = layout.lineWidth;
            drawRoundedRect(ctx, x, y, layout.photoWidth, layout.photoHeight, radius);
            ctx.stroke();
        }

        // Small decorative marks, driven by data for easy extension.
        drawDecorations() {
            DECORATIONS.forEach((decoration) => {
                const color = this.theme[decoration.color] || this.theme.decoration;
                const x = this.layout.width * decoration.x;
                const y = this.layout.height * decoration.y;
                const size = this.layout.width * decoration.size;

                if (decoration.type === "heart") this.drawHeart(x, y, size, color);
                if (decoration.type === "star") this.drawStar(x, y, size, color);
                if (decoration.type === "sparkle") this.drawSparkle(x, y, size, color);
                if (decoration.type === "squiggle") this.drawSquiggle(x, y, size, color);
                if (decoration.type === "dot") this.drawDot(x, y, size, color);
            });
        }

        // Keepsake text and capture timestamp.
        drawFooter() {
    const { ctx, layout, theme } = this;

    const capturedAt = this.createdAt
        ? new Date(this.createdAt)
        : new Date();

    const date = capturedAt.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric"
    });

    const time = capturedAt.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit"
    });

    const footerTop = layout.height - layout.footerHeight;

    // Decorative divider
    ctx.strokeStyle = theme.accentAlt;
    ctx.lineWidth = 3;

    ctx.beginPath();
    ctx.moveTo(100, footerTop + 40);
    ctx.lineTo(layout.width - 100, footerTop + 40);
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Main title
    ctx.fillStyle = theme.text;
    ctx.font = "700 52px Inter";
    ctx.fillText(
        "Good times",
        layout.width / 2,
        footerTop + 95
    );

    // Subtitle
    ctx.fillStyle = theme.accent;
    ctx.font = "700 30px Inter";
    ctx.fillText(
        "Great Memories",
        layout.width / 2,
        footerTop + 145
    );

    // Date
    ctx.fillStyle = theme.muted;
    ctx.font = "600 22px Inter";
    ctx.fillText(
        date,
        layout.width / 2,
        footerTop + 210
    );

    // Time
    ctx.fillText(
        time,
        layout.width / 2,
        footerTop + 245
    );

    // Badge
    ctx.fillStyle = theme.text;
    ctx.font = "700 24px Inter";
    ctx.fillText(
        "Made with Boothly ❤️",
        layout.width / 2,
        footerTop + 295
    );
}

        render() {
            this.canvas.width = this.layout.width;
            this.canvas.height = this.layout.height;
            this.ctx = this.canvas.getContext("2d");

            this.drawBackground();
            this.drawOuterBorder();
            this.drawHeader();
            this.pairs.forEach((pair, index) => this.drawPhotoFrame(pair, index));
            this.drawDecorations();
            this.drawFooter();

            return this.layout;
        }

        drawHeart(x, y, size, color) {
            const { ctx } = this;

            ctx.save();
            ctx.translate(x, y);
            ctx.scale(size / 28, size / 28);
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(0, 9);
            ctx.bezierCurveTo(-26, -10, -4, -25, 0, -10);
            ctx.bezierCurveTo(4, -25, 26, -10, 0, 9);
            ctx.fill();
            ctx.restore();
        }

        drawStar(x, y, size, color) {
            const { ctx } = this;
            const points = 5;

            ctx.save();
            ctx.translate(x, y);
            ctx.fillStyle = color;
            ctx.beginPath();

            for (let index = 0; index < points * 2; index += 1) {
                const radius = index % 2 === 0 ? size : size * 0.45;
                const angle = -Math.PI / 2 + index * Math.PI / points;
                const px = Math.cos(angle) * radius;
                const py = Math.sin(angle) * radius;

                if (index === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }

            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }

        drawSparkle(x, y, size, color) {
            const { ctx } = this;

            ctx.save();
            ctx.strokeStyle = color;
            ctx.lineWidth = Math.max(3, size * 0.12);
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(x - size, y);
            ctx.lineTo(x + size, y);
            ctx.moveTo(x, y - size);
            ctx.lineTo(x, y + size);
            ctx.moveTo(x - size * 0.55, y - size * 0.55);
            ctx.lineTo(x + size * 0.55, y + size * 0.55);
            ctx.moveTo(x + size * 0.55, y - size * 0.55);
            ctx.lineTo(x - size * 0.55, y + size * 0.55);
            ctx.stroke();
            ctx.restore();
        }

        drawSquiggle(x, y, size, color) {
            const { ctx } = this;

            ctx.save();
            ctx.strokeStyle = color;
            ctx.lineWidth = Math.max(4, size * 0.12);
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(x - size, y);
            ctx.bezierCurveTo(x - size * 0.5, y - size * 0.65, x, y + size * 0.65, x + size * 0.5, y);
            ctx.bezierCurveTo(x + size * 0.8, y - size * 0.38, x + size, y - size * 0.18, x + size * 1.18, y);
            ctx.stroke();
            ctx.restore();
        }

        drawDot(x, y, size, color) {
            const { ctx } = this;

            ctx.save();
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    function renderStripToCanvas(canvas, pairs, options, createdAt) {
        return new StripRenderer(canvas, pairs, options, createdAt).render();
    }

    function createBlob(canvas, format) {
        const mimeType = format === "jpeg" ? "image/jpeg" : "image/png";
        const quality = format === "jpeg" ? JPEG_QUALITY : undefined;

        return new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (!blob) {
                    reject(new Error("Could not create the image file."));
                    return;
                }

                resolve(blob);
            }, mimeType, quality);
        });
    }

    function fileName(format) {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const day = String(now.getDate()).padStart(2, "0");
        const hour = String(now.getHours()).padStart(2, "0");
        const minute = String(now.getMinutes()).padStart(2, "0");
        const extension = format === "jpeg" ? "jpg" : "png";

        return `Boothly_${year}-${month}-${day}_${hour}-${minute}.${extension}`;
    }

    function showStatus(message, isError) {
        const status = document.getElementById("downloadStatus");

        if (!status) return;

        status.textContent = message;
        status.classList.toggle("text-red-600", Boolean(isError));
        status.classList.toggle("text-zinc-500", !isError);
    }

    function currentOptions() {
        return {
            theme: selectedValue("stripTheme", "classic"),
            format: selectedValue("stripFormat", "png"),
            quality: selectedValue("stripQuality", "high")
        };
    }

    async function setupDownloadPage() {
        const previewCanvas = document.getElementById("stripPreview");
        const downloadButton = document.getElementById("downloadPageButton");

        if (!previewCanvas || !downloadButton) return;

        let storedStrip;
        let previewUrlsRevoked = false;

        function revokePreviewUrls() {
            if (previewUrlsRevoked || !storedStrip?.objectUrls) return;

            storedStrip.objectUrls.forEach((url) => URL.revokeObjectURL(url));
            previewUrlsRevoked = true;
        }

        try {
            storedStrip = await loadStoredPhotos();
        } catch (error) {
            showStatus(error.message, true);
            downloadButton.disabled = true;
            return;
        }

        function renderPreview() {
            const options = currentOptions();
            renderStripToCanvas(previewCanvas, storedStrip.pairs, options, storedStrip.createdAt);
        }

        window.addEventListener("beforeunload", revokePreviewUrls, { once: true });

        document.querySelectorAll("input[name='stripTheme'], input[name='stripFormat'], input[name='stripQuality']")
            .forEach((input) => {
                input.addEventListener("change", renderPreview);
            });

        downloadButton.addEventListener("click", async () => {
            const options = currentOptions();
            const exportCanvas = document.createElement("canvas");
            let objectUrl = null;

            downloadButton.disabled = true;
            downloadButton.textContent = "Preparing...";

            try {
                renderStripToCanvas(exportCanvas, storedStrip.pairs, options, storedStrip.createdAt);
                const blob = await createBlob(exportCanvas, options.format);
                const link = document.createElement("a");

                objectUrl = URL.createObjectURL(blob);
                link.href = objectUrl;
                link.download = fileName(options.format);
                link.style.display = "none";
                document.body.appendChild(link);
                link.click();
                link.remove();
                showStatus("Downloaded your Boothly strip.", false);
                revokePreviewUrls();
            } catch (error) {
                console.error(error);
                showStatus(error.message || "Could not download your strip.", true);
            } finally {
                if (objectUrl) {
                    URL.revokeObjectURL(objectUrl);
                }

                exportCanvas.width = 0;
                exportCanvas.height = 0;
                exportCanvas.remove();
                downloadButton.disabled = false;
                downloadButton.textContent = "Download";
            }
        });

        renderPreview();
        showStatus("Preview ready.", false);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", setupDownloadPage);
    } else {
        setupDownloadPage();
    }

    window.BoothlyDownloader = {
        storeCapturedImagesAndRedirect
    };
}());
