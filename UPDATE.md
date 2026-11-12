# Update Crosspost

Open **Update-Windows.cmd** or **Update-Mac.command** beside the program. On a Mac, keep the update command beside Crosspost.app; it is also inside Crosspost.app/Contents/Resources/app. No Git, npm install, or new Node installation is needed for portable builds.

You can also open the installation folder in Codex and say:

> Update Crosspost using its included updater. Preserve my videos, accounts, profiles, and schedules.

This is a plain-language Codex request, not a globally registered `/update` slash command. The repository's AGENTS.md tells Codex which included command to run.

## Older installations without an updater

Tell Codex:

> Update my existing Crosspost installation from https://github.com/kyleisbased/crosspost-local. Download scripts/update.mjs from that repository into this installation's scripts folder, then run it using the installation's bundled Node runtime. Do not replace or delete my data folder. Do not install a second copy.

Open the actual installation folder in Codex first. On Mac it is Crosspost.app/Contents/Resources/app. The bootstrap script has no external dependencies. After the first update, the update commands are included permanently. If you do not use Codex, download the latest complete desktop package once to obtain the updater; subsequent code updates use the update command.

## Commands

Windows portable, from the program folder:

```powershell
& .\runtime\node.exe .\scripts\update.mjs
```

Mac portable, from Crosspost.app/Contents/Resources/app:

```sh
./runtime/node scripts/update.mjs
```

Source installation with Node 24 already installed:

```sh
node scripts/update.mjs
```

The updater selects the newest published release containing the verified update asset, including test prereleases. It checks SHA-256, refuses path traversal or symbolic-link replacements, and requires compatible Node/dependency versions. It downloads only app code rather than Chromium and Node again. If a future version changes bundled dependencies, it will explicitly request a new full package.

An active upload blocks updating. The updater stops the local app, replaces only permitted application files, and restarts it. Videos, databases, sessions and Google tokens are never part of the update package. Keep the same CROSSPOST_DATA and PORT environment settings if you customized them. Version 0.1 may leave the queue paused after shutdown; check the Queue tab after updating. Version 0.2 preserves its pause preference during updates.

If file installation fails, the updater rolls back the app files. If the process is interrupted, the launcher blocks starting a partial update. Re-run the same command with `--recover`, then run the updater again. Recovery refuses while another updater process is active. Do not delete the `.crosspost-update` recovery folder manually.

Test releases still require real-account validation. Updating does not configure a Google Cloud project or grant access to a Google account. See [YouTube setup](YOUTUBE-SETUP.md).
