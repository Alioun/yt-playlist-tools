# yt-playlist-tools

Get it here:
https://addons.mozilla.org/en-US/firefox/addon/youtube-playlist-tools/

Since this uses the youtube data api (and I'm too lazy to host a server hihi) you need to supplement your own creds.
Steps on how to do this can be found [below](#how-to-get-a-client-id-and-client-secret-from-google-developer-console)

![5rgHjnQUy2](https://github.com/Alioun/yt-playlist-tools/assets/14974659/049852da-b7bb-408b-901f-06582aa910cc)
![firefox_0AvB0T8Vhu](https://github.com/Alioun/yt-playlist-tools/assets/14974659/ff37dbf7-fa6f-4452-a59a-ba465416ced4)

Adds a few small playlist tools.

- Automatically add the current video to one or multiple playlists
- Set a required watch percentage before it gets added
- Set a custom shortcut for it to be added to a special playlist
- Optional toasts for extension actions


Planned:
- Denylist for channels
- Show playlist names
- cache added videos locally so the same video isn't getting added multiple times 






# How to Get a Client ID and Client Secret from Google Developer Console

## Steps

1. **Go to Google Developer Console**:
   - Navigate to [Google Developer Console](https://console.developers.google.com/).

2. **Create a New Project**:
   - Click on the dropdown menu next to the Google APIs logo.
   - Select "New Project".
   - Enter a project name and click "Create".

3. **Enable APIs and Services**:
   - In the left sidebar, click on "Library".
   - Search for the API you need (e.g., "Google Drive API").
   - Click on the API and then click "Enable".

4. **Create OAuth Consent Screen**:
   - In the left sidebar, click on "OAuth consent screen".
   - Choose "External" for user type.
   - Fill out the required fields and save.

5. **Create Credentials**:
   - In the left sidebar, click on "Credentials".
   - Click on "Create Credentials" and select "OAuth 2.0 Client IDs".
   - Configure the consent screen if prompted.
   - Choose "Web application" as the application type.
   - Add authorized redirect URIs.
   - Click "Create".

6. **Retrieve Client ID and Client Secret**:
   - After creating, a popup will display your client ID and client secret.
   - You can also find them later in the "Credentials" section.

## Additional Resources

- [Google API Documentation](https://developers.google.com/api-client-library)
- [OAuth 2.0 Overview](https://developers.google.com/identity/protocols/oauth2)
