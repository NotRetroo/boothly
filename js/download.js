const DOWNLOAD_BUTTON_ID = "downloadBtn";
const DOWNLOAD_BUTTON_LABEL_ID = "downloadBtnLabel";
const DOWNLOAD_BUTTON_LOADER_ID = "downloadBtnLoader";
const CANVAS_PRESETS = [
    { me: "myCanvas1", friend: "friendCanvas1" },
    { me: "myCanvas2", friend: "friendCanvas2" },
    { me: "myCanvas3", friend: "friendCanvas3" },
    { me: "myCanvas4", friend: "friendCanvas4" }
];

const downloadButton = document.getElementById(DOWNLOAD_BUTTON_ID);
const downloadButtonLabel = document.getElementById(DOWNLOAD_BUTTON_LABEL_ID);
const downloadButtonLoader = document.getElementById(DOWNLOAD_BUTTON_LOADER_ID);

function createToast(message) {
    const containerId = "boothly-toast-container";
    let container = document.getElementById(containerId);

    if (!container) {
        container = document.createElement("div");
        container.id = containerId;
        container.style.position = "fixed";
        container.style.top = "20px";
        container.style.right = "20px";
        container.style.zIndex = "9999";
        container.style.display = "flex";
        container.style.flexDirection = "column";
        container.style.alignItems = "flex-end";
        document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.textContent = message;
    toast.style.background = "rgba(255,255,255,0.95)";
    toast.style.color = "#111827";
    toast.style.padding = "14px 18px";
    toast.style.marginTop = "10px";
    toast.style.borderRadius = "18px";
    toast.style.boxShadow = "0 16px 48px rgba(15, 23, 42, 0.12)";
    toast.style.fontSize = "14px";
    toast.style.fontWeight = "600";
    toast.style.maxWidth = "320px";
    toast.style.textAlign = "right";
    toast.style.opacity = "1";
    toast.style.transition = "opacity 240ms ease, transform 240ms ease";

    container.appendChild(toast);

    window.setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateY(-8px)";
        window.setTimeout(() => {
            if (container.contains(toast)) {
                container.removeChild(toast);
            }
        }, 280);
    }, 3000);
}

function getCanvasPairs() {
    return CANVAS_PRESETS.map(({ me, friend }) => {
        const myCanvas = document.getElementById(me);
        const friendCanvas = document.getElementById(friend);
        return { myCanvas, friendCanvas };
    });
}

function validateCanvasPair(pair) {
    if (!pair.myCanvas || !pair.friendCanvas) {
        throw new Error("Missing capture canvases.");
    }
    if (!pair.myCanvas.width || !pair.myCanvas.height) {
        throw new Error("Local capture not ready.");
    }
    if (!pair.friendCanvas.width || !pair.friendCanvas.height) {
        throw new Error("Friend capture not ready.");
    }
}

function formatFileName() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hour = String(now.getHours()).padStart(2, "0");
    const minute = String(now.getMinutes()).padStart(2, "0");
    return `Boothly_${year}-${month}-${day}_${hour}-${minute}.png`;
}

function createExportCanvas(width, height, scale) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    return canvas;
}

function getRenderedDimensions(pairs, padding, columnGap, rowGap) {
    const rowHeights = pairs.map(({ myCanvas, friendCanvas }) => Math.max(myCanvas.height, friendCanvas.height));
    const leftWidth = Math.max(...pairs.map(({ myCanvas }) => myCanvas.width));
    const rightWidth = Math.max(...pairs.map(({ friendCanvas }) => friendCanvas.width));
    const totalWidth = leftWidth + rightWidth + columnGap + padding * 2;
    const totalHeight = rowHeights.reduce((sum, h) => sum + h, 0) + rowGap * (rowHeights.length - 1) + padding * 2 + 160;
    return { totalWidth, totalHeight, leftWidth, rightWidth, rowHeights };
}

