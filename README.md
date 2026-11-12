# Crosspost Local 0.2.1

A local dashboard for bulk importing vertical short videos, writing captions, and scheduling uploads to YouTube, Instagram and TikTok. Profiles keep each set of accounts apart. No publishing subscription or AI credits are required.

**Early-access test software. Real sign-in and publishing still need live-account testing.**

## Install

[Download a desktop test release](https://github.com/kyleisbased/crosspost-local/releases). Choose Windows x64, Mac Apple Silicon, or Mac Intel. Extract the whole ZIP and open Crosspost.exe or Crosspost.app. Node 24 and Chromium are included; friends do not need Git or separate developer tools. Packages are unsigned and require recipient-machine testing.

## Connect

**YouTube:** Google sign-in now opens in your normal browser. Uploads use the YouTube Data API. The old automated-browser Google login is disabled because Google rejects it. The Google desktop app ID is included. Each friend clicks Connect and signs into their own Google account and channel; no configuration file is needed. During testing, the app owner must enable YouTube Data API v3 and add each friend to the Google tester list. [One-time YouTube setup](YOUTUBE-SETUP.md).

Only the public Google desktop client ID is included; no client secret or account tokens are distributed. Google project activation and tester access must be complete before sign-in can succeed. Channel identity is verified through Google; no Google password is entered into Crosspost.

**Instagram and TikTok:** sign in in the separate browser window, verify the account, then return to save it. These integrations are experimental and can require help with login or verification prompts. Account labels are user-confirmed. Use a different profile for another set of accounts.

## Post

Add MP4 videos, edit titles and captions, select videos, and press Continue. Choose accounts, timing and spacing. Review the YouTube audience setting before confirming. Confirmation authorizes public uploads. Keep the app running and the computer awake and online. Times are targets; uploads and processing take additional time.

A failed or uncertain upload waits for review. Check the platform before retrying to avoid duplicates. Reconnecting an account holds only its jobs. Closing the dashboard tab does not stop the worker; Accounts > Quit app pauses and stops it.

## Update

Open Update-Windows.cmd or Update-Mac.command, or open the installation folder in Codex and say:

> Update Crosspost using its included updater. Preserve my videos, accounts, profiles and schedules.

[Update instructions, including old copies without an updater](UPDATE.md). This is a plain-language Codex request, not a globally registered /update slash command.

Updates download compatible app code, check SHA-256, refuse to interrupt an upload, and preserve saved data. File-installation errors roll back. Future changes to bundled dependencies can require a new full package.

## Private data

Portable Windows: LOCALAPPDATA/CrosspostLocal. Mac: ~/Library/Application Support/CrosspostLocal. Source: the project's data directory. CROSSPOST_DATA overrides the directory; PORT overrides port 4318. Do not share or upload this data directory: it contains videos, sessions, Google tokens and the database. Development data is not automatically migrated into portable installs.

## Development and testing

Use Node 24, npm install, npm run setup, then npm start. Source launchers are for developers; use portable packages for friends.

- npm test: database, HTTP, account isolation, OAuth, upload responses, updater rollback and actual updater stop/install/restart tests.
- npm run test:ui: default sign-in and optional custom Google setup, ten videos, captions, thirty queued destinations, pause/cancel and 390px layout. FFmpeg generates test media only.
- npm run package:portable: native package, runtime/browser integrity and actual-launcher checks. CROSSPOST_NODE_LICENSE supplies the matching Node license when needed.
- npm run package:update: lightweight update asset. Bump package.json version for each release.

Tests use simulated Google responses and never publish social posts. Passing tests does not establish real-account compatibility. See [AUDIT.md](AUDIT.md) for validation history.
