# masUNO landing page

The landing page and waitlist for masUNO. It's plain HTML, CSS and JS with no build step.

- **Live site:** https://masuno-app.github.io/ (GitHub Pages, deployed from `main`)
- **Waitlist:** connected. Signups go to the **Waitlist** tab of the masUNO waitlist Google Sheet through the Apps Script in `apps-script/Code.gs`.

```
index.html          page content
privacy.html        privacy notice, linked under each form and in the footer
styles.css          tokens from the masUNO design system (Verde cancha) and all animations
script.js           interactions and the waitlist (set WAITLIST_ENDPOINT here)
apps-script/Code.gs Google Apps Script that writes signups to a Sheet
assets/screens/     app screenshots from Figma or Xcode
assets/people/      persona photos
```

## 1. Add the screenshots and photos

Every screenshot and photo spot shows a placeholder with its expected file path (persona photos show initials until then). Save a file at that path and it replaces the placeholder automatically; you don't need to edit any HTML.

| File | What it shows | Used in |
|---|---|---|
| `assets/screens/map.png` | Map (home) | "I want to play" step 1 |
| `assets/screens/event-detail.png` | Event detail with RSVP | "I want to play" step 2 |
| `assets/screens/your-plans.png` | Your plans | "I want to play" step 3 |
| `assets/screens/create-event.png` | Create event | "I need players" step 1 |
| `assets/screens/host.png` | You're the host | "I need players" step 2 |
| `assets/screens/repost.png` | Reposting a spot after someone drops | "I need players" step 3 |
| `assets/people/emilio.jpg` | Emilio (square crop) | Story card and closing section |
| `assets/people/ricardo.jpg` | Ricardo (square crop) | Story card and closing section |
| `assets/og-image.png` | 1200×630 link preview | Social sharing |
| `favicon.png` + `apple-touch-icon.png` | The masUNO app icon (once we have one), 32×32 and 180×180 | Browser tab and iPhone home screen. Replace the favicon `TODO` comment in the `<head>` of `index.html` and `privacy.html` with the links it shows |

Export screens at full iPhone resolution (1179×2556 from the iPhone 15/16 Pro simulator, or a Figma iPhone frame at 3x). Export the screen only, without a device frame, because the page draws its own navy phone frame.

- **Xcode:** run the app in the simulator, then press Cmd+S.
- **Figma:** select the frame, then Export → PNG at 3x.

## 2. The waitlist (Google Sheets)

The Apps Script is deployed as a web app, and its `/exec` URL is set as `WAITLIST_ENDPOINT` at the top of `script.js`. Opening that URL in a browser should show `{"ok":true,"service":"masUNO waitlist"}`, which is a quick way to check it's still up.

**Changing `Code.gs`:** paste the new code into the Sheet's **Extensions → Apps Script**, save, then use **Deploy → Manage deployments → Edit (pencil) → Version: New version**. Don't create a new deployment: that gives you a different URL, and the live site would keep posting to the old one.

**Working with the Sheet:**

- To remove a signup (a test entry, or someone asking to be deleted), right-click the row number → **Delete row**. Don't just clear the cells: the "You're #N on the list" number counts filled rows, so blank rows push everyone's number up.
- Keep totals, notes and charts on a separate tab. Anything typed below the signups also changes the numbers.
- Don't rename the **Waitlist** tab, reorder its columns, or edit the hidden **Token** column. The script depends on all three.
- To sort or filter, use **Data → Create a filter view** so the real row order stays the same.

**Testing:** test signups in a regular browser, not VS Code's built-in browser. VS Code's browser blocks Google's reply, so the popup says saving failed even though the row was written. Delete your test rows before sharing the link.

<details>
<summary>Setting it up again from scratch</summary>

1. Create a Google Sheet, then open **Extensions → Apps Script**. Delete the starter code, paste in `apps-script/Code.gs` and save.
2. In the function dropdown, choose `setup` and click **Run**. Approve the permissions. This creates the **Waitlist** tab with a header row.
3. Click **Deploy → New deployment**, choose **Web app**, and set Execute as **Me** and Who has access **Anyone**.
4. Copy the URL ending in `/exec` into `WAITLIST_ENDPOINT` in `script.js`, then push.

If `WAITLIST_ENDPOINT` still starts with `PASTE_`, the form doesn't send anything. It logs what it would have sent to the browser console instead, so you can test the page locally.

</details>

**How signup works:** people enter just their email, in the hero or at the bottom of the page. That adds a row right away and opens a popup showing their place in line ("You're #42 on the list") with two optional questions: player or host, campus, and sports. Answering fills in the same row.

**What gets saved:** join time, email, role, campus, sports, source, and when details were added. Source comes from `?ref=` or `?utm_source=` in the link, so you can tell signups apart, for example `…/?ref=clubfair` or `…/?ref=instagram`. A hidden Token column stops anyone from editing someone else's row.

**Built-in protection:** duplicate emails are ignored, a hidden honeypot field filters out simple bots, and values starting with `=` aren't run as formulas in the Sheet.

## 3. Publishing changes

The site is served by GitHub Pages from the root of `main`. Push to `main` and the live site updates within a minute or two. Hard-refresh (Cmd+Shift+R) if you still see the old version.

## 4. Share the link with a `?ref=` tag

Whenever you share the waitlist, add `?ref=` and a short label to the end of the link, so the Sheet's **Source** column shows where each signup came from:

| Where you share it | Link to use |
|---|---|
| QR code at a club fair | `https://masuno-app.github.io/?ref=clubfair` |
| Instagram bio or story | `https://masuno-app.github.io/?ref=instagram` |
| A dorm or club group chat | `https://masuno-app.github.io/?ref=dorm-chat` |
| A flyer | `https://masuno-app.github.io/?ref=flyer` |

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
