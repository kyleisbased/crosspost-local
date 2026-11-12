# 0.2.1 Google client setup (2026-11-12)

- Includes the public Crosspost Desktop OAuth client ID; private custom client imports still take priority. No client secret is shipped.
- Omits the optional secret field when absent; PKCE remains required for code exchange.
- Local validation: 53 tests passed, ten-video UI workflow passed, lightweight update packaged. Tests simulate Google responses.
- Google policy accepted, desktop client created, requested upload/read scopes saved, owner added as tester.
- Pending: separate YouTube API terms/activation, friends' tester emails, real-account sign-in and upload. This managed session denies outbound token-endpoint access (EACCES), so live exchange was not verified.

# Version 0.2 validation - November 11, 2026 (Central)

YouTube browser login is disabled. Desktop OAuth uses the system browser, PKCE, expiring single-use state, profile-isolated refresh tokens and Google-verified channel identity. API uploads hold ambiguous or non-public results for review. A Google client is not configured in the distribution; real sign-in and social publishing remain unverified.

The lightweight updater checks SHA-256 and dependency compatibility, rejects unsafe paths, preserves private data, refuses active uploads, rolls back file failures and restarts the app. An actual CLI test verifies shutdown, installation, restart, saved queue/account retention and no-op repeat updates with simulated GitHub downloads.

Local validation: 52 tests passed; ten-video UI test passed, including simulated Google setup/callback, captions, 30 queued destinations and 390px layout. Native builds are recorded in GitHub Actions. Historical results below describe earlier versions.

---

# Crosspost Local audit - November 12, 2026

Release decision: NOT ready for unattended production publishing.

## Latest source fixes (November 11, 2026, Central time)

These fixes passed native build 43133612545 on all three platforms, on commit `976ce26f3d0904c7849eb964231f2a1cd6d74f54`. Each passed 38 automated tests, the ten-video UI test, bundled runtime/browser smoke checks, and actual-launcher start/reopen/quit checks. Release-saving run 43133943221 succeeded. The current private test downloads are https://github.com/kyleisbased/crosspost-local/releases/tag/v0.1.0-test-43133612545, with all three ZIPs and SHA256SUMS.txt uploaded. This supersedes the older build milestone below. The running local app includes these fixes and retains two profiles, one video, zero jobs and the existing paused state.

Source-transfer note: a console encoding conversion initially changed Unicode punctuation in one source file. The transfer was corrected using byte-preserving input, and Git blob hashes for all changed files were compared with the local source before the successful build.

- Account setup no longer pauses all profiles and platforms. It clears only the selected account's readiness; the durable scheduler skips that account until verification succeeds, including across restarts.
- Verification closes the setup browser before restoring readiness. Each upload checks session readiness before selecting a file, and expired sessions hold remaining jobs for that account.
- Upload windows close after attempts to limit accumulated browser processes. Ambiguous final outcomes remain Needs attention; they are never automatically retried.
- Generic TikTok upload-complete text and YouTube scheduled text no longer count as proof of a published post.
- Publish now defaults to consecutive uploads; batch scheduling explains spacing, timezone, target platforms and pause state. Existing destinations cannot be resubmitted accidentally from the batch dialog.
- Connected account names are visible on the Videos page. Waiting jobs lead directly to account setup.
- Local tests: 38 passed, including account-specific dispatch, preserved manual pause, expired-login preflight, delayed page rendering, and ambiguous publication outcomes. The ten-video dashboard test additionally checks immediate batch spacing, scheduled spacing, and duplicate-destination prevention.
- Fresh sign-in-page checks against all three destinations returned ERR_NETWORK_ACCESS_DENIED. No signed-in account or real publication has been verified. This restriction must be resolved in a permitted environment before a production release.

## Native build milestone

The private repository is https://github.com/kyleisbased/crosspost-local. Native build run https://github.com/kyleisbased/crosspost-local/actions/runs/43129620724 succeeded for Windows x64, macOS Intel, and macOS Apple Silicon on commit `3d5fb175cdc8ebaf118dcb4e95afaab99c2a7671`. Each platform passed all 32 automated tests, the real ten-video dashboard test, the bundled Node/SQLite/server/Chromium smoke test, and an actual-launcher test. Three ZIP artifacts were produced. These checks do not test real platform sign-in, actual posting, or OS download approval.

The launcher test executes Crosspost.exe on Windows and the executable inside Crosspost.app on Mac. It creates an isolated temporary data directory, starts the server, adds a profile, launches again, confirms reuse of the same server and saved profile, quits through the local API, and removes the temporary data. It does not automate Finder, OS security prompts, or the default-browser opening step. The initial Windows test exposed an early cleanup attempt before the database handle was released; bounded file-lock retries fixed that test race. The corrected build passed. Windows missing-runtime behavior was also tested locally: clear extraction instructions and exit code 1.

The account showed unused included Actions compute and a $0 paid Actions budget before dispatch. No paid plan or paid-usage limit was enabled. Downloads through this local session are still restricted: the shell reported a socket access denial and Chrome blocked the artifact storage host. The successful remote artifacts are distinct from the earlier failed local Windows candidate.

The three tested archives and SHA256SUMS.txt are preserved in the private prerelease https://github.com/kyleisbased/crosspost-local/releases/tag/v0.1.0-test-43129620724. Preservation run 43130223169 succeeded and the release API confirmed all four assets uploaded. The release points at the exact tested source commit. No new app code was introduced while preserving the packages. This supersedes the earlier v0.1.0-desktop-test download for further testing.

