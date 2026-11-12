# Crosspost Local — early access 0.1

## Self-contained distribution (in preparation)

The friend-facing package is a Windows `Crosspost.exe` folder or macOS `Crosspost.app`, with Node and Chromium bundled. MP4 metadata inspection is built into the app, so no media tool is installed. The setup scripts below are for source development, not the intended friend experience.

`npm run package:portable` builds for the developer machine's OS and architecture after dependencies, Chromium, and the Node distribution LICENSE are available. Set `CROSSPOST_NODE_LICENSE` if the LICENSE is not beside the Node executable. `runtime-notices/NODE-LICENSE.rtf` was recovered from this PC's matching Node 24.18.0 installer. The default build verifies its bundled runtime and a local browser/server session before finalizing the folder. `--assemble-only` explicitly skips execution tests and produces a clearly marked test candidate; it is not a validated release.

A Windows test candidate has been assembled. Its bundled Node executable is byte-identical to the installed runtime but exits with Windows code `0xC0000142` in this execution session. It has not passed a clean-machine launch test. The GitHub workflow can build and verify native Windows, Intel Mac, and Apple Silicon Mac packages; it has been prepared but not run. Signing and real uploads remain unverified.

Portable releases keep private data in the current user's CrosspostLocal application-data folder, outside the release files. Existing development data is not automatically migrated. Never distribute the development `data/` folder.

A local publishing dashboard for vertical short videos, with profile-isolated accounts, bulk importing, captions, and a persistent publishing queue. No hosted service, subscription, AI API, or credit balance is needed. Internet is needed for setup and publishing.

## What is ready

- Local dashboard and SQLite storage, profile switching, isolated account labels and browser directories.
- Streaming bulk import (one file at a time, without loading whole videos into server memory), H.264/AAC MP4 inspection, video previews, shared captions and editable titles.
- Scheduling in your computer's local timezone, batch spacing, queue pausing, per-platform results, restart recovery, and duplicate-submission guards.
- Windows and Mac setup/start launchers.

## What still needs validation

The YouTube, Instagram, and TikTok browser adapters are **experimental**. They contain upload flows for English desktop interfaces, but have **not been tested against signed-in accounts**. Do not treat this version as a production unattended publisher. The first controlled live upload on each platform still needs to be verified, and selectors may need adjustment. Login challenges are never bypassed.

Playwright 1.63.0 and matching Chromium are installed on the development PC, and the real local UI smoke test passes. Internet navigation from the publishing browser failed with `ERR_NETWORK_ACCESS_DENIED`, so real sign-in and posting are still unverified. No real social post was created during development. Mac launchers require a Mac test.

## Source setup (for development and testing)

1. Install **Node.js 24 LTS** from https://nodejs.org.
2. Extract this folder somewhere you can write files, such as Documents. Do not run inside the ZIP.
3. Windows: double-click `Setup-Windows.cmd`, then `Start-Windows.cmd`.
4. Mac: open Terminal in the extracted folder and run `bash Setup-Mac.command`, then `bash Start-Mac.command`. To enable double-click afterward, run `chmod +x Setup-Mac.command Start-Mac.command`.
5. The dashboard opens at **http://127.0.0.1:4318**.

Source setup installs the free browser automation library and Chromium. No ffprobe or FFmpeg is required to run Crosspost. FFmpeg is only used by developer tests to generate sample files.

For developer operation: `npm install`, `npm run setup`, `npm start`. Tests: `npm test` (Node 24). The full local-browser test is `npm run test:ui`; it also needs ffmpeg to generate a temporary sample. It uses isolated test data and never publishes externally.

Portable packages include only the app, required browser libraries, Chromium, and Node with its license. They exclude development databases, sessions, uploaded videos, and caches.

Each new package includes `PACKAGE-MANIFEST.json` with hashes for its files. The packaged smoke test checks those hashes before opening its isolated local dashboard. Failed native launch tests are recorded in `BUILD-STATUS.json`; the default builder leaves those builds in an unfinished `.partial` folder. Manifest checks detect damaged or incomplete copies, not platform compatibility or publisher identity.

## Connect profiles

Create a profile at the top, such as Personal or My channel. Connect each platform: open its browser, sign in yourself, finish any verification, then save the account name in the dashboard. Each platform in each profile gets a separate browser directory. These are not your existing everyday browser sessions.

The label is user-confirmed, not an API-verified identity. Always check the actual account in the browser before the first post. Do not switch the active account inside a connected profile's browser; create a different profile instead. A rejected automated-browser login is an unresolved platform limitation, not something this app works around.

## Upload and schedule

Import MP4 videos, up to 1 GB and 3 minutes each. Files must be ordinary self-contained MP4 exports with one vertical H.264 video track and AAC audio if present. Quarter-turn phone rotation is supported. Fragmented streaming files and unsupported sample descriptions require a fresh export. The built-in reader checks metadata; it does not decode every frame or guarantee that every platform accepts the file. This app does not silently crop or transcode.

Select videos, edit titles and descriptions, or apply a bulk caption. YouTube receives separate title/description fields; Instagram and TikTok receive title plus description as one caption. Set the YouTube made-for-kids option correctly for each video.

Choose platforms and publish now or schedule. Daily spacing is exactly 24 hours; it may shift the local clock hour across daylight-saving changes. The time applies to starting an upload, so actual publication happens later. Uploads run serially. Keep the computer awake, online, logged into the OS, and the background process running. Closing the dashboard tab does not stop the worker. A restart or shutdown does stop it; open Start again. Overdue jobs resume when you restart the app. Pause the queue before restarting if you do not want catch-up posting.

This version does not install a system startup service or guarantee background browsers survive an OS logout. Browser windows can appear during publishing. Account sessions may expire. A job that cannot be completed goes to Needs attention. Check the platform and any drafts before retrying; you can mark a post as published if it already succeeded.

## Data and privacy

`data/` contains the database, local copies of uploaded videos, browser sessions, and the app log. **Never share this folder.** Give friends only a clean distribution. Sessions can authorize posting and must be treated like credentials. Browser/OS storage protections vary; this app does not implement a separate encrypted credential vault.

The server listens only on 127.0.0.1. Writes require a per-run token and reject foreign origins. This protects against casual cross-site requests, not malicious software running on your computer. Do not expose this server through a public tunnel or port forward.

Pause prevents new uploads; it does not interrupt a post already in progress. Use Quit app in the dashboard to stop the local server. Back up `data/` only while the app is stopped. No automatic cleanup currently runs; remove unneeded drafts using the dashboard to reclaim their imported video storage.

## Technical shape

Node 24, built-in SQLite and MP4 metadata reader, browser JavaScript/CSS, and Playwright persistent browser contexts. Browser flows live in `src/browser.mjs`. Queued jobs are persisted before dispatch; an interrupted running job is held for manual inspection after restart. Publishing is not exactly-once at the remote platform: unknown outcomes need reconciliation before retrying.

No recurring paid providers are used. Platform limits and terms still apply. Test a small controlled batch before relying on any future unattended release.
