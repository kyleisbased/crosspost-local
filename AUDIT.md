# Crosspost Local audit - November 12, 2026

Release decision: NOT ready for unattended production publishing.

## Native build milestone

The private repository is https://github.com/kyleisbased/crosspost-local. Native build run https://github.com/kyleisbased/crosspost-local/actions/runs/43128035816 succeeded for Windows x64, macOS Intel, and macOS Apple Silicon on commit `62ef405cb664c7f4d30824631c50445d6fc3746c`. Each platform passed all 31 automated tests, the real ten-video dashboard test, and the bundled Node/SQLite/server/Chromium smoke test. Three ZIP artifacts were produced. These checks do not test real platform sign-in, actual posting, OS download approval, or the GUI launcher through Explorer/Finder.

The account showed unused included Actions compute and a $0 paid Actions budget before dispatch. No paid plan or paid-usage limit was enabled. Downloads through this local session are still restricted: the shell reported a socket access denial and Chrome blocked the artifact storage host. The successful remote artifacts are distinct from the earlier failed local Windows candidate.

## Verified

31 automated tests pass on Windows / Node 24. These cover real MP4 ingestion and validation, ranged preview responses, editing, three-destination scheduling records, batch spacing, pause/resume dispatch, cancellation, draft deletion protection, duplicate prevention, profile separation, atomic bulk captions, rejected invalid metadata, rejected cross-origin writes, interrupted-job recovery, launcher data identity checks, package integrity checks, and browser failure/verification logic using test doubles. Test doubles do not demonstrate real platform compatibility.

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
- Testing the packaged files with the installed host runtime also exposed a packaged Chromium launch failure: its crash handler could not start. The installed browser cache passes the UI tests; the packaged browser has not passed them. Build-status metadata records both failures.
- The latest native build attempt again failed with runtime code `0xC0000142`; its 504-file package manifest verified successfully. Available Windows event-log queries did not establish the underlying cause. No security settings were changed.
- The source and successful native builds are now stored in the private Crosspost repository.
- GUI installation/first launch on recipient machines, sleep/logout behavior and large-file stress tests remain unverified.
- Local scheduling initiates uploads at the target time; it does not guarantee simultaneous release. The machine must remain online and awake. Day intervals are fixed 24-hour periods, not daylight-saving-aware calendar recurrences.
- Browser sessions remain sensitive local files. No independent encrypted credential vault is implemented. Users must verify the actual signed-in identity before posting.

## Next required validation

Use a permitted execution environment with normal network access for real account tests. Complete sign-in and verification for each platform, test one explicitly chosen video on each destination, inspect the result, and test a small scheduled batch. Test Explorer/Finder first launch using the successful native CI packages on recipient machines. No social posts were made during this audit.
