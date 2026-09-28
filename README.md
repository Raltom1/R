# Reign Kerstine — Portfolio https://raltom1.github.io/R/

A responsive portfolio website with a hidden admin panel for managing content,
using Google Sheets as the database and Google Apps Script as the backend API.

## Project structure

| File | Purpose |
|---|---|
| `index.html` | Public portfolio page |
| `admin.html` | Hidden admin dashboard |
| `style.css` | Shared styling, layout, animations, responsiveness |
| `script.js` | Public page rendering, contact form submit, scroll reveal effects |
| `admin.js` | Admin login, session guard, content editing, inbox management |
| `config.js` | Web App URL for the Apps Script backend |
| `Code.gs` | Backend logic for Sheets access, auth, and content management |
| `README.md` | Setup and usage guide |

## 1. Create the Google Sheet

1. Open [sheets.google.com](https://sheets.google.com) and create a new spreadsheet.
2. Name it anything you want, for example: `Portfolio Database`.
3. You do not need to create tabs manually. The Apps Script will auto-create:
   - `Settings`
   - `Projects`
   - `Skills`
   - `Messages`

## 2. Configure the Apps Script backend

1. Open your blank Google Sheet.
2. Go to **Extensions → Apps Script**.
3. Delete the default starter code and paste the full contents of `Code.gs` into the Apps Script editor.
4. In the Apps Script editor, open **Project Settings** (gear icon) → **Script Properties**.
5. Add the following values:
   - `ADMIN_USER` → your admin username
   - `ADMIN_PASS_HASH` → keep this blank for now if you want the app to generate it on first login, or set a hash manually if you already have one
6. After pasting the code, do this in the Apps Script editor:
   - select **`initializePortfolio`** from the function dropdown
   - click **Run**
   - allow the required Google permissions
   - this will automatically create the needed Sheets tabs: `Settings`, `Projects`, `Skills`, and `Messages`
7. If the sheet is still empty after the first run, run **`seedInitialContent`** once to add the starter portfolio content.
8. Then go back to **Deploy → New deployment**.
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
9. Click **Deploy** and copy the generated Web App URL ending in `/exec`.

### Important: how to run it the first time

Use this exact flow in Apps Script:

1. Paste `Code.gs`
2. Run `initializePortfolio`
3. If the sheet is empty, run `seedInitialContent`
4. Deploy the web app
5. Copy the deployment URL

This ensures the spreadsheet is created automatically and the database is ready without manual table setup.

## 3. Connect the frontend

Open `config.js` and replace the placeholder URL:

```js
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycb.../exec";
```

Save the file. Both the public site and the admin dashboard use this URL.

## 4. Open and test the app

- Public site: open `index.html` in a browser, or deploy the folder to a static host.
- Admin panel: open `admin.html` directly in the browser.
- Login with the username and password configured in Script Properties.

The admin dashboard includes:
- About settings
- Project editor
- Skills editor
- Contact settings
- Footer settings
- Contact form message inbox
- Clear inbox action

## 5. Admin security behavior

The admin page includes:
- a login form
- a temporary session token
- a forced logout flow
- guard checks to prevent stale admin access after logout
- a custom confirm modal before destructive actions such as logout and clear inbox
- toast notifications for success/error messages

This is a lightweight but practical personal-portfolio security pattern. It is not enterprise-grade security, but it prevents casual session reuse and prevents the admin screen from being accessed after logout in the same browser session.

## Important notes

- `index.html` has no admin link or login button by design.
- The admin page is intentionally hidden and must be accessed directly.
- If you update `Code.gs`, redeploy the Apps Script web app so the frontend uses the latest backend version.
- Contact messages are stored in the `Messages` sheet and can be reviewed or cleared from the admin panel.

## Customization

- Colors and fonts are defined in `style.css` under `:root`.
- Project data and settings are stored in the Google Sheet.
- Add more settings by editing `Code.gs` and the matching admin fields in `admin.html`.

## Troubleshooting

### Login not working
- Confirm the Web App URL in `config.js` is correct.
- Confirm `ADMIN_USER` is set in Apps Script Script Properties.
- Confirm the password is valid and the script has been redeployed after changes.

### Admin page keeps loading
- Check that the Apps Script project is bound to the same spreadsheet you expect.
- Re-run `seedInitialContent` once if the sheet is empty.
- Make sure the deployed web app is the current version.

### Clear inbox shows an error
- Make sure the script has been redeployed after updating `Code.gs`.
- Confirm the backend action `clearMessages` is reachable from the current deployed URL.

## Recommended final setup

For a personal portfolio, use a strong but memorable admin password and keep the Apps Script project private to your Google account. Avoid using the same password across other services.
