# WorkBuddy Auto Theme

[简体中文](README.md) · [Releases](https://github.com/chillboy67/workbuddy-auto-theme/releases)

A small, reversible macOS patch that makes WorkBuddy follow the system's light and dark appearance. Keeps the native interface. No third-party runtime dependencies, background daemon, login item, or persistent debugging port.

**WorkBuddy 5.9.2:** the native Appearance settings already provide **System**. Select it in WorkBuddy, then choose Auto in macOS System Settings → Appearance. On 2026-10-27, the WorkBuddy appearance settings window was observed changing with real macOS light and dark switches on one Mac. Do not apply the 5.8.3 patch or restore its app files into 5.9.2. See [the 5.9.2 note](docs/WORKBUDDY-5.9.2.md).

**This modifies a signed JavaScript resource inside WorkBuddy and invalidates the original resource signature verification.** It does not re-sign the application, remove quarantine, or disable macOS security checks. Updates may replace the patch. macOS may reject a modified application: retain your backup and follow [recovery instructions](docs/RECOVERY.md) if needed.

## Compatibility

- macOS only.
- Discovers theme modules by archive contents, without fixed filenames or version gating. Patching requires an exact validated SHA-256 and ASAR metadata; the known patch was tested on WorkBuddy 5.8.3. Unknown content is rejected. Native theme indicators only prompt the user to check settings; they do not verify the live state. Detection scans a bounded amount of packed JavaScript and may miss future implementations.
- Node.js **22.13+**.
- Native light / dark themes only. Switch away from custom skins before installation.
- Default app: `/Applications/WorkBuddy.app`; override with `--app`.

**This project is a prerelease.** The core patch was tested on a real macOS installation. The generalized installer has automated coverage; its complete workflow has not been validated on every real-machine configuration. See [validation scope](docs/VALIDATION.md).

## Use

Install and sign into the official WorkBuddy app first. Download and extract a release ZIP, or clone:

```sh
git clone https://github.com/chillboy67/workbuddy-auto-theme.git
cd workbuddy-auto-theme
node bin/workbuddy-auto-theme.mjs status
```

No `npm install` is needed. Save your WorkBuddy work before running:

```sh
node bin/workbuddy-auto-theme.mjs install
```

Confirm the interactive prompt. In a noninteractive terminal, `--yes` explicitly accepts the restarts and modification of signed resources:

```sh
node bin/workbuddy-auto-theme.mjs install --yes
```

Installation backs up the original resource and relevant appearance settings, applies the hash-checked patch, enables automatic appearance, exits the temporary loopback CDP instance, and reopens WorkBuddy normally. It usually restarts the app twice. It does not force-kill processes.

Then select **System Settings → Appearance → Auto**. The tool follows the OS appearance; it has no separate day/night timer and does not change the OS setting for you.

## Verify

```sh
node bin/workbuddy-auto-theme.mjs verify --yes
```

This checks page media emulation in dark and light modes, theme/control metadata, and persistence across a renderer reload. It clears the emulation and returns to normal launch afterward. This does **not** toggle the real macOS appearance. Test that manually in System Settings.

`status` only examines files and backup metadata; it does not inspect live renderer state.

## Uninstall

```sh
node bin/workbuddy-auto-theme.mjs uninstall
```

Restores the saved appearance settings and original resource, then relaunches normally. Unknown or updated files and corrupt backups stop restoration. Backups remain local under:

```text
~/Library/Application Support/WorkBuddy Auto Theme/
```

Do not publish that directory. [Recovery](docs/RECOVERY.md) covers interrupted installation and manual restoration.

If adopting the earlier identical patch, supply your existing original backup:

```sh
node bin/workbuddy-auto-theme.mjs install --original-backup "/path/to/original.js"
```

It must match the supported original hash. A patched file is never accepted as an original backup. The settings snapshot records the state immediately before adoption.

Use `--state-dir` consistently for a custom backup location. Use `--port 9334` if port 9333 is busy; the installer will not attach to or terminate its occupant.

## Implementation

WorkBuddy already contains system appearance handling, but fixed theme snapshots and skin synchronization can override it. Its system-change handler also needs to recompute the control theme metadata. The patch gives the explicit local automatic-mode flag precedence and routes changes through the complete theme update method.

The unpacked module remains exactly **10,592 bytes**, matching the ASAR header. Theme diagnostic text is shortened and the tail is padded. `app.asar` is not rewritten. See [design](docs/DESIGN.md).

## Development

```sh
npm test
npm run check
```

Tests use synthetic fixtures. An optional private original file can exercise deterministic patching and temporary-directory file installation / recovery without touching your real app:

```sh
WORKBUDDY_TEST_ORIGINAL="/path/to/original.js" npm test
```

No vendor application source, application backup, account data, or local appearance snapshot is distributed. Independent community tool; not affiliated with the WorkBuddy vendor. Project-authored code is [MIT licensed](LICENSE).
