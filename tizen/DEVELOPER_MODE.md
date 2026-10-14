# Samsung Smart TV Developer Mode & SDB Deployment Guide

This guide details the end-to-end procedure for deploying the **Multimedia Drive** native `.wgt` package onto a physical **Samsung Smart TV UN50NU7400** (Tizen 4.0 / Chromium M56 / Kant-M Architecture).

---

## 1. Prerequisites and Network Configuration

### Target Platform Specifications
- **Model**: Samsung UN50NU7400 (2018 4K Smart TV)
- **Operating System**: Tizen 4.0 (Tizen Web Engine Chromium M56)
- **Default SDB Daemon Port**: `26101`
- **SDB Discovery Port**: `26099`
- **Remote Web Inspector Port**: `9222`
- **App Package ID**: `tB7x9K3qL1.MultimediaDrive`

### Local Area Network (LAN) Setup
1. Connect both the Samsung Smart TV and your Development PC to the **same local Wi-Fi or Ethernet subnet**.
2. **Note the TV IP Address**:
   - On the TV: Go to `Settings` -> `General` -> `Network` -> `Network Status` -> `IP Settings`.
   - Example TV IP: `192.168.1.105`
3. **Note the Host PC IP Address**:
   - On the PC (PowerShell): Run `ipconfig` and note your IPv4 address.
   - Example Host PC IP: `192.168.1.50`
4. Ensure your local router does not have "AP Isolation" or "Guest Mode" enabled, which would block peer-to-peer traffic between the TV and your PC.

---

## 2. Activating Developer Mode on Samsung TV

To permit sideloading of native `.wgt` applications, activate Developer Mode using the secret numeric sequence:

1. Turn on the Samsung TV using the physical remote.
2. Press the **Home** (Smart Hub) button to open the bottom navigation bar.
3. Select and open the **Apps** icon.
4. On the Apps home screen, enter the numeric sequence using the remote's keypad:
   ```
   1 -> 2 -> 3 -> 4 -> 5
   ```
   *(If your remote lacks physical numeric buttons, press the `123` / TTX button to open the virtual on-screen keypad and enter 1 2 3 4 5).*
5. The **Developer Mode Configuration** modal dialog will pop up:
   - Toggle **Developer Mode** to **ON**.
   - In the **Host PC IP** field, enter your PC's IPv4 address: `192.168.1.50`.
   - Click **OK**.
6. **MANDATORY STEP — Power-Cycle Reboot**:
   - Hold the remote's **Power button** for 5 to 7 seconds continuously until the TV screen turns completely black and the Samsung UHD TV boot logo reappears.
   - Alternatively, disconnect the AC power cord from the wall outlet for 10 seconds and plug it back in.
   - *Note: Simply toggling standby with a single press does not restart the Tizen OS daemon; the SDB port `26101` will remain closed until a full reboot occurs.*

---

## 3. Smart Development Bridge (SDB) Setup & Connection

The Smart Development Bridge (`sdb`) is Samsung's CLI bridge for communicating with Tizen devices (analogous to Android's `adb`). It is included in the Samsung Tizen Studio CLI package.

### Step 3.1: Connect to the TV Daemon
Run the following command from your terminal:
```powershell
sdb connect 192.168.1.105:26101
```
*Expected output:*
```text
connecting to 192.168.1.105:26101 ...
connected to 192.168.1.105:26101
```

### Step 3.2: Verify Device Connection
Confirm that the TV is recognized and authorized:
```powershell
sdb devices
```
*Expected output:*
```text
List of devices attached
192.168.1.105:26101    device    UN50NU7400
```

---

## 4. Building and Installing the `.wgt` Package

### Step 4.1: Build the Application Package
From the project root directory, execute the turnkey packaging command:
```powershell
npm run package:tizen
```
This compiles the Chromium M56 frontend (`dist/client/`), validates `tizen/config.xml` and `tizen/icon.png`, and produces `dist/MultimediaDrive.wgt`.

### Step 4.2: Install Package onto Internal Flash Memory
Deploy the package directly to the TV:
```powershell
sdb install dist/MultimediaDrive.wgt
```
*Expected output:*
```text
pulled MultimediaDrive.wgt 100%
installing ...
app_id[tB7x9K3qL1.MultimediaDrive] install completed
100%
```

---

## 5. Application Lifecycle & Management Commands

### Launch Application on TV
```powershell
sdb shell 0 was_start tB7x9K3qL1.MultimediaDrive
```

### Terminate / Stop Running Application
```powershell
sdb shell 0 was_kill tB7x9K3qL1.MultimediaDrive
```

### List Installed Applications on TV
```powershell
sdb shell 0 app_launcher -l
```

### Uninstall Application from TV
```powershell
sdb uninstall tB7x9K3qL1.MultimediaDrive
```

---

## 6. Remote Web Inspector & Live Debugging

Because the application runs on Samsung's Chromium M56 engine, you can attach Google Chrome's developer tools for remote DOM, network, and console inspection:

1. Launch **Multimedia Drive** on the TV.
2. On your Host PC, open Google Chrome or Chromium.
3. Open `chrome://inspect` in the address bar.
4. Click **Configure...** next to "Discover network targets" and add:
   ```
   192.168.1.105:9222
   ```
5. Alternatively, navigate directly to `http://192.168.1.105:9222` to see the inspectable web view targets.
6. Click **Inspect** to examine real-time console logs, D-pad spatial navigation focus transitions, and HTTP Range 206 streaming chunks.

---

## 7. Troubleshooting & Error Codes Reference

| Error / Symptom | Root Cause | Resolution |
|---|---|---|
| `failed to connect to 192.168.1.105:26101` | TV was not rebooted after enabling Developer Mode | Hold physical remote Power button for 5s to reboot TV. Verify TV IP hasn't changed via DHCP. |
| `connection refused / timeout` | Windows Firewall or router blocking ports 26101 or 26099 | Add an inbound/outbound firewall rule for TCP port `26101` and UDP port `26099`. Disable router guest network isolation. |
| `closed` or device offline in `sdb devices` | TV screen turned off or entered low-power standby | Wake the TV with the remote and re-run `sdb connect <TV_IP>:26101`. |
| `install failed [-118]` | Host PC IP does not match Developer Mode setting on TV | Open `Apps -> 1 2 3 4 5` on TV, update the Host PC IP to match your current PC IPv4 address, and reboot the TV. |
| `install failed [-124]` or certificate signature error | TV is attempting to verify retail app signature | Ensure Developer Mode is toggled to ON. In Developer Mode, debug and unsigned `.wgt` packages are accepted without commercial Samsung certificates. |
| Return key exits application immediately | Missing `hwkey-event="enable"` in manifest | Verify that `<tizen:setting screen-orientation="landscape" hwkey-event="enable"/>` is present in `tizen/config.xml`. |
| Media keys (Play/Pause) not received | Missing input device privilege | Verify `<tizen:privilege name="http://tizen.org/privilege/tv.inputdevice"/>` is declared in `tizen/config.xml`. |