The running development app remains online with its original two profiles, one video, zero queued jobs, and paused queue. Tests used temporary data only.

## Verified

32 automated tests pass on Windows and both native Mac architectures / Node 24. These cover real MP4 ingestion and validation, ranged preview responses, editing, three-destination scheduling records, batch spacing, pause/resume dispatch, cancellation, draft deletion protection, duplicate prevention, profile separation, atomic bulk captions, rejected invalid metadata, rejected cross-origin writes, interrupted-job recovery, launcher start/reopen/quit and data identity checks, package integrity checks, and browser failure/verification logic using test doubles. Test doubles do not demonstrate real platform compatibility.

The built-in MP4 reader replaces the native ffprobe dependency. Real fixtures cover H.264, AAC, silent video, 90-degree rotation, landscape rejection, MP3-in-MP4 rejection, fragmented-file rejection, truncated metadata, overlong duration, and unsupported video codecs. The existing user video also passes the new reader. The ten-video UI test passed again after this change.

Playwright 1.63.0 and its matching Chromium revision 1243 are now installed locally, using existing components on this PC. Manual browser inspection confirmed the simplified dashboard and account setup screens render. YouTube Sign in launched the browser but navigation failed with ERR_NETWORK_ACCESS_DENIED. This is a network restriction, not a successful account connection. Existing user videos and metadata were retained.

The real Chromium UI smoke test (`npm run test:ui`) passed against a temporary database: new profile, ten-file MP4 import, title editing, bulk captions, blocked scheduling without connected accounts, thirty scheduled destination records using explicit test-fixture accounts, cancellation, queue pause, profile isolation, and no horizontal overflow at 390px. The publishing worker was disabled and external requests were blocked throughout this test. There were no browser JavaScript errors.

## Fixed in this audit

- Saving a name alone can no longer mark an account connected. Verification requires an open session on the expected platform host and a matching upload control. This is a session-readiness check, not an authoritative account identity check.
- Concurrent account connection requests are locked. Failed connections release the lock and restore the previous queue pause state.
- Bulk caption edits are transactional: one invalid or queued video no longer leaves the others partially changed. Empty bulk captions are supported.
- Missing/non-text metadata is rejected.
- Paused queues have a visible Resume control on the main screen.
- Offline state is visible instead of silently failing background refresh.
- Error toasts are placed in the active dialog so they remain visible.
- Network-denied connection failures now explain the problem without exposing a raw browser call log. Failed connections release the lock.
- The Windows executable launcher now reports child-process startup failures rather than silently closing. Its source compiles successfully.
- The packager no longer needs a native media tool. Node's matching distribution license was recovered from the locally installed MSI.
- The launcher identifies the database served on its local port and refuses to silently open another installation's data.
- Windows test-package assembly now completes. Default verified builds include an isolated local server/browser smoke test and preserve Mac browser-framework symlinks.
- Native build jobs now pass for Windows, Intel Mac and Apple Silicon Mac; see the milestone above.
- Packages now contain a SHA-256 manifest. Checks detect changed, missing, or unexpected files and reject links that leave the app folder. These checks detect corruption; they do not replace code signing or prove runtime compatibility.
- Failed native smoke tests are persisted in BUILD-STATUS.json, and the default build keeps the package in an unfinished .partial folder. Windows startup errors now show the native exit code even when startup never creates an app log.

## Blocked / unverified

- npm downloads remain blocked, but the local browser dependency is resolved. Real browser navigation to YouTube Studio failed with ERR_NETWORK_ACCESS_DENIED. Do not work around the execution policy using another launcher or transport.
- Live Google, Instagram and TikTok sign-in, MFA, actual publication, returned public URLs, long upload behavior, and real-platform resumption have not passed end-to-end tests. Current browser selectors are provisional.
- A self-contained Windows test candidate is assembled with required components and licenses. The copied Node binary matches the installed binary's SHA-256 but exits with `0xC0000142` before startup in this execution session. The cause is not proven; the candidate is explicitly marked unverified. It is not a production release.
- Testing the earlier locally assembled files with the installed host runtime also exposed a packaged Chromium launch failure: its crash handler could not start. That local candidate remains unverified; the new native CI packages pass their browser checks.
- Earlier local build attempts failed with runtime code `0xC0000142`; their package manifests verified successfully. Available Windows event-log queries did not establish the underlying cause. These historical local failures are separate from the successful current CI builds. No security settings were changed.
- The source and successful native builds are now stored in the private Crosspost repository.
- GUI installation/first launch on recipient machines, sleep/logout behavior and large-file stress tests remain unverified.
- Local scheduling initiates uploads at the target time; it does not guarantee simultaneous release. The machine must remain online and awake. Day intervals are fixed 24-hour periods, not daylight-saving-aware calendar recurrences.
- Browser sessions remain sensitive local files. No independent encrypted credential vault is implemented. Users must verify the actual signed-in identity before posting.

## Next required validation

Use a permitted execution environment with normal network access for real account tests. Complete sign-in and verification for each platform, test one explicitly chosen video on each destination, inspect the result, and test a small scheduled batch. Test Explorer/Finder first launch using the successful native CI packages on recipient machines. No social posts were made during this audit.
