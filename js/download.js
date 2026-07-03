(function () {
    const PHOTO_COUNT = 4;
    const JPEG_QUALITY = 0.92;
    const DB_NAME = "BoothlyDB";
    const DB_VERSION = 1;
    const CAPTURE_STORE = "captures";
    const CURRENT_STRIP_KEY = "currentStrip";

    const THEMES = {
        classic: {
            page: "#f6f7fb",
            strip: "#ffffff",
            text: "#111827",
            muted: "#64748b",
            border: "#d7dce5",
            frame: "#ffffff",
            divider: "#e5e7eb",
            shadow: "rgba(15,23,42,0.18)"
        },
        minimal: {
            page: "#ffffff",
            strip: "#ffffff",
            text: "#18181b",
            muted: "#71717a",
            border: "#e4e4e7",
            frame: "#fafafa",
            divider: "#eeeeee",
            shadow: "rgba(24,24,27,0.1)"
        },
        vintage: {
            page: "#f3ead7",
            strip: "#fff8e7",
            text: "#3b2f2f",
            muted: "#806b57",
            border: "#d4b98d",
            frame: "#fffdf4",
            divider: "#dec99e",
            shadow: "rgba(92,64,51,0.18)"
        },
        dark: {
            page: "#111827",
            strip: "#171717",
            text: "#f8fafc",
            muted: "#cbd5e1",
            border: "#3f3f46",
            frame: "#0f172a",
            divider: "#334155",
            shadow: "rgba(0,0,0,0.4)"
        }
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

            window.location.href = "download.html";
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

    function drawCroppedImage(ctx, image, x, y, width, height, radius) {
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

        ctx.save();
        drawRoundedRect(ctx, x, y, width, height, radius);
        ctx.clip();
        ctx.drawImage(image, sx, sy, sw, sh, x, y, width, height);
        ctx.restore();
    }

    function stripMetrics(pairs, quality) {
        const baseWidth = Math.max(...pairs.map((pair) => Math.max(pair.my.width, pair.friend.width)));
        const baseHeight = Math.max(...pairs.map((pair) => Math.max(pair.my.height, pair.friend.height)));
        const scale = quality === "standard" ? 0.5 : 1;
        const photoWidth = Math.max(1, Math.round(baseWidth * scale));
        const photoHeight = Math.max(1, Math.round(baseHeight * scale));
        const columnGap = Math.max(36, Math.round(photoWidth * 0.045));
        const rowGap = Math.max(34, Math.round(photoHeight * 0.052));
        const padding = Math.max(76, Math.round(photoWidth * 0.08));
        const headerHeight = Math.max(190, Math.round(photoHeight * 0.24));
        const labelHeight = Math.max(74, Math.round(photoHeight * 0.1));
        const footerHeight = Math.max(150, Math.round(photoHeight * 0.2));
        const width = padding * 2 + photoWidth * 2 + columnGap;
        const height = headerHeight + labelHeight + photoHeight * PHOTO_COUNT + rowGap * (PHOTO_COUNT - 1) + footerHeight;

        return {
            width,
            height,
            photoWidth,
            photoHeight,
            columnGap,
            rowGap,
            padding,
            headerHeight,
            labelHeight,
            footerHeight,
            radius: Math.max(22, Math.round(photoWidth * 0.035))
        };
    }

    function drawHeader(ctx, metrics, theme) {
        const titleSize = Math.max(54, Math.round(metrics.photoWidth * 0.08));
        const subtitleSize = Math.max(28, Math.round(metrics.photoWidth * 0.042));

        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = theme.text;
        ctx.font = `800 ${titleSize}px Inter, system-ui, sans-serif`;
        ctx.fillText("BOOTHLY", metrics.width / 2, metrics.headerHeight * 0.38);

        ctx.fillStyle = theme.muted;
        ctx.font = `500 ${subtitleSize}px Inter, system-ui, sans-serif`;
        ctx.fillText("Memories Together", metrics.width / 2, metrics.headerHeight * 0.66);

        ctx.strokeStyle = theme.border;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(metrics.padding, metrics.headerHeight - 22);
        ctx.lineTo(metrics.width - metrics.padding, metrics.headerHeight - 22);
        ctx.stroke();
    }

    function drawLabels(ctx, metrics, theme, leftX, rightX) {
        const labelHeight = Math.max(48, Math.round(metrics.labelHeight * 0.65));
        const labelTop = metrics.headerHeight + 4;
        const labelSize = Math.max(22, Math.round(metrics.photoWidth * 0.034));

        ctx.fillStyle = theme.text;
        ctx.font = `700 ${labelSize}px Inter, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        [leftX, rightX].forEach((x) => {
            ctx.strokeStyle = theme.border;
            ctx.lineWidth = 2;
            drawRoundedRect(ctx, x, labelTop, metrics.photoWidth, labelHeight, 16);
            ctx.stroke();
        });

        ctx.fillText("Me", leftX + metrics.photoWidth / 2, labelTop + labelHeight / 2);
        ctx.fillText("Friend", rightX + metrics.photoWidth / 2, labelTop + labelHeight / 2);
    }

    function drawPhotoFrame(ctx, image, x, y, metrics, theme) {
        ctx.save();
        ctx.shadowColor = theme.shadow;
        ctx.shadowBlur = Math.max(14, Math.round(metrics.photoWidth * 0.025));
        ctx.shadowOffsetY = Math.max(8, Math.round(metrics.photoHeight * 0.015));
        ctx.fillStyle = theme.frame;
        drawRoundedRect(ctx, x - 12, y - 12, metrics.photoWidth + 24, metrics.photoHeight + 24, metrics.radius + 6);
        ctx.fill();
        ctx.restore();

        drawCroppedImage(ctx, image, x, y, metrics.photoWidth, metrics.photoHeight, metrics.radius);

        ctx.strokeStyle = theme.border;
        ctx.lineWidth = 2;
        drawRoundedRect(ctx, x, y, metrics.photoWidth, metrics.photoHeight, metrics.radius);
        ctx.stroke();
    }

    function drawFooter(ctx, metrics, theme, createdAt) {
        const capturedAt = createdAt ? new Date(createdAt) : new Date();
        const date = capturedAt.toLocaleDateString(undefined, {
            year: "numeric",
            month: "long",
            day: "numeric"
        });
        const time = capturedAt.toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit"
        });
        const footerSize = Math.max(22, Math.round(metrics.photoWidth * 0.034));

        ctx.strokeStyle = theme.border;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(metrics.padding, metrics.height - metrics.footerHeight + 8);
        ctx.lineTo(metrics.width - metrics.padding, metrics.height - metrics.footerHeight + 8);
        ctx.stroke();

        ctx.fillStyle = theme.muted;
        ctx.font = `600 ${footerSize}px Inter, system-ui, sans-serif`;
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.fillText(date, metrics.padding, metrics.height - metrics.footerHeight * 0.56);
        ctx.fillText(time, metrics.padding, metrics.height - metrics.footerHeight * 0.28);

        ctx.textAlign = "right";
        ctx.fillStyle = theme.text;
        ctx.fillText("Made with Boothly", metrics.width - metrics.padding - footerSize * 1.55, metrics.height - metrics.footerHeight * 0.28);

        ctx.save();
        ctx.translate(metrics.width - metrics.padding - footerSize * 0.72, metrics.height - metrics.footerHeight * 0.34);
        ctx.scale(Math.max(1, footerSize / 22), Math.max(1, footerSize / 22));
        ctx.fillStyle = "#ef4444";
        ctx.beginPath();
        ctx.moveTo(0, 8);
        ctx.bezierCurveTo(-24, -10, -4, -24, 0, -10);
        ctx.bezierCurveTo(4, -24, 24, -10, 0, 8);
        ctx.fill();
        ctx.restore();
    }

    function renderStripToCanvas(canvas, pairs, options, createdAt) {
        const theme = THEMES[options.theme] || THEMES.classic;
        const metrics = stripMetrics(pairs, options.quality);
        const leftX = metrics.padding;
        const rightX = metrics.padding + metrics.photoWidth + metrics.columnGap;
        let rowY = metrics.headerHeight + metrics.labelHeight;

        canvas.width = metrics.width;
        canvas.height = metrics.height;

        const ctx = canvas.getContext("2d");

        ctx.fillStyle = theme.page;
        ctx.fillRect(0, 0, metrics.width, metrics.height);

        ctx.save();
        ctx.shadowColor = theme.shadow;
        ctx.shadowBlur = Math.max(36, Math.round(metrics.photoWidth * 0.04));
        ctx.shadowOffsetY = Math.max(18, Math.round(metrics.photoHeight * 0.025));
        ctx.fillStyle = theme.strip;
        drawRoundedRect(ctx, 28, 28, metrics.width - 56, metrics.height - 56, Math.max(42, Math.round(metrics.photoWidth * 0.04)));
        ctx.fill();
        ctx.restore();

        drawHeader(ctx, metrics, theme);
        drawLabels(ctx, metrics, theme, leftX, rightX);

        pairs.forEach((pair, index) => {
            drawPhotoFrame(ctx, pair.my, leftX, rowY, metrics, theme);
            drawPhotoFrame(ctx, pair.friend, rightX, rowY, metrics, theme);
            rowY += metrics.photoHeight + metrics.rowGap;

            if (index < pairs.length - 1) {
                ctx.strokeStyle = theme.divider;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(metrics.padding, rowY - metrics.rowGap / 2);
                ctx.lineTo(metrics.width - metrics.padding, rowY - metrics.rowGap / 2);
                ctx.stroke();
            }
        });

        drawFooter(ctx, metrics, theme, createdAt);

        return metrics;
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