async function composePhotoStrip() {
    const pairs = getCanvasPairs();
    pairs.forEach(validateCanvasPair);

    const padding = 40;
    const columnGap = 18;
    const rowGap = 18;
    const scale = Math.max(1, window.devicePixelRatio || 1);

    const { totalWidth, totalHeight, leftWidth, rightWidth, rowHeights } = getRenderedDimensions(pairs, padding, columnGap, rowGap);
    const exportCanvas = createExportCanvas(totalWidth, totalHeight, scale);
    const ctx = exportCanvas.getContext("2d");
    ctx.scale(scale, scale);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, totalWidth, totalHeight);

    const borderRadius = 32;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(borderRadius, 0);
    ctx.lineTo(totalWidth - borderRadius, 0);
    ctx.quadraticCurveTo(totalWidth, 0, totalWidth, borderRadius);
    ctx.lineTo(totalWidth, totalHeight - borderRadius);
    ctx.quadraticCurveTo(totalWidth, totalHeight, totalWidth - borderRadius, totalHeight);
    ctx.lineTo(borderRadius, totalHeight);
    ctx.quadraticCurveTo(0, totalHeight, 0, totalHeight - borderRadius);
    ctx.lineTo(0, borderRadius);
    ctx.quadraticCurveTo(0, 0, borderRadius, 0);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#111827";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 36px Inter, system-ui, -apple-system";
    ctx.fillText("Boothly", totalWidth / 2, padding + 26);

    ctx.font = "500 18px Inter, system-ui, -apple-system";
    ctx.fillStyle = "#475569";
    ctx.fillText("Memories Together", totalWidth / 2, padding + 66);

    let rowY = padding + 100;
    pairs.forEach((pair, index) => {
        const rowHeight = rowHeights[index];
        const leftX = padding;
        const rightX = padding + leftWidth + columnGap;
        const leftY = rowY + (rowHeight - pair.myCanvas.height) / 2;
        const rightY = rowY + (rowHeight - pair.friendCanvas.height) / 2;

        ctx.fillStyle = "#f8fafc";
        ctx.fillRect(leftX - 12, rowY - 12, leftWidth + 24, rowHeight + 24);
        ctx.fillRect(rightX - 12, rowY - 12, rightWidth + 24, rowHeight + 24);

        ctx.drawImage(pair.myCanvas, leftX, leftY, pair.myCanvas.width, pair.myCanvas.height);
        ctx.drawImage(pair.friendCanvas, rightX, rightY, pair.friendCanvas.width, pair.friendCanvas.height);

        if (index < pairs.length - 1) {
            rowY += rowHeight + rowGap;
            ctx.strokeStyle = "#e2e8f0";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(padding, rowY - rowGap / 2);
            ctx.lineTo(totalWidth - padding, rowY - rowGap / 2);
            ctx.stroke();
        }
    });

    ctx.fillStyle = "#475569";
    ctx.font = "600 16px Inter, system-ui, -apple-system";
    ctx.textAlign = "left";
    ctx.fillText("📅 " + new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }), padding, totalHeight - padding - 40);
    ctx.fillText("🕒 " + new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }), padding, totalHeight - padding - 16);

    ctx.textAlign = "right";
    ctx.fillText("❤️ Made with Boothly", totalWidth - padding, totalHeight - padding - 16);

    return exportCanvas;
}

function createBlob(canvas) {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (!blob) {
                reject(new Error("Failed to create PNG blob."));
                return;
            }
            resolve(blob);
        }, "image/png");
    });
}

async function downloadPhotoStrip() {
    if (!downloadButton || !downloadButtonLabel || !downloadButtonLoader) {
        return;
    }

    downloadButton.disabled = true;
    downloadButton.classList.add("opacity-50", "cursor-not-allowed");
    downloadButtonLabel.textContent = "Preparing...";
    downloadButtonLoader.classList.remove("hidden");

    try {
        const exportCanvas = await composePhotoStrip();
        const blob = await createBlob(exportCanvas);

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = formatFileName();
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);

        createToast("Your memories have been downloaded ❤️");
    } catch (error) {
        console.error(error);
        createToast(error.message || "Download failed.");
    } finally {
        downloadButtonLabel.textContent = "Download";
        downloadButtonLoader.classList.add("hidden");
        downloadButton.classList.remove("opacity-50", "cursor-not-allowed");
        downloadButton.disabled = false;
    }
}

window.BoothlyDownloader = {
    downloadPhotoStrip
};
