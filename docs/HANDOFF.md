# Handoff — Disc / Studio Sync

Last updated: 2026-09-09. Written for picking this project back up in a
fresh conversation with no memory of how it got here.

## Where things actually stand

- **Repo**: [github.com/Guitarnerd/Disc](https://github.com/Guitarnerd/Disc) — a fork of the original Disc app, cloned locally at `C:\Users\The Basement\Documents\Disc Music App`.
- **Branch**: `main`, currently at commit `62b84ad` ("Fix blank taskbar icon caused by reusing the uninstalled build's AppUserModelID"). Working tree is clean — nothing uncommitted.
- **Status**: the collaboration feature and initial onboarding are done — both machines are live, Peter's confirmed working, Studio Sync shows 2 devices seen. Work is ordinary maintenance now: small bugfixes and occasional feature requests as they come up from actual use, not a planned roadmap. Nothing is mid-flight as of this update.
- **The old standalone installed build is gone.** It used to live at `AppData\Local\Programs\disc` (predates this fork, was replaced by the dev-mode Desktop shortcut a while back) — it got uninstalled this session after being found still pinned to the taskbar, pointing at stale code with separate data. See "Launcher/taskbar saga" below before touching anything shortcut- or taskbar-icon-related; it's a real rabbit hole with a non-obvious root cause at the bottom of it.
- **The renderer-crash mystery from the previous update is solved and fixed** — both crash log entries showed `reason: "oom"`. Root cause: this library has files upward of 285MB, and `decodeAudioData` producing a full-resolution raw PCM buffer for one of those allocates gigabytes on its own — a few landing in the same preload batch exhausts available memory. Fixed by skipping waveform/BPM-Key decode for anything over 50MB (`MAX_ANALYZABLE_SIZE_BYTES` in `src/audio/waveform.js`) — still fully playable, just no waveform/analysis, same as video clips. Also added **Repair Track** (right-click a track) — diagnoses a file's real header against its extension (this is how the DaVinci Resolve drag-and-drop bug from two sessions ago got found and fixed) and re-encodes in place if they don't match, preserving all tags since the file path never changes.
- **Running it**: double-click the "Disc" shortcut on the Desktop, or the taskbar pin (re-pin from the running app if it's ever missing — right-click the running app's taskbar icon → Pin to taskbar). Both now correctly point at this dev fork; the old separately-installed build at `Programs\disc` that used to cause confusion here is fully uninstalled as of 2026-09-09 (see "Launcher/taskbar saga" below). The shortcut runs `launch-disc.vbs`, which silently runs `npm run dev` from this folder unless Disc is already running (in which case it just focuses the existing window). Manually: `cd` into the project, `npm run dev`. If the Desktop shortcut ever goes missing, re-run `create-desktop-shortcut.ps1`.
- **Design doc**: [docs/collab-sync-scope.md](collab-sync-scope.md) — the full scope/architecture document for the collaboration feature, kept up to date as things shipped. Read that before touching anything sync-related; it has the event schema, the merge algorithm, every decision made, and a recorded incident. This file is the *status/orientation* doc; that one is the *design reference*.

## What got built this session

1. **Tag Manager** (title bar icon, or Command Palette → "Open Tag Manager") — full tag list with usage counts, inline rename/recolor, delete, and **merge** (select 2+ tags, pick a survivor, confirm — fixes accidental-duplicate-tag cleanup). Flags likely duplicates automatically.
2. **Batch-tag search** — the multi-select "+ Tag" dropdown in the Library toolbar now has a live filter instead of a plain scroll.
3. **Studio Sync** — lets two machines sharing a music folder (over Resilio Sync, in this case) collaborate on tags/collections/notes/BPM-Key-overrides/folders without corrupting each other. Settings → Studio Sync to turn it on. Architecture: each device appends its own mutations to a private, append-only `.jsonl` log inside `.disc-sync/devices/` in the shared music folder — two machines can never write-conflict since neither touches the other's file. A merge step (deterministic replay, sorted by timestamp) combines every device's log into one shared view, live via the existing folder watcher or via "Sync now."
4. **In-app git update checker** — Settings → "Fork Updates" section (only shows when running from an actual git checkout). Runs `git fetch`/`pull` from inside the app instead of a terminal; re-runs `npm install` if the pull touched `package.json`. Separate from the pre-existing installer-based "Check for Updates" (that one points at GitHub Releases on the *original* upstream repo, not this fork — left alone, still there for if a packaged build ever gets released from the fork itself).
5. **Data recovery**: a "The Basement Studio" local Profile was created (Profiles menu, title bar) containing the original tags/collections/track-tags pulled from the pre-fork installed app — a clean backup independent of Studio Sync.
6. **Peter's onboarding, in progress**: hit and fixed three real issues getting him running — (a) his npm has a script-execution gate (likely `@lavamoat/allow-scripts` or similar) that blocked Electron's and esbuild's install scripts by default, fixed locally on his machine via `npm approve-scripts electron`/`esbuild` then `npm rebuild electron esbuild`, nothing to fix in the repo; (b) DevTools was auto-opening on every dev-mode launch, confusing for a non-developer end user — fixed, see below; (c) **the real one** — closing the Disc window didn't actually shut down the underlying dev server, so the next shortcut click silently failed against a stale, orphaned Vite instance still holding port 5173. Root cause was `concurrently --kill-others-on-fail` (only tears down siblings on a *failed* exit, not a clean one) instead of `--kill-others` (tears down on any exit) — a one-line fix in `package.json`, but the impact was large: this was very likely the same underlying cause behind essentially every "the app won't launch"/"the shortcut stopped working" moment on *both* machines throughout this whole project, not just Peter's setup.

## Launcher/taskbar saga (2026-09-09)

A single user report — "the taskbar icon opens a different instance than
the Desktop shortcut, and I want them to be the same one" — unraveled
into four separate, layered bugs. Worth reading in full if launching,
shortcuts, or taskbar/icon behavior act up again; the fixes build on each
other and re-diagnosing from scratch would be slow.

1. **The taskbar was pinned to a completely different app.** It pointed
   straight at `AppData\Local\Programs\disc\Disc.exe` — the old
   standalone packaged build from before this fork existed (see the
   "Running it" note above about the Desktop shortcut having already been
   redirected off of it once). The Desktop shortcut was correct
   (`launch-disc.vbs`); the taskbar pin had just never been updated to
   match. Since both builds share the same Electron `productName`
   ("Disc"), they also shared the same `%APPDATA%\Disc` userData
   directory — but the dev build loads its renderer over
   `http://localhost:5173` while the packaged build loads over `file://`,
   and `localStorage` is scoped per-origin *within* that shared store, so
   the two builds still had fully separate settings/tags/collections
   despite technically sharing a profile folder. This is the same
   localStorage origin-scoping trap noted below, just surfacing through a
   different launcher.
2. **Uninstalling that old build swept away the working Desktop shortcut
   and taskbar pin too**, not just its own. NSIS's uninstaller matches
   shortcuts to remove by name/AppUserModelID, and the dev build was (at
   the time) using the *same* AppUserModelID as the old build on purpose
   — see point 4. Recovered by re-running `create-desktop-shortcut.ps1`
   (already correctly targets `launch-disc.vbs`); the taskbar needed a
   manual re-pin from the running app afterward. Nothing in `%APPDATA%\
   Disc` (actual settings/tags/data) was touched by any of this — it was
   shortcuts and pins only.
3. **The Desktop shortcut then silently did nothing at all.**
   `launch-disc.vbs` uses `shell.AppActivate("Disc")` to detect an
   already-running instance before deciding whether to launch — but
   `AppActivate` does a case-insensitive *prefix* match against every
   open window's title, and a File Explorer window for a folder literally
   named `disc` (the now-empty old-build folder, open at the time from
   poking around in it) matched and got silently "activated" instead.
   Fixed by renaming the window title to `"Disc — Music Library"` (specific
   enough to not prefix-collide with stray windows) in both
   `electron/main.js` and the `AppActivate(...)` call in
   `launch-disc.vbs`. Also had to add a `page-title-updated` handler in
   `main.js` — Electron syncs the window title to the page's own
   `<title>` on load by default, and `index.html`'s is just `"Disc"`,
   which would have silently undone the rename the moment the renderer
   finished loading.
4. **The taskbar icon then showed as a generic blank page**, even though
   the in-app custom title bar's own icon (drawn by the React UI, not the
   OS) looked correct the whole time. Neither an Explorer icon-cache
   clear nor an explicit `mainWindow.setIcon()` call fixed it — the icon
   file itself loaded fine (`nativeImage`, confirmed via a throwaway
   script). Root cause: the dev instance's `AppUserModelID` was
   deliberately set to `"com.disc.app"` to match `package.json`'s
   `build.appId`, so a packaged install and a dev run would be treated as
   the same app identity — and this had worked fine right up until the
   old packaged build (which had *genuinely* registered `"com.disc.app"`
   as an installed app with Windows — Start Menu entry, icon, the works,
   via its NSIS installer) got uninstalled in step 2. After that, the dev
   build kept claiming an id with no real installed-app registration
   behind it, and Windows fell back to a blank icon for taskbar
   resolution. Fixed by giving the dev instance its own distinct id,
   `"com.disc.app.dev"`, instead of squatting on the packaged build's.
   **Worth remembering if a real packaged build ever gets installed
   again**: don't let it and the dev instance share an AppUserModelID
   unless both are expected to always be installed/present together.
