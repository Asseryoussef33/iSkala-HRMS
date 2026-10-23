# iSkala HR

The app UI runs on GitHub Pages (hr.iskala.ai). Google Apps Script stays as the backend: Google Sheet database, emails, Drive documents and the Slack `/wfh` command.

## Folders

- `docs/`: the website GitHub Pages serves (index.html, config.js, favicon, CNAME)
- `apps-script/`: backend files to paste into the Apps Script editor (not served by the site)

## What changed

- `apps-script/Code.gs`: only the `doPost` function at the very bottom. Requests with `?api=1` go to the app API; everything else (Slack) goes to the original handler exactly as before.
- `docs/index.html`: talks to Apps Script with `fetch` instead of `google.script.run`. Design and features are the same.

## Setup

1. **Apps Script**: replace `Code.gs` with `apps-script/Code.gs`, save. Keep the existing `Index.html` there.
   Deploy: Manage deployments, pencil icon, Version: New version, Deploy. Use the existing deployment so the `/exec` URL and Slack keep working.
2. **config.js**: paste that `/exec` URL into `docs/config.js`.
3. **GitHub**: push this folder to a repo. Settings, Pages, Source: deploy from branch `main`, folder `/docs`.
4. **GoDaddy DNS**: set `hr` as a CNAME to `<your-github-username>.github.io` (remove the old GHL record).
5. Back in Settings, Pages: wait for the certificate, then tick "Enforce HTTPS".

## Notes

- Slack points at the `script.google.com` URL, not hr.iskala.ai, so the DNS change does not affect it.
- No secrets live in these files. Tokens and keys stay in Apps Script Script Properties.
- After any backend change, deploy a new version of the existing deployment. Front-end changes only need a push to GitHub.
