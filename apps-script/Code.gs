/**
 * masUNO waitlist → Google Sheets
 *
 * The page signs people up in two steps:
 *   action=join     email + source → appends a row, returns { position, token }
 *   action=details  email + token + role/campus/sports → fills in that row
 * The token stops anyone from editing someone else's row just by knowing their email.
 *
 * Setup (about 20 minutes, full steps in README.md):
 *   1. Create a Google Sheet, then Extensions → Apps Script. Paste this file in.
 *   2. Run setup() once from the editor and approve the permissions.
 *   3. Deploy → New deployment → Web app
 *        Execute as: Me
 *        Who has access: Anyone
 *   4. Copy the /exec URL into WAITLIST_ENDPOINT in script.js.
 *
 * After editing this file, use Deploy → Manage deployments → Edit → New version,
 * so the /exec URL stays the same.
 */

// PLACEHOLDER: leave blank when this script is bound to the Sheet (Extensions → Apps Script).
// If you made a standalone script instead, paste the Sheet ID from its URL here.
const SHEET_ID = "";
const SHEET_NAME = "Waitlist";
const HEADERS = ["Joined", "Email", "Role", "Campus", "Sports", "Source", "Details added", "Token"];
const COL = { email: 2, role: 3, campus: 4, sports: 5, detailsAt: 7, token: 8 };

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const p = (e && e.parameter) || {};

    // Honeypot field from the form; real people never fill it in
    if (p.website) return json_({ ok: true });

    const email = String(p.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return json_({ ok: false, error: "invalid_email" });
    }

    const sheet = getSheet_();
    const row = findRow_(sheet, email);

    if (p.action === "details") {
      if (!row) return json_({ ok: false, error: "not_found" });
      const token = sheet.getRange(row, COL.token).getValue();
      if (!p.token || p.token !== token) return json_({ ok: false, error: "bad_token" });
      sheet.getRange(row, COL.role, 1, 3).setValues([[clean_(p.role, 20), clean_(p.campus, 80), clean_(p.sports, 120)]]);
      sheet.getRange(row, COL.detailsAt).setValue(new Date());
      return json_({ ok: true });
    }

    // action=join (the default). Already signed up: treat as success so nobody is told off for it
    if (row) return json_({ ok: true, duplicate: true });

    const token = Utilities.getUuid();
    sheet.appendRow([new Date(), email, "", "", "", clean_(p.source, 200), "", token]);
    return json_({ ok: true, position: sheet.getLastRow() - 1, token: token });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: "server_error" });
  } finally {
    lock.releaseLock();
  }
}

// Visiting the /exec URL in a browser should show this, which confirms the deployment works
function doGet() {
  return json_({ ok: true, service: "masUNO waitlist" });
}

// Run once from the Apps Script editor to create the tab and header row
function setup() {
  const sheet = getSheet_();
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight("bold");
  sheet.setFrozenRows(1);
  sheet.hideColumns(COL.token);
}

function getSheet_() {
  const ss = SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function findRow_(sheet, email) {
  const cell = sheet.getRange(1, COL.email, sheet.getMaxRows(), 1)
    .createTextFinder(email).matchEntireCell(true).findNext();
  return cell ? cell.getRow() : 0;
}

// Trim, cap length, and stop values like "=IMPORTXML(...)" from running as formulas in the Sheet
function clean_(value, max) {
  let s = String(value || "").trim().slice(0, max);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
