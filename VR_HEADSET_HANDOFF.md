# DNA Builder VR headset handoff

Updated for the current VR changes: August 3, 2026.

This README is for someone who receives `DNA_Builder_today_changes_2026-07-31.zip` and needs to set up the DNA Builder VR demo on their own laptop with a Meta Quest 3.

Important: `DNA_Builder_today_changes_2026-07-31.zip` is a changes-only ZIP. It does not contain the whole DNA Builder project. Apply it on top of the full `yangha7/DNA_Builder` project first.

## What the ZIP adds/updates

The ZIP updates the VR lab with:

- Meta Quest 3 WebXR viewing for DNA molecules.
- Desktop Quest emulator for testing without a headset.
- Base-colored DNA atoms:
  - A = cyan
  - T = orange
  - G = green
  - C = magenta
- Element and chain color modes.
- Outlined/glowing atom spheres so colors separate better in VR.
- Thin inferred bond segments between nearby atoms.
- Perspective presets: front/helix, side, top, and isometric.
- Separate mouse modes:
  - `Spin DNA`: drag spins the molecule itself.
  - `Move camera`: drag orbits the camera.
- Spin axis selector for X, Y, or Z rotation.
- `Reset to X axis` and `Reset to Y axis` buttons.
- Auto-spin on the selected axis.
- Laptop mirror page at `/mirror` so observers can watch while someone wears the headset.

## What this VR version does not replace yet

The VR app is not the full browser DNA Builder GUI. It is mainly for VR viewing, scale testing, rotation, color visibility, and demo interaction.

Missing compared with the full browser app:

- No full classifier sidebar.
- No helical-parameter table/visualization tools.
- No file import/export controls in the VR UI.
- No distance/fingerprint tools.
- No advanced analysis panels.

The VR page can build DNA from sequence/form input, but it depends on the Python Flask DNA Builder API running in the background.

## Prerequisites

Install these on the laptop:

- Python 3
- Node.js 20+ and npm
- Meta Quest Browser on the Quest 3
- `cloudflared` if launching wirelessly through a temporary HTTPS tunnel

For `cloudflared`, Cloudflare’s official downloads page is:

```text
https://developers.cloudflare.com/tunnel/downloads/
```

On macOS with Homebrew, Cloudflare documents:

```bash
brew install cloudflared
```

## Step 1: get the full DNA Builder project

Option A, with Git:

```bash
cd ~/Downloads
git clone https://github.com/yangha7/DNA_Builder.git
cd DNA_Builder
```

Option B, without Git:

1. Open this repo in a browser:

   ```text
   https://github.com/yangha7/DNA_Builder
   ```

2. Click `Code` → `Download ZIP`.
3. Unzip it.
4. Open Terminal inside the unzipped folder. It may be named `DNA_Builder-main`.

## Step 2: apply today's VR changes ZIP

Put `DNA_Builder_today_changes_2026-07-31.zip` next to the full DNA Builder folder, then unzip it into the project root.

If the project folder is `~/Downloads/DNA_Builder`:

```bash
cd ~/Downloads/DNA_Builder
unzip -o ../DNA_Builder_today_changes_2026-07-31.zip
```

If the GitHub ZIP folder is `~/Downloads/DNA_Builder-main`:

```bash
cd ~/Downloads/DNA_Builder-main
unzip -o ../DNA_Builder_today_changes_2026-07-31.zip
```

After this, the project should contain:

```text
vr/src/mirror.html
vr/src/mirror.js
VR_HEADSET_HANDOFF.md
```

## Step 3: start the DNA Builder API

Open Terminal 1 from the project root:

```bash
python3 -m venv .venv
.venv/bin/pip install -r gui/requirements.txt
.venv/bin/python gui/app.py
```

Leave this running. The API should be available at:

```text
http://localhost:5052
```

Windows PowerShell equivalent:

```powershell
py -m venv .venv
.\.venv\Scripts\pip install -r gui\requirements.txt
.\.venv\Scripts\python gui\app.py
```

## Step 4: start the VR app

Open Terminal 2:

```bash
cd vr
npm install
npm run dev
```

Leave this running. The VR app should be available on the laptop at:

```text
http://localhost:8081
```

The laptop mirror page is:

```text
http://localhost:8081/mirror
```

