# Crosspost Local Privacy Policy

Effective date: November 12, 2026

Crosspost Local is a local desktop application maintained by Kyle Clifton for importing videos, editing captions and scheduling posts to accounts you connect. Contact: kyle.based1@gmail.com.

## Information the app uses

- Videos you choose to import, their filenames and technical metadata, titles, descriptions, audience settings, selected destinations and schedules.
- Local profile names, account labels, posting status, error messages and published video links.
- For YouTube: your authorized channel ID and channel name, OAuth access and refresh tokens, and the upload responses needed to record posting results.
- For Instagram and TikTok: separate browser profiles containing the cookies and other session data created when you sign in.

Google sign-in takes place on Google's website in your normal browser. Crosspost does not ask you to enter your Google password into its dashboard. The YouTube upload permission is used to upload videos you authorize; read-only permission is used to identify the connected channel.

## Storage and sharing

The app stores imported copies of videos, settings, schedules, tokens and browser sessions on your computer. It does not send this data to a Crosspost-operated server. The maintainer does not automatically receive your videos, account credentials or posting history.

When you connect an account or authorize a post, the app communicates directly with the selected platform. Video files, titles, descriptions, audience settings and the necessary account authorization are sent to that platform. A confirmed publishing job requests public visibility. Scheduled jobs may upload later without another prompt while the app runs.

The updater contacts GitHub to check and download releases. GitHub and the connected platforms receive normal connection information, such as your IP address, and handle it under their own policies. Crosspost does not include advertising trackers or a third-party analytics service and does not sell user data. Google user data is not used to train AI models or for advertising.

Crosspost Local's use and transfer to any other app of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements.

## Retention, security and your controls

Local data remains until you remove it. Quitting or updating the program does not delete it. You can remove eligible draft or cancelled videos in the dashboard. Published records are retained to help prevent duplicate uploads.

To stop future posting, pause the queue and quit Crosspost. You can revoke Google's authorization at https://myaccount.google.com/connections and revoke other platform sessions through their account settings. Revoking authorization does not delete local files or posts already uploaded.

To remove all local Crosspost data, first quit the application, then delete its data directory: Windows %LOCALAPPDATA%/CrosspostLocal; macOS ~/Library/Application Support/CrosspostLocal; source installations use the project's data directory. A custom CROSSPOST_DATA setting overrides these locations. Removing this directory permanently removes the app's local videos, profiles, sessions and queue; preserve anything you want to keep first. Manage already-published posts on their respective platforms.

Authorization tokens are stored locally and are not encrypted by Crosspost itself. Protect your operating-system account and backups. Never share the data directory, token files or browser profiles. The local dashboard listens on the computer's loopback interface and uses protections for local state-changing requests.

## Support and changes

If you contact the maintainer, only send information needed to explain the issue; do not include credentials, token files or private videos. Support communications are not collected automatically by the app.

This policy applies to the official Crosspost Local project. Forks or modified versions may behave differently. Material changes will be described in the policy and release notes.

Project: https://github.com/kyleisbased/crosspost-local

Google privacy policy: https://policies.google.com/privacy
