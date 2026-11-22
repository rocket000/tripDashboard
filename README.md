# Thailand trip dashboard

A mobile-friendly document hub hosted on GitHub Pages. Travelers open a single group link, connect the Google account you invited, and browse and preview files in the dashboard.

## Set up Google Drive and OAuth

1. The dashboard opens the trip folder configured in [site/trip.js](site/trip.js). Set **General access** to **Restricted** and share the folder with the seven travelers' Google accounts. Give most travelers Viewer access. Keep identity documents in separately restricted folders if their access should differ from that of the group.
2. Create a Google Cloud project and enable the **Google Drive API**. In **Google Auth Platform**, configure Branding and set **Audience** to **External → Testing**. Add the seven Google accounts as test users.
3. In **Data Access**, add `https://www.googleapis.com/auth/drive.readonly`. This Google permission grants the dashboard read access across each consenting account's Drive. The dashboard uses the permission to list the shared trip folder and fetch the PDFs or images a traveler selects.
4. Create a **Web application** OAuth client. Under **Authorized JavaScript origins**, add `https://YOUR-GITHUB-USERNAME.github.io`. For local testing also add `http://localhost:8000`. Enter the origin with no repository path. The browser popup flow uses the client ID. Keep the client secret private.

[Drive sharing](https://support.google.com/drive/answer/7166529) · [OAuth client setup](https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid) · [Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)

## Deploy and share

1. Push this project to the `main` branch of your GitHub repository. In **Settings → Secrets and variables → Actions → Variables**, create the repository variable `GOOGLE_OAUTH_CLIENT_ID` with your web client ID. GitHub publishes the client ID as configuration.
2. In **Settings → Pages**, select **GitHub Actions**. From the **Actions** tab, run **Deploy dashboard to GitHub Pages**. Further pushes to `main` deploy automatically.
3. Open the published site at `https://YOUR-GITHUB-USERNAME.github.io/YOUR-REPOSITORY/`. Test with an invited account and a sample PDF. Then test in a separate browser profile with an uninvited account and confirm that the dashboard exposes no document names or contents. If you want to test Drive permissions independently of Google's test-user gate, temporarily add the second account as an OAuth test user while leaving the Drive folder unshared with it. Remove it from the test list afterward. Share the site URL with the group when ready.

GitHub Pages serves the site and its configured folder IDs publicly. Google Drive enforces access to each folder and document. The site holds tokens, document names, and preview content in browser memory. Reloading the page or selecting **Disconnect** clears the session on the page. Travelers can revoke the app's authorization in their Google Account settings.

[GitHub Pages deployment](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

## Run locally

Use Node.js 24 and Python 3.

```sh
npm ci --ignore-scripts --omit=optional --registry=https://registry.npmjs.org
npm test
GOOGLE_OAUTH_CLIENT_ID=YOUR_CLIENT_ID npm run build
python3 -m http.server 8000 --bind 127.0.0.1 --directory dist
```

Open `http://localhost:8000/`. The gallery opens the first previewable file in the current folder. Search by filename or select a card to switch the preview. It previews PDFs and common images up to 30 MiB when Drive allows the account to download them. The selected file always has an **Open in Drive** link.