## Step 5: make it wireless for the Quest

Open Terminal 3 from the project root:

```bash
cloudflared tunnel --protocol http2 --url http://localhost:8081
```

Cloudflare will print a temporary HTTPS URL that looks like:

```text
https://something-random.trycloudflare.com
```

That URL is the one to open in the Meta Quest Browser.

Important: keep Terminal 3 open. If it closes, the Quest URL stops working.

## Step 6: launch on the Meta Quest 3

1. Put on the headset.
2. Connect the Quest to Wi-Fi.
3. Open Meta Quest Browser.
4. Type the temporary Cloudflare URL from Terminal 3:

   ```text
   https://something-random.trycloudflare.com
   ```

5. Wait for the DNA Builder Quest Lab page to load.
6. Build or use the default DNA sequence.
7. Press `Enter VR`.
8. Use the controllers to interact with the molecule.

Do not open `localhost:8081` inside the Quest when using wireless Cloudflare. On the headset, `localhost` means the headset itself, not the laptop.

## Show the VR view on the laptop

On the laptop, open the same Cloudflare URL with `/mirror` at the end:

```text
https://something-random.trycloudflare.com/mirror
```

Use `Fullscreen mirror` for demos or screen recording.

Best demo setup:

1. Laptop opens `/mirror`.
2. Quest opens the main URL.
3. Quest user presses `Enter VR`.
4. Laptop mirror updates as the Quest page publishes the model and pose.

## Controls

### Desktop / laptop

- `Spin DNA` mode:
  - left-drag = spin the DNA on the selected axis
  - mouse wheel = zoom
  - right-drag = pan
- `Move camera` mode:
  - left-drag = orbit the camera
- `Spin axis`:
  - Z = helix roll
  - Y = left/right spin
  - X = pitch spin
- `Reset to X axis` and `Reset to Y axis` snap the helix onto that axis.
- `Auto-spin` continuously rotates the molecule on the selected axis.
- `Reset pose` restores the default scene pose.

### Quest

- Press `Enter VR` from the page.
- Use the Quest controllers to grab/release the molecule.
- If the scene feels too dark, use `Base colors` and look for the outlined/glowing atom spheres and thin bond lines.

## Troubleshooting checklist

### `unzip` says files were replaced

That is expected. The changes ZIP intentionally overwrites the VR files from the base repo.

### The Quest URL does not load

- Make sure Terminal 3 is still running.
- Use the newest Cloudflare URL. The URL changes every time the tunnel restarts.
- Make sure the URL starts with `https://`.
- Make sure the Quest is connected to Wi-Fi.
- Reload the Quest Browser page.

### The page loads, but building DNA fails

The Python API is probably not running.

Check Terminal 1. It should still be running:

```bash
.venv/bin/python gui/app.py
```

The API should be reachable at:

```text
http://localhost:5052
```

### The VR page does not load locally

Check Terminal 2. It should still be running:

```bash
npm run dev
```

The local VR app should be reachable at:

```text
http://localhost:8081
```

### `cloudflared` command not found

Install `cloudflared`, then open a new Terminal and try again.

On macOS with Homebrew:

```bash
brew install cloudflared
```

Official downloads:

```text
https://developers.cloudflare.com/tunnel/downloads/
```

### The headset says VR is unavailable

- Make sure you opened the Cloudflare `https://...trycloudflare.com` URL, not a plain HTTP LAN URL.
- Try reloading the page.
- Try closing and reopening Meta Quest Browser.
- Make sure you are using Meta Quest Browser, not a non-VR browser.

### The laptop mirror is blank

- Open the mirror page:

  ```text
  https://something-random.trycloudflare.com/mirror
  ```

- Then open or reload the main VR page in the Quest.
- Build DNA or press `Reset pose` on the VR page to publish a fresh state.

### Colors are hard to see in the headset

- Keep `Color mode` set to `Base colors`.
- Use the base legend:
  - A cyan
  - T orange
  - G green
  - C magenta
- The current build adds outlines and glow shells to make the atoms easier to distinguish. If the headset still looks washed out, increase headset brightness or test in a darker room.

## Security note

The Cloudflare tunnel URL is temporary and public while Terminal 3 is running. Do not share it broadly. Stop the tunnel by pressing `Ctrl-C` in Terminal 3 when the demo is finished.

