# Crosspost Local maintenance

When the user asks to update this installation, use its updater. Preserve all videos, accounts, profiles, schedules and data directories.

- Windows portable: run `runtime/node.exe scripts/update.mjs` from this directory.
- Mac portable: run `./runtime/node scripts/update.mjs` from Crosspost.app/Contents/Resources/app (this directory).
- Source installation: run `node scripts/update.mjs` with the existing Node 24 runtime.
- Do not run the interactive .cmd/.command wrappers from Codex; invoke Node directly so a pause prompt does not block completion.
- If scripts/update.mjs is missing in an older copy, download that exact script from kyleisbased/crosspost-local on GitHub into the installation's scripts directory, then use the bundled runtime. No new runtime or package installation is needed.
- If an upload is active, do not kill it. Wait for completion or report the blocker.
- An interrupted transaction requires `scripts/update.mjs --recover` before retrying. Never manually discard the recovery folder.
- Confirm the resulting version with /api/health after completion. Do not describe a failed update as successful.

YouTube uses Desktop OAuth in the system browser. Never restore Google sign-in through Playwright, suppress automation detection, extract everyday-browser cookies, or weaken browser security. Google app configuration and real-account testing are described in YOUTUBE-SETUP.md.
