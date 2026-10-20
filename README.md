# masUNO landing page

The landing page and waitlist for masUNO. It's plain HTML, CSS and JS with no build step: open `index.html` in a browser, or host the folder on GitHub Pages.

```
index.html          page content
privacy.html        privacy notice, linked under each form and in the footer
styles.css          design tokens from DESIGN.md
script.js           interactions and the waitlist (set WAITLIST_ENDPOINT here)
apps-script/Code.gs Google Apps Script that writes signups to a Sheet
assets/screens/     app screenshots from Figma or Xcode
assets/people/      persona photos
```

## 1. Add the screenshots and photos

Every screenshot and photo spot shows a dashed placeholder with its expected file path. Save a file at that path and it replaces the placeholder automatically; you don't need to edit any HTML.

| File | What it shows | Used in |
|---|---|---|
| `assets/screens/map.png` | Map (home) | Hero phone, "I want to play" step 1 |
| `assets/screens/event-detail.png` | Event detail with RSVP | "I want to play" step 2 |
| `assets/screens/your-plans.png` | Your plans | "I want to play" step 3 |
| `assets/screens/create-event.png` | Create event | "I need players" step 1 |
| `assets/screens/host.png` | You're the host | "I need players" step 2 |
| `assets/screens/repost.png` | Reposting a spot after someone drops | "I need players" step 3 |
| `assets/people/emilio.jpg` | Emilio (square crop) | Story card and closing section |
| `assets/people/ricardo.jpg` | Ricardo (square crop) | Story card and closing section |
| `assets/og-image.png` | 1200×630 link preview | Social sharing |
| `favicon.png` + `apple-touch-icon.png` | The masUNO app icon (once we have one), 32×32 and 180×180 | Browser tab and iPhone home screen. Replace the favicon `TODO` comment in the `<head>` of `index.html` and `privacy.html` with the links it shows |

Export screens at full iPhone resolution (1179×2556 from the iPhone 15/16 Pro simulator, or a Figma iPhone frame at 3x). Export the screen only, without a device frame, because the page draws its own charcoal frame.

- **Xcode:** run the app in the simulator, then press Cmd+S.
- **Figma:** select the frame, then Export → PNG at 3x.

## 2. Connect the waitlist to Google Sheets (about 20 minutes)

1. Create a Google Sheet, for example "masUNO waitlist".
2. In the Sheet, open **Extensions → Apps Script**. Delete the starter code and paste in `apps-script/Code.gs`. Save.
3. In the function dropdown, choose `setup` and click **Run**. Approve the permissions. This creates a **Waitlist** tab with a header row.
4. Click **Deploy → New deployment**. Choose the **Web app** type and set:
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Click **Deploy** and copy the web app URL (it ends in `/exec`).
6. Open the URL in a browser. You should see `{"ok":true,"service":"masUNO waitlist"}`.
7. In `script.js`, replace `PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE` with that URL.
8. Submit the form on the page and check that a row appears in the Sheet.

Until step 7 is done, the signup still works locally: it logs what it would have sent to the browser console and runs through both steps.

**If you change `Code.gs` later,** use **Deploy → Manage deployments → Edit (pencil) → Version: New version**. Creating a new deployment instead gives you a different URL.

**How signup works:** people enter just their email, in the hero or at the bottom of the page. That adds a row right away and opens a popup showing their place in line ("You're #42 on the list") with two optional questions: player or host, campus, and sports. Answering fills in the same row.

**What gets saved:** join time, email, role, campus, sports, source, and when details were added. Source comes from `?ref=` or `?utm_source=` in the link, so you can tell signups apart, for example `…/?ref=clubfair` or `…/?ref=instagram`. A hidden Token column stops anyone from editing someone else's row.

**Built-in protection:** duplicate emails are ignored, a hidden honeypot field filters out simple bots, and values starting with `=` aren't run as formulas in the Sheet.

## 3. Publish on GitHub Pages

Push to GitHub, then go to **Settings → Pages → Deploy from a branch → `main` / root**.

## 4. Share the link with a `?ref=` tag

Whenever you share the waitlist, add `?ref=` and a short label to the end of the link, so the Sheet's **Source** column shows where each signup came from:

| Where you share it | Link to use |
|---|---|
| QR code at a club fair | `…/?ref=clubfair` |
| Instagram bio or story | `…/?ref=instagram` |
| A dorm or club group chat | `…/?ref=dorm-chat` |
| A flyer | `…/?ref=flyer` |

Use lowercase labels with no spaces, and reuse the same label for the same place so the counts add up. Links without a tag show up as the referring website, or as `direct`. `?utm_source=` works too, if a tool adds that instead.

## Before launching in Mexico

The page collects emails, so Mexican data-protection law (LFPDPPP) requires a privacy notice. `privacy.html` is a first draft, and every form has a short notice linking to it. Before launch:

- Fill in the highlighted placeholders in `privacy.html`: who is responsible for the data, their address in Mexico, a privacy contact email, and how long you keep the data.
- Add a Spanish version (aviso de privacidad). That's the version that counts in Mexico.
- Have someone who knows Mexican data-protection law review it.
- When someone asks to see, correct or delete their data, find their row in the Sheet and update or delete it.

## Still to decide

These come from the open decisions in DESIGN.md and show up on the page:

- **Campus list** in the signup popup (Tec de Monterrey, IIT, UIC and Princeton for now). Marked with a `TODO` in `index.html`.
- **Language:** the page is English only for now. A Spanish version is planned for the Mexico launch. All the copy is in `index.html`, plus the runtime messages at the top of `script.js`.
- **Wordmark:** written as `masUNO` in the nav and footer.