5. **Pinning to the taskbar still shows the generic Electron icon — left
   as a known, accepted limitation of dev mode.** The icon is correct the
   entire time Disc is actually running; only the static *pinned* tile
   (when not running) is wrong. Root cause: "Pin to taskbar" from a
   running window always has Windows build the pinned shortcut from the
   *actual running executable's own file*, which in dev mode is the stock
   `node_modules\electron\dist\electron.exe` — Electron's own icon is
   permanently embedded in that binary itself, and nothing at the JS
   level (`icon:`, `setIcon()`, `AppUserModelID`) can override what
   Windows reads from the .exe file's own resources for a *pinned, not
   currently running* shortcut. Directly rewriting the pinned `.lnk`'s
   `TargetPath`/`IconLocation` in place (via `WScript.Shell` COM, same
   technique `create-desktop-shortcut.ps1` uses) works right up until the
   next time someone re-pins from a running window, which regenerates it
   from scratch and clobbers the fix again. The old installed build never
   had this problem because electron-builder's packaging step genuinely
   renames a copy of `electron.exe` (to `Disc.exe`) and re-embeds Disc's
   icon into *that file's own resources* via `rcedit` — there's no
   equivalent shortcut for unpackaged dev mode without replicating that
   same renamed-copy-plus-`rcedit` step by hand (real new tooling: a
   download, a re-iconned exe copy that needs regenerating after every
   `npm install`, and a script to do it — evaluated and explicitly
   deferred, see below). **Decided 2026-09-09**: not worth the ongoing
   maintenance surface for a cosmetic dev-mode-only issue. Revisit when
   there's ever a reason to produce an actual packaged/signed release
   build (`npm run dist` already handles this correctly for free, via
   electron-builder) — at that point this stops being a dev-mode
   workaround question entirely.

