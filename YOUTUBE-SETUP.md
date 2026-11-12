# YouTube sign-in

Crosspost 0.2 uses the normal system browser and Google's Desktop OAuth flow. Google blocks sign-in in automated browsers; changing browser security settings is not the fix. YouTube uploads now use the YouTube Data API, not browser clicks. Instagram and TikTok still use their experimental browser integrations.

## One-time setup by the app owner

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create or choose a project for Crosspost.
2. Enable **YouTube Data API v3** for that project.
3. Configure **Google Auth Platform** branding, audience and contact details. For testing with friends, choose External / Testing and add each friend's Google email as a test user.
4. In Clients, create an OAuth client of type **Desktop app**. Do not choose Web application. Download its JSON file.
5. Open Crosspost > Accounts > YouTube setup and import that JSON. The file must contain an `installed` object. It is stored locally outside the program files in portable installations.
6. Each friend imports the same desktop-client JSON into their own installation, then clicks YouTube > Connect > Sign in. They choose their own Google account/channel and allow both upload and channel-read permissions. Crosspost obtains the channel name from Google automatically.

The desktop client identifies the app; it is not a friend's login. Share that configuration privately with your testers. Never share the `youtube/<profile>.json` token files or the application's data folder. No Google password is entered into Crosspost.

Google controls testing restrictions, consent approval, token expiry and upload quotas. Testing access may need reauthorization. Wider distribution can require Google verification. No paid publishing service or AI credits are involved; do not enable billing just to follow this guide.

## First live test

Use a short video you have permission to publish. Review the selected account, title, description and audience setting, then publish one video to YouTube. The current Publish action requests **public** visibility. Verify the channel, visibility, audio and video in YouTube Studio before scheduling a batch. A successful API upload can still take time to process or be restricted by YouTube.

If Google rejects access, check the selected project's enabled API, allowed test users and Desktop client type. If a token expires, reconnect. Do not disable browser security or attempt to evade Google's login checks.

## How it works

The app opens accounts.google.com in your normal browser using a random, short-lived state and PKCE challenge. Google redirects to a loopback callback on this computer. Crosspost exchanges the authorization code, checks the channel identity, and stores each profile's authorization separately. Scheduled uploads use refresh tokens while the local app is running. The computer must stay awake and online.

Reference: [Google Desktop OAuth](https://developers.google.com/identity/protocols/oauth2/native-app), [YouTube upload API](https://developers.google.com/youtube/v3/docs/videos/insert).

Automated tests use simulated Google responses. A real sign-in and public upload remain required before calling this production-ready.
