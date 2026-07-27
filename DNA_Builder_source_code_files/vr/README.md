# DNA Builder Quest Lab

This directory contains a desktop WebXR testing environment for the Meta Quest 3. It uses Meta's [Immersive Web Emulation Runtime (IWER)](https://github.com/meta-quest/immersive-web-emulation-runtime) and developer UI to simulate a Quest 3 headset and Touch Plus controllers when native WebXR is unavailable.

The VR frontend calls the existing Flask `/api/build` endpoint through the local development proxy, so molecular construction remains in Python.

## Run the virtual Quest environment

Prerequisites: Node.js 20+, npm 10+, and the Python environment described in the project README.

Start the Flask API from the project root:

```bash
.venv/bin/python gui/app.py
```

In another terminal, start the VR lab:

```bash
cd vr
npm install
npm run dev
```

Open `http://localhost:8081`.

1. Build a DNA sequence.
2. Click **Enter VR**.
3. Open **Play Mode** in the IWER developer toolbar.
4. Move the virtual headset and Quest controllers.
5. Hold either controller trigger or grip to grab the DNA; release it to leave the molecule in place.

The mouse still provides orbit and zoom controls outside an immersive session.

## Production build

```bash
npm run build
```

The compiled static frontend is written to `vr/dist/`. A production deployment must serve this frontend over HTTPS and route `/api/*` to the Flask service.

## Test on a physical Quest 3

The recommended local-device path is USB + ADB reverse. This makes the Quest Browser see the app as `localhost`, which is treated as a trustworthy origin for WebXR development.

Prerequisites:

- Meta Quest 3 with Developer Mode enabled.
- USB-C cable from Quest to this Mac.
- `adb` installed via Android Platform Tools or Meta Quest Developer Hub.

Start the Flask API:

```bash
cd /Users/kevinfang/Documents/Codex/DNA_Builder
.venv/bin/python gui/app.py
```

Start the VR server in another terminal:

```bash
cd /Users/kevinfang/Documents/Codex/DNA_Builder/vr
npm run dev
```

Plug in the Quest, put on the headset, and accept the USB debugging prompt. Then run:

```bash
cd /Users/kevinfang/Documents/Codex/DNA_Builder/vr
npm run quest:reverse
```

In Meta Quest Browser, open:

```text
http://localhost:8081
```

Then click **Enter VR**. The emulator automatically stays disabled when native immersive WebXR is detected.

### Same-Wi-Fi fallback

The server also prints same-Wi-Fi URLs such as `http://192.168.x.x:8081`. A real Quest may not expose WebXR APIs on a plain HTTP LAN URL because WebXR requires a secure context. Use the USB `localhost` route above unless you set up HTTPS or explicitly configure Quest Browser's insecure-origin development flag.
