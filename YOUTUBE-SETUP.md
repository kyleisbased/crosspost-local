# YouTube sign-in

Crosspost 0.2 uses the normal system browser and Google's Desktop OAuth flow. Google blocks sign-in in automated browsers; changing browser security settings is not the fix. YouTube uploads now use the YouTube Data API, not browser clicks. Instagram and TikTok still use their experimental browser integrations.

## Connect your channel

Crosspost 0.2.2 includes the registered Crosspost Local Desktop OAuth credentials. Open Accounts, click Connect for YouTube, and choose Sign in. Google opens in your normal browser. Choose your own Google account and channel, allow upload and channel-read permissions, then return to Crosspost.

No developer JSON is needed with the included client. Google requires this desktop client's client_secret during code exchange and refresh. Version 0.2.1 omitted it, producing HTTP 400 (invalid_request: client_secret is missing). Version 0.2.2 includes the installed-app credential and repairs ID-only settings for this client. Desktop credentials cannot be kept confidential in distributed software; PKCE and per-request state remain enabled. Personal access and refresh tokens are never included in releases.

## Current Google access

As of November 12, 2026, the shared Crosspost Local project is External / In production, without Google verification. YouTube Data API v3 is enabled. Individual tester invitations are no longer required. The Google API User Data Policy and YouTube API terms have been accepted.

Google's unverified-app warning is expected. The project is limited to 100 users over its lifetime; publishing does not remove that cap or override Google account and organization restrictions. This publishing change applies to the included client in version 0.2.1 without another app download, but the separate credential bug requires updating to 0.2.2. Older packaged help may still refer to tester invitations; this page supersedes that guidance for the shared client.

The maintainer intends this unverified release for a small personally known group. A successful real-account sign-in and upload are still required before calling the integration verified. The managed development session previously denied access to Google's token endpoint, so its simulated tests do not prove a real connection.

Google controls consent, token expiry and quotas. No paid publishing service or AI credits are involved. Read the [privacy policy](PRIVACY.md) before connecting. Only authorize an app and permissions you recognize and trust.

## Optional: your own Google project

If you maintain a separate installation or fork, create a Google Cloud project, enable YouTube Data API v3, configure the consent screen, add your testers and create a Desktop app OAuth client. Download its JSON and import it under Accounts > Advanced YouTube setup. Existing imported settings take priority over the included public client ID. Replacing settings requires reconnecting your YouTube profiles.

Keep imported settings private. Never share youtube/<profile>.json token files or the application's data folder. No Google password is entered into Crosspost.

## First live test

Use a short video you have permission to publish. Review the selected account, title, description and audience setting, then publish one video to YouTube. The current Publish action requests **public** visibility. Verify the channel, visibility, audio and video in YouTube Studio before scheduling a batch. A successful API upload can still take time to process or be restricted by YouTube.

If Google rejects access, check the selected project's enabled API, publishing status and Desktop client type. Custom projects still in Testing require allowed test users. If a token expires, reconnect. Do not disable browser security or attempt to evade Google's login checks.

## How it works

The app opens accounts.google.com in your normal browser using a random, short-lived state and PKCE challenge. Google redirects to a loopback callback on this computer. Crosspost exchanges the authorization code, checks the channel identity, and stores each profile's authorization separately. Scheduled uploads use refresh tokens while the local app is running. The computer must stay awake and online.

Reference: [Google Desktop OAuth](https://developers.google.com/identity/protocols/oauth2/native-app), [YouTube upload API](https://developers.google.com/youtube/v3/docs/videos/insert).

Automated tests use simulated Google responses. A real sign-in and public upload remain required before calling this production-ready.

