# Dining Tableware Alignment (OCD Experience) — Mobile Demo Variant

A 100% client-side web application designed to run directly on a smartphone (iPhone or Android) for live demonstration and high-quality video recording, without requiring any local Python server or desktop hardware.

---

## Key Features

* **In-Browser YOLOv8n AI:** Runs `yolov8n.onnx` directly inside the mobile browser via **ONNX Runtime Web** (WASM / WebGL).
* **Rear Camera Tracking:** Automatically selects the phone's high-resolution back camera (`facingMode: 'environment'`).
* **Real-Time Explainability HUD:** Shows live fork/spoon axes, target normal, degrees off-axis ($\Delta\theta$), and plain-English reasons for disharmony.
* **Dual-Channel Stereo Soundscape:** Left Ear = Fork tension, Right Ear = Spoon tension via Web Audio API.
* **1-Tap Demo Video Recorder:** Tap **"Record Demo"** to capture the camera stream, detection overlay, and stereo audio into a `.mp4` / `.webm` video file saved directly to your phone's camera roll or downloads.
* **Installable PWA:** Can be added to the phone home screen as a standalone app with no browser URL bars.

---

## Clean Recording & Screen Capture Controls

When recording a demo video (or screen recording on iOS/Android):

* **👁️ Hide UI:** Fades out all HTML boxes, status cards, and action buttons so your phone screen is 100% clean. Tapping anywhere on the screen (or tapping the subtle `👁️ Show UI` pill in the top corner) immediately brings the UI back.
* **📐 Lines On / Lines Off:** Toggles the AR tracking lines (fork/spoon/bowl overlays) on or off. You can record with the tracking lines visible or in a clean raw camera mode.
* **— / + Minimize Card:** Collapses the explainability text box into a compact view while keeping the left/right tension meters visible.

---

## Quick Start on GitHub Pages (Instant 2-Minute Setup)

### 1. Create a GitHub Repository
1. On GitHub, create a new public repository (e.g. `tableware-ocd-demo`).
2. Clone or initialize the repository in this folder:
   ```bash
   cd c:\Users\valen\Downloads\desk-tension\tray-tension-mobile
   git init
   git add .
   git commit -m "Initial commit for mobile tableware OCD demo"
   git branch -M main
   git remote add origin https://github.com/<your-username>/tableware-ocd-demo.git
   git push -u origin main
   ```

### 2. Enable GitHub Pages
1. Go to your repository on GitHub.
2. Click **Settings** $\rightarrow$ **Pages** (in the left sidebar).
3. Under **Build and deployment**:
   * **Source:** `Deploy from a branch`
   * **Branch:** `main` / `/ (root)`
4. Click **Save**.
5. Within ~30 seconds, GitHub gives you a live URL:
   `https://<your-username>.github.io/tableware-ocd-demo/`

---

## How to Use on Your Phone

1. **Open the URL:** Open the GitHub Pages link in **Safari (iOS)** or **Chrome (Android)**.
2. **Allow Camera:** When prompted, allow camera permissions.
3. **Turn On Audio:** Tap anywhere or tap the **"Audio"** button to start the stereo soundscape.
4. **Point at Tray:** Point the phone at the tray on your desk:
   * **Green** lines & checkmarks = aligned ($\le 2.5^\circ$).
   * **Orange** lines & warnings = misaligned ($> 2.5^\circ$).
5. **Record a Demo Video:**
   * Tap the **"Record Demo"** button. The red dot will pulse and a timer will count up.
   * Move or straighten cutlery to demonstrate the shift between harmony and dissonance.
   * Tap **"Stop & Save"**. The video (with audio and HUD overlay) will automatically download to your phone!

---

## (Optional) Convert to Android APK

If you need a standalone `.apk` file for submission:
1. Open [https://www.pwabuilder.com/](https://www.pwabuilder.com/) on your computer.
2. Enter your live GitHub Pages URL.
3. Click **Package for Android**.
4. Download the signed `.apk` or Android Studio bundle.