## Known gotchas worth not re-learning the hard way

- **`electron` binary sometimes doesn't finish installing via `npm install`** in this environment — symptom is `Error: Electron failed to install correctly` on `npm run dev`. Fix: the zip is usually already downloaded to `%LOCALAPPDATA%\electron\Cache\`; extract it into `node_modules\electron\dist\` and write a `path.txt` file there containing `electron.exe`. Ran into this twice this session.
- **Running `electron somefile.cjs` directly (not `electron .`) doesn't reliably pick up this project's `package.json` productName** — it can resolve the app identity as generic "Electron" instead of "Disc," which means `app.getPath("userData")` points at `%APPDATA%\Electron` instead of `%APPDATA%\Disc` — a completely different (empty) storage profile. Bit us once (see the profile-import investigation, "The Basement Studio" write initially landed in the wrong folder). Fix: explicitly `app.setPath("userData", path.join(app.getPath("appData"), "Disc"))` at the top of any one-off script before touching storage.
- **Never run a second Electron process against the same userData while the real app is running** — Local Storage is a leveldb store, not safe for concurrent multi-process access. Any one-off script that needs to read/write the live app's `localStorage` needs the real dev instance stopped first (`taskkill //F //IM node.exe` then `//IM electron.exe`), then restarted after. This is about *one-off debugging scripts* specifically — routine app usage doesn't need this anymore, see the `--kill-others` fix below.
- **(Fixed, but worth knowing why it happened)** `npm run dev` used `concurrently --kill-others-on-fail`, which only tears down the Vite process when Electron exits with a *failure* — a normal window close is a clean exit, so Vite silently kept running afterward, still holding port 5173. Every "the app won't open"/"the shortcut stopped working" moment throughout this whole project — on both machines — was very likely this. Fixed by switching to `--kill-others` (tears down on any exit, clean or not). If a fresh session ever sees stale `node.exe`/`electron.exe` processes again after this fix, something regressed — worth treating as a real bug, not routine cleanup.
- **The Electron main process (`electron/main.js`, `electron/preload.cjs`) is not hot-reloaded** — only the renderer (`src/`) is, via Vite. Any main-process change needs a full `npm run dev` restart to take effect.
- **A real incident**: enabling Studio Sync's merge once wiped a full library's worth of pre-existing local tags/collections, because the event log only ever recorded *new* mutations going forward and had no `tag.create`/`collection.create` events for anything that predated it — the merge fully rebuilds shared state from the log alone, so it rebuilt from nothing. Recovered via a manual backfill script; the underlying bug is fixed (`backfillLocalStateIfNeeded` in `src/App.jsx` now runs once before a device's first-ever merge). Full writeup in collab-sync-scope.md §7.5.

## Outstanding / not done yet

- ~~Peter's setup~~ **Done.** Confirmed working end-to-end: app launches cleanly via his Desktop shortcut, Settings → Studio Sync shows "2 devices seen" (his + the user's), and he's running an initial library preload. Four real issues surfaced and got fixed along the way (see item 6 above), plus a fifth: he'd originally downloaded the repo as a ZIP (no git) rather than cloning — `git pull` doesn't work against a ZIP extract, and the in-app Fork Updates checker doesn't show up either (it requires an actual git checkout). Fixed by having him install Git and re-clone properly. **The "Joining the Studio" guide has been updated to steer new collaborators toward the Git path from the start** so this doesn't repeat — see the note there.
- **Renderer crash during Peter's first preload** — window went blank, stuck (couldn't close normally, since Disc's frameless title bar is drawn by the same renderer that crashed). No root cause identified yet — happened once, at the default "Normal" (3-concurrent) preload speed, nothing else notable about the circumstances. Now has real instrumentation for next time: `render-process-gone` logs to a persistent crash log file and offers a native Reload/Close dialog (`electron/main.js`), plus Settings → Troubleshooting → Open DevTools / Show Crash Log. If it recurs, check the crash log first — `details.reason` (e.g. `"crashed"`, `"oom"`, `"killed"`) will actually narrow this down instead of guessing.
- **Small UX fix shipped from real use**: search didn't clear when switching folders/Collections (global search silently kept showing instead of the just-clicked Collection). Fixed — folder/Collection selection now resets search the same way it already reset a couple of other view states. Representative of the "maintenance mode" this project is in now — expect more of these, one at a time, as actual usage surfaces them.
- **Phase 4 (compaction)** — each device's `.jsonl` log grows unboundedly; needs periodic self-compaction into a snapshot once usage volume justifies it. Not urgent.
- **Documented sync gap**: dragging a folder to reorder it, or moving it into/out of a Section, doesn't sync between devices yet (creating/renaming/coloring/linking/deleting folders all do). `handleReorderFolders` in App.jsx is where that would need to hook in — it's one function with real complexity (cycle detection for nested Sections, whole-subtree moves between groups), deliberately deferred rather than half-wired.
- **The git-update "Pull" button's full live flow (behind → click → relaunch → confirms caught up) hasn't been exercised end-to-end** — only the "up to date" display and the underlying `git pull` command were verified directly. Low risk (standard git/npm commands, same pattern as everything else in main.js), but worth knowing it's the one untested path if something looks off there. Will get exercised for real the first time Peter checks it.

## Quick orientation for a fresh session

If picking this up cold: read `docs/collab-sync-scope.md` first for the why/how of Studio Sync, then this file for current status, then check `git log --oneline -10` and `git status` to confirm nothing's drifted since this was written.
