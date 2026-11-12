# YouTube sign-in

Crosspost 0.2 uses the normal system browser and Google's Desktop OAuth flow. Google blocks sign-in in automated browsers; changing browser security settings is not the fix. YouTube uploads now use the YouTube Data API, not browser clicks. Instagram and TikTok still use their experimental browser integrations.

## Connect your channel

Crosspost 0.2.1 includes the public ID of the Crosspost Local Desktop OAuth client. Open Accounts, click Connect for YouTube, and choose Sign in. Google opens in your normal browser. Choose your own Google account and channel, allow upload and channel-read permissions, then return to Crosspost.

No developer JSON is needed with the included client. No client secret or personal tokens are included in releases. The app uses PKCE and a loopback callback; Google's Desktop OAuth documentation lists the client secret as optional for code exchange and refresh.

## Before friends can sign in

The app owner must finish enabling YouTube Data API v3 in the Crosspost Local Google Cloud project and add each friend's Google email under Google Auth Platform > Audience > Test users. The project currently uses External / Testing. The Google API User Data Policy has been accepted and the desktop client and two requested scopes have been created. API activation and real-account verification are still pending.

Testing access may require reauthorization. Google controls consent, token expiry and quotas. Wider distribution can require Google verification. No paid publishing service or AI credits are involved. Do not enable billing just to follow this guide.

## Optional: your own Google project

If you maintain a separate installation or fork, create a Google Cloud project, enable YouTube Data API v3, configure the consent screen, add your testers and create a Desktop app OAuth client. Download its JSON and import it under Accounts > Advanced YouTube setup. Existing imported settings take priority over the included public client ID. Replacing settings requires reconnecting your YouTube profiles.

Keep imported settings private. Never share youtube/<profile>.json token files or the application's data folder. No Google password is entered into Crosspost.

## First live test

Use a short video you have permission to publish. Review the selected account, title, description and audience setting, then publish one video to YouTube. The current Publish action requests **public** visibility. Verify the channel, visibility, audio and video in YouTube Studio before scheduling a batch. A successful API upload can still take time to process or be restricted by YouTube.

If Google rejects access, check the selected project's enabled API, allowed test users and Desktop client type. If a token expires, reconnect. Do not disable browser security or attempt to evade Google's login checks.

## How it works

The app opens accounts.google.com in your normal browser using a random, short-lived state and PKCE challenge. Google redirects to a loopback callback on this computer. Crosspost exchanges the authorization code, checks the channel identity, and stores each profile's authorization separately. Scheduled uploads use refresh tokens while the local app is running. The computer must stay awake and online.

Reference: [Google Desktop OAuth](https://developers.google.com/identity/protocols/oauth2/native-app), [YouTube upload API](https://developers.google.com/youtube/v3/docs/videos/insert).

Automated tests use simulated Google responses. A real sign-in and public upload remain required before calling this production-ready.
