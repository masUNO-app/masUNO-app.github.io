/**
 * masUNO waitlist → Google Sheets
 *
 * The page signs people up in three steps:
 *   action=join     email + source + tz → appends a row, returns { position, token, referralCode }
 *   action=details  email + token + role/campus → fills in that row
 *   action=details  email + token + sports → fills in sports in the same row
 * The token stops anyone from editing someone else's row just by knowing their email.
 * Referral codes are short, public and non-secret; Referred by stores the inviter's code.
 * Country is estimated from the browser's time zone. Only the country is stored, not the zone.
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
 * so the /exec URL stays the same. Running setup() on an existing Sheet only adds
 * missing headers at the end; it does not move the private Token column.
 */

// PLACEHOLDER: leave blank when this script is bound to the Sheet (Extensions → Apps Script).
// If you made a standalone script instead, paste the Sheet ID from its URL here.
const SHEET_ID = "";
const SHEET_NAME = "Waitlist";
// New columns go at the end: moving Token would break the rows already in the Sheet
const HEADERS = ["Joined", "Email", "Role", "Campus", "Sports", "Source", "Details added", "Token", "Country", "Referral code", "Referred by"];
const COL = { email: 2, role: 3, campus: 4, sports: 5, detailsAt: 7, token: 8, referralCode: 10, referredBy: 11 };
const REFERRER_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

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
      if (Object.prototype.hasOwnProperty.call(p, "role")) {
        sheet.getRange(row, COL.role).setValue(clean_(p.role, 20));
      }
      if (Object.prototype.hasOwnProperty.call(p, "campus")) {
        sheet.getRange(row, COL.campus).setValue(clean_(p.campus, 80));
      }
      if (Object.prototype.hasOwnProperty.call(p, "sports")) {
        sheet.getRange(row, COL.sports).setValue(clean_(p.sports, 120));
      }
      sheet.getRange(row, COL.detailsAt).setValue(new Date());
      return json_({ ok: true });
    }

    // Already signed up: keep the response successful and make sure older rows get a code.
    // Never return their private edit token to someone who only knows the email.
    if (row) {
      return json_({ ok: true, duplicate: true, referralCode: ensureReferralCode_(sheet, row) });
    }

    const token = Utilities.getUuid();
    const referralCode = ensureReferralCode_(sheet, 0);
    const source = clean_(p.source, 200);
    const referredBy = findReferralRow_(sheet, source) ? source : "";
    sheet.appendRow([new Date(), email, "", "", "", source, "", token, country_(p.tz), referralCode, referredBy]);
    return json_({ ok: true, position: sheet.getLastRow() - 1, token: token, referralCode: referralCode });
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

// Run once to create the tab or add newly introduced headers to an existing tab.
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
  } else {
    // Compatibility with existing rows: only fill empty new headers at the far right.
    for (let col = 10; col <= HEADERS.length; col++) {
      if (!sheet.getRange(1, col).getValue()) sheet.getRange(1, col).setValue(HEADERS[col - 1]).setFontWeight("bold");
    }
  }
  return sheet;
}

function findRow_(sheet, email) {
  const cell = sheet.getRange(1, COL.email, sheet.getMaxRows(), 1)
    .createTextFinder(email).matchEntireCell(true).findNext();
  return cell ? cell.getRow() : 0;
}

function findReferralRow_(sheet, code) {
  if (!code) return 0;
  const cell = sheet.getRange(1, COL.referralCode, sheet.getMaxRows(), 1)
    .createTextFinder(code).matchEntireCell(true).findNext();
  return cell ? cell.getRow() : 0;
}

// Returns the row's existing code, or generates a unique short code. Row 0 means a new row.
function ensureReferralCode_(sheet, row) {
  if (row) {
    const existing = String(sheet.getRange(row, COL.referralCode).getValue() || "").trim();
    if (existing) return existing;
  }
  let code = "";
  do {
    code = "";
    for (let i = 0; i < 8; i++) {
      code += REFERRER_ALPHABET.charAt(Math.floor(Math.random() * REFERRER_ALPHABET.length));
    }
  } while (findReferralRow_(sheet, code));
  if (row) sheet.getRange(row, COL.referralCode).setValue(code);
  return code;
}

// Time zone → country. Blank if the browser didn't send one (for example, an old cached page).
// It reflects where the device is right now, so someone traveling shows up where they are.
function country_(tz) {
  const zone = String(tz || "");
  if (!zone) return "";
  if (/^(America\/(Bahia_Banderas|Cancun|Chihuahua|Ciudad_Juarez|Ensenada|Hermosillo|Matamoros|Mazatlan|Merida|Mexico_City|Monterrey|Ojinaga|Santa_Isabel|Tijuana)|Mexico\/\w+)$/.test(zone)) return "Mexico";
  if (/^(America\/(Adak|Anchorage|Atka|Boise|Chicago|Denver|Detroit|Fort_Wayne|Indiana\/\w+|Indianapolis|Juneau|Kentucky\/\w+|Knox_IN|Los_Angeles|Louisville|Menominee|Metlakatla|New_York|Nome|North_Dakota\/\w+|Phoenix|Shiprock|Sitka|Yakutat)|Pacific\/Honolulu|US\/\w+)$/.test(zone)) return "USA";
  return "Other";
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
