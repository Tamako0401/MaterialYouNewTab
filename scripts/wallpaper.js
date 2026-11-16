/*
 * Material You New Tab
 * Copyright (c) 2024-2026 Prem, 2023-2025 XengShi
 * Licensed under the GNU General Public License v3.0 (GPL-3.0)
 * You should have received a copy of the GNU General Public License along with this program.
 * If not, see <https://www.gnu.org/licenses/>.
 */


// -------------------------- Wallpaper -----------------------------
const dbName = "ImageDB";
const storeName = "backgroundImages";
const timestampKey = "lastUpdateTime"; // Key to store last update time
const imageTypeKey = "imageType"; // Key to store the type of image ("random" or "upload")

let currentBgUrl = null;
let wallpaperChanged = false;

// To set background image using a Blob
function setBackground(blob) {
    setBackgroundUrl(URL.createObjectURL(blob));
}

function setBackgroundUrl(url) {
    const previousUrl = currentBgUrl;
    currentBgUrl = url;
    document.body.style.setProperty("--bg-image", `url(${url})`);
    toggleBackgroundType(true);
    if (previousUrl) {
        URL.revokeObjectURL(previousUrl);
    }
}

// Open IndexedDB database
function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);
        request.onupgradeneeded = function (event) {
            const db = event.target.result;
            db.createObjectStore(storeName);
        };
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject("Database error: " + event.target.errorCode);
    });
}

// Save image Blob, timestamp, and type to IndexedDB
async function saveImageToIndexedDB(imageBlob, isRandom) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, "readwrite");
        const store = transaction.objectStore(storeName);

        store.put(imageBlob, "backgroundImage");
        store.put(new Date().toISOString(), timestampKey);
        store.put(isRandom ? "random" : "upload", imageTypeKey);

        transaction.oncomplete = () => resolve();
        transaction.onerror = (event) => reject("Transaction error: " + event.target.errorCode);
    });
}

// Load image Blob, timestamp, and type from IndexedDB
async function loadImageAndDetails() {
    const db = await openDatabase();
    try {
        const store = db.transaction(storeName, "readonly").objectStore(storeName);
        return Promise.all([
            getFromStore(store, "backgroundImage"),
            getFromStore(store, timestampKey),
            getFromStore(store, imageTypeKey)
        ]);
    } finally {
        db.close();
    }
}

function getFromStore(store, key) {
    return new Promise((resolve, reject) => {
        const request = store.get(key);

        request.onsuccess = () => resolve(request.result);
        request.onerror = (event) => reject("Request error: " + event.target.errorCode);
    });
}

// Clear image data from IndexedDB
async function clearImageFromIndexedDB() {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, "readwrite");
        const store = transaction.objectStore(storeName);
        store.delete("backgroundImage");
        store.delete(timestampKey);
        store.delete(imageTypeKey);

        transaction.oncomplete = () => resolve();
        transaction.onerror = (event) => reject("Delete error: " + event.target.errorCode);
    });
}

// Fetch and apply random image as background
const RANDOM_IMAGE_URL = "https://picsum.photos/1920/1080";

async function applyRandomImage(showConfirmation = true) {
    if (showConfirmation && !(await confirmPrompt(
        translations[currentLanguage]?.confirmWallpaper || translations["en"].confirmWallpaper
    ))) {
        return;
    }
    if (showConfirmation) {
        wallpaperChanged = true;
    }
    try {
        const response = await fetch(RANDOM_IMAGE_URL);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const blob = await response.blob();
        if (!showConfirmation && wallpaperChanged) {
            return;
        }
        await saveImageToIndexedDB(blob, true);
        setBackground(blob);
    } catch (error) {
        console.error("Error fetching random image:", error);
    }
}

// Function to update the background type attribute
function toggleBackgroundType(hasWallpaper) {
    document.body.setAttribute("data-bg", hasWallpaper ? "wallpaper" : "color");
}

// Start the cache read in the head while the rest of the new tab is parsing.
const wallpaperDOMReady = new Promise(resolve => {
    document.addEventListener("DOMContentLoaded", resolve, { once: true });
});
const initialWallpaper = loadInitialWallpaper();

async function loadInitialWallpaper() {
    let url;
    let refreshRandom = false;
    try {
        const [blob, savedTimestamp, imageType] = await loadImageAndDetails();
        const lastUpdate = new Date(savedTimestamp);
        if (!(blob instanceof Blob) || !savedTimestamp || isNaN(lastUpdate)) {
            return false;
        }

        refreshRandom = imageType !== "upload" &&
            lastUpdate.toDateString() !== new Date().toDateString();
        url = URL.createObjectURL(blob);
        const image = new Image();
        image.src = url;
        await image.decode();
        await wallpaperDOMReady;

        if (wallpaperChanged) {
            URL.revokeObjectURL(url);
            return false;
        }
        setBackgroundUrl(url);
    } catch (error) {
        if (url) {
            URL.revokeObjectURL(url);
        }
        console.warn("Unable to load saved wallpaper:", error);
    }
    return refreshRandom;
}

async function waitForInitialWallpaper() {
    let timeoutId;
    const timeout = new Promise(resolve => {
        timeoutId = setTimeout(resolve, 1000);
    });
    await Promise.race([initialWallpaper, timeout]);
    clearTimeout(timeoutId);
}

initialWallpaper.then(refreshRandom => {
    if (refreshRandom && !wallpaperChanged) {
        applyRandomImage(false);
    }
});

document.addEventListener("DOMContentLoaded", () => {
    const imageUpload = document.getElementById("imageUpload");
    imageUpload.addEventListener("change", event => {
        const file = event.target.files[0];
        if (file) {
            wallpaperChanged = true;
            saveImageToIndexedDB(file, false)
                .then(() => setBackground(file))
                .catch(error => console.error(error));
        }
    });

    document.getElementById("uploadTrigger").addEventListener("click", () => imageUpload.click());

    document.getElementById("clearImage").addEventListener("click", async () => {
        try {
            const [blob] = await loadImageAndDetails();
            if (!blob) {
                await alertPrompt(translations[currentLanguage]?.Nobackgroundset || translations["en"].Nobackgroundset);
                return;
            }

            const confirmationMessage = translations[currentLanguage]?.clearbackgroundimage || translations["en"].clearbackgroundimage;
            if (await confirmPrompt(confirmationMessage)) {
                wallpaperChanged = true;
                await clearImageFromIndexedDB();
                if (currentBgUrl) {
                    URL.revokeObjectURL(currentBgUrl);
                    currentBgUrl = null;
                }
                document.body.style.removeProperty("--bg-image");
                toggleBackgroundType(false);
            }
        } catch (error) {
            console.error(error);
        }
    });

    document.getElementById("randomImageTrigger").addEventListener("click", () => applyRandomImage());
}, { once: true });
