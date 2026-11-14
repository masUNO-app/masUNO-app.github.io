/**
 * masUNO waitlist → Google Sheets
 *
 * The page signs people up in three steps:
 *   action=join     email + source + tz → appends a row, returns { position, token, referralCode }
 *   action=details  email + token + role/campus → fills in that row
 * The token stops anyone from editing someone else's row just by knowing their email.
 * Referral codes are short, public and non-secret; Referred by stores the inviter's code.
 * Country is estimated from the browser's time zone. Only the country is stored, not the zone.
 *
 * One waitlist with the app: the Sheet is kept in step with the app's sign-up queue in Supabase.
 *   - A new website join also calls Supabase (waitlist_join). A school email from an open campus
 *     keeps its place in the app; the answer fills the "App ..." columns at the far right.
 *   - Supabase pushes changes here (action=sync, JSON, with the shared secret), and reconcile()
 *     pulls everything once an hour and retries joins that never reached Supabase.
 *   - If Supabase is down or not set up, the website join works exactly as before (Sheet only).
 *
 * Setup (about 20 minutes, full steps in README.md):
 *   1. Create a Google Sheet, then Extensions → Apps Script. Paste this file in.
 *   2. Project Settings → Script Properties: add WAITLIST_SYNC_SECRET, SUPABASE_URL and
 *      SUPABASE_ANON_KEY (leave them out to run Sheet-only).
 *   3. Run setup() once from the editor and approve the permissions.
 *   4. Run installSyncTrigger() once (hourly reconcile; safe to run again).
 *   5. Deploy → New deployment → Web app
 *        Execute as: Me
 *        Who has access: Anyone
 *   6. Copy the /exec URL into WAITLIST_ENDPOINT in script.js, and into Supabase Vault as
 *      waitlist_sync_url.
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
const HEADERS = ["Joined", "Email", "Role", "Campus", "Sports", "Source", "Details added", "Token", "Country", "Referral code", "Referred by",
  "App status", "App place", "Signed up in app", "Invited by", "Synced at"];
const COL = { joined: 1, email: 2, role: 3, campus: 4, sports: 5, detailsAt: 7, token: 8, referralCode: 10, referredBy: 11,
  appStatus: 12, appPlace: 13, signedUpInApp: 14, invitedBy: 15, syncedAt: 16 };
// What Supabase calls each status → what the Sheet shows
const APP_STATUS = { waiting: "Waiting", approved: "Approved", member: "In the app", not_school: "Not a school email", removed: "Removed" };
const MAX_SYNC_ROWS = 2000; // most rows one push may carry
const MAX_RETRIES_PER_RUN = 25; // joins retried per reconcile, to stay inside Apps Script's time limit
const REFERRER_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function doPost(e) {
  const startedAt = Date.now();
  const p = (e && e.parameter) || {};
  const timing = { lockMs: 0, sheetMs: 0, lookupMs: 0, writeMs: 0, syncMs: 0 };
  let outcome = "success";
  let stageStartedAt = 0;
  const lock = LockService.getScriptLock();
  try {
    stageStartedAt = Date.now();
    lock.waitLock(10000);
    timing.lockMs = Date.now() - stageStartedAt;

    // Push from Supabase: JSON with the shared secret. Not the public form, so no honeypot or email checks.
    if (e && e.postData && /^application\/json/i.test(e.postData.type || "")) {
      outcome = "sync";
      return json_(handleSync_(e.postData.contents));
    }

    // Honeypot field from the form; real people never fill it in
    if (p.website) {
      outcome = "honeypot";
      return json_({ ok: true });
    }

    const email = String(p.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      outcome = "invalid_email";
      return json_({ ok: false, error: "invalid_email" });
    }

    stageStartedAt = Date.now();
    const sheet = getSheet_();
    timing.sheetMs = Date.now() - stageStartedAt;
    stageStartedAt = Date.now();
    const row = findRow_(sheet, email);
    timing.lookupMs = Date.now() - stageStartedAt;

    if (p.action === "details") {
      if (!row) {
        outcome = "not_found";
        return json_({ ok: false, error: "not_found" });
      }
      stageStartedAt = Date.now();
      const token = sheet.getRange(row, COL.token).getValue();
      timing.lookupMs += Date.now() - stageStartedAt;
      if (!p.token || p.token !== token) {
        outcome = "bad_token";
        return json_({ ok: false, error: "bad_token" });
      }
      stageStartedAt = Date.now();
      if (Object.prototype.hasOwnProperty.call(p, "role")) {
        sheet.getRange(row, COL.role).setValue(clean_(p.role, 20));
      }
      if (Object.prototype.hasOwnProperty.call(p, "campus")) {
        sheet.getRange(row, COL.campus).setValue(clean_(p.campus, 80));
      }
      sheet.getRange(row, COL.detailsAt).setValue(new Date());
      timing.writeMs = Date.now() - stageStartedAt;
      return json_({ ok: true });
    }

    // Already signed up: keep the response successful and make sure older rows get a code.
    // Never return their private edit token to someone who only knows the email.
    if (row) {
      outcome = "duplicate";
      stageStartedAt = Date.now();
      const referralCode = ensureReferralCode_(sheet, row);
      const stored = sheet.getRange(row, COL.appStatus, 1, 5).getValues()[0];
      const joinedAt = sheet.getRange(row, COL.joined).getValue();
      timing.lookupMs += Date.now() - stageStartedAt;
      let result = null;
      if (!stored[4]) {
        // Never confirmed by Supabase: try again. Done outside the lock so a slow answer blocks nobody.
        lock.releaseLock();
        stageStartedAt = Date.now();
        result = joinSupabase_(email, joinedAt);
        if (result) recordSync_(email, result);
        timing.syncMs = Date.now() - stageStartedAt;
      } else {
        result = storedResult_(stored);
      }
      return json_(withApp_({ ok: true, duplicate: true, referralCode: referralCode }, result));
    }

    const token = Utilities.getUuid();
    stageStartedAt = Date.now();
    const referralCode = ensureReferralCode_(sheet, 0);
    const source = clean_(p.source, 200);
    const referredBy = findReferralRow_(sheet, source) ? source : "";
    timing.lookupMs += Date.now() - stageStartedAt;
    stageStartedAt = Date.now();
    const joinedAt = new Date();
    sheet.appendRow([joinedAt, email, "", "", "", source, "", token, country_(p.tz), referralCode, referredBy]);
    const position = sheet.getLastRow() - 1;
    timing.writeMs = Date.now() - stageStartedAt;
    // Tell Supabase outside the lock, so a slow answer blocks nobody. If it fails, the website still
    // gets its answer from the Sheet and reconcile() retries later (Synced at stays blank).
    lock.releaseLock();
    stageStartedAt = Date.now();
    const result = joinSupabase_(email, joinedAt);
    if (result) recordSync_(email, result);
    timing.syncMs = Date.now() - stageStartedAt;
    const res = withApp_({ ok: true, position: position, token: token, referralCode: referralCode }, result);
    if (result && (result.status === "approved" || result.status === "member")) delete res.position;
    return json_(res);
  } catch (err) {
    outcome = "server_error";
    console.error(err);
    return json_({ ok: false, error: "server_error" });
  } finally {
    try { lock.releaseLock(); } catch (_) { /* already released */ }
    // Timing only: never log the email, token, campus or other personal data.
    console.info(JSON.stringify({
      event: "waitlist_latency",
      action: p.action || "join",
      outcome: outcome,
      totalMs: Date.now() - startedAt,
      lockMs: timing.lockMs,
      sheetMs: timing.sheetMs,
      lookupMs: timing.lookupMs,
      writeMs: timing.writeMs,
      syncMs: timing.syncMs,
    }));
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

// ---------- Sync with the app's waitlist (Supabase) ----------

// Script Properties hold the shared secret and Supabase's public URL and key. Without all three
// the script stays Sheet-only (logged once, so the log isn't flooded).
function syncConfig_() {
  const props = PropertiesService.getScriptProperties();
  const secret = props.getProperty("WAITLIST_SYNC_SECRET");
  const url = props.getProperty("SUPABASE_URL");
  const key = props.getProperty("SUPABASE_ANON_KEY");
  if (secret && url && key) return { secret: secret, url: String(url).replace(/\/+$/, ""), key: key };
  if (!props.getProperty("SYNC_NOTE_LOGGED")) {
    props.setProperty("SYNC_NOTE_LOGGED", "1");
    console.info("App sync is off: set WAITLIST_SYNC_SECRET, SUPABASE_URL and SUPABASE_ANON_KEY in Script Properties.");
  }
  return null;
}

// Calls a Supabase function. Returns the parsed JSON, or null on any failure. Apps Script can't set a
// timeout on a fetch, so the call is made outside the lock and a failure only costs the app status.
function callSupabase_(cfg, fn, body) {
  try {
    const res = UrlFetchApp.fetch(cfg.url + "/rest/v1/rpc/" + fn, {
      method: "post",
      contentType: "application/json",
      headers: { apikey: cfg.key, Authorization: "Bearer " + cfg.key },
      payload: JSON.stringify(body),
      muteHttpExceptions: true,
    });
    if (res.getResponseCode() !== 200) {
      console.warn("Supabase " + fn + " answered " + res.getResponseCode());
      return null;
    }
    return JSON.parse(res.getContentText());
  } catch (err) {
    console.warn("Supabase " + fn + " failed: " + (err && err.message));
    return null;
  }
}

// Website → Supabase. Returns { status, position } or null when sync is off or Supabase didn't answer.
function joinSupabase_(email, joinedAt) {
  const cfg = syncConfig_();
  if (!cfg) return null;
  const res = callSupabase_(cfg, "waitlist_join", {
    p_secret: cfg.secret,
    p_email: email,
    p_joined_at: isoDate_(joinedAt),
    p_source: "website",
  });
  if (!res || res.ok !== true || !Object.prototype.hasOwnProperty.call(APP_STATUS, res.status)) return null;
  const position = res.status === "waiting" && Number(res.position) > 0 ? Number(res.position) : null;
  return { status: res.status, position: position };
}

// Saves what Supabase said about a website join. Re-finds the row (it may have moved) and skips
// quietly if the lock is busy; the row keeps a blank Synced at and reconcile() retries it.
function recordSync_(email, result) {
  const lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(5000)) return;
    const sheet = getSheet_();
    const row = findRow_(sheet, email);
    if (!row) return;
    const cells = appCells_({ status: result.status, requestedAt: null, source: "website", invitedBy: "" }, result.position || "");
    cells[2] = sheet.getRange(row, COL.signedUpInApp).getValue();
    cells[3] = sheet.getRange(row, COL.invitedBy).getValue();
    sheet.getRange(row, COL.appStatus, 1, 5).setValues([cells.concat([new Date()])]);
  } catch (err) {
    console.error(err);
  } finally {
    try { lock.releaseLock(); } catch (_) { /* not held */ }
  }
}

// What the Sheet already says about a row, as a join result
function storedResult_(stored) {
  const status = appStatusCode_(stored[0]);
  if (!status) return null;
  return { status: status, position: status === "waiting" && Number(stored[1]) > 0 ? Number(stored[1]) : null };
}

// Adds status (and position, only while waiting) to a join response when Supabase answered
function withApp_(res, result) {
  if (!result) return res;
  res.status = result.status;
  if (result.status === "waiting" && result.position) res.position = result.position;
  return res;
}

// Push from Supabase: { action: "sync", secret, rows: [...] }
function handleSync_(body) {
  let data;
  try {
    data = JSON.parse(body);
  } catch (_) {
    return { ok: false, error: "bad_request" };
  }
  const cfg = syncConfig_();
  if (!data || data.action !== "sync" || !cfg || !secretMatches_(data.secret, cfg.secret)) {
    return { ok: false, error: "bad_secret" };
  }
  const rows = (Array.isArray(data.rows) ? data.rows : []).slice(0, MAX_SYNC_ROWS).map(normSyncRow_).filter(Boolean);
  upsertRows_(getSheet_(), rows, null);
  return { ok: true, rows: rows.length };
}

// Hourly: retry joins Supabase never got, then pull every request and upsert it.
// Set it up with installSyncTrigger().
function reconcile() {
  const cfg = syncConfig_();
  if (!cfg) return;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;
  try {
    const sheet = getSheet_();
    retryJoins_(sheet);
    const res = callSupabase_(cfg, "waitlist_export", { p_secret: cfg.secret });
    if (!Array.isArray(res)) return;
    const rows = res.map(normSyncRow_).filter(Boolean);
    upsertRows_(sheet, rows, computePlaces_(rows));
  } catch (err) {
    console.error(err);
  } finally {
    lock.releaseLock();
  }
}

// Website rows (they have a token) whose join never reached Supabase
function retryJoins_(sheet) {
  const last = sheet.getLastRow();
  if (last < 2) return;
  const data = sheet.getRange(2, 1, last - 1, HEADERS.length).getValues();
  let tries = 0;
  for (let i = 0; i < data.length && tries < MAX_RETRIES_PER_RUN; i++) {
    const r = data[i];
    if (!r[COL.email - 1] || !r[COL.token - 1] || r[COL.syncedAt - 1]) continue;
    tries++;
    const result = joinSupabase_(String(r[COL.email - 1]).trim().toLowerCase(), r[COL.joined - 1]);
    if (!result) continue;
    const cells = appCells_({ status: result.status, requestedAt: null, source: "website", invitedBy: "" }, result.position || "");
    cells[2] = r[COL.signedUpInApp - 1];
    cells[3] = r[COL.invitedBy - 1];
    sheet.getRange(i + 2, COL.appStatus, 1, 5).setValues([cells.concat([new Date()])]);
  }
}

// Creates the hourly reconcile trigger, once. Safe to run again.
function installSyncTrigger() {
  const exists = ScriptApp.getProjectTriggers().some((t) => t.getHandlerFunction() === "reconcile");
  if (!exists) ScriptApp.newTrigger("reconcile").timeBased().everyHours(1).create();
}

// Updates the matching row by email, or appends an app-only sign-up. places is { email: place } for a
// full export; null for a push, which keeps a waiting row's place until the next reconcile.
// Only rows that changed (or never had a Synced at) are written.
function upsertRows_(sheet, rows, places) {
  const last = sheet.getLastRow();
  const data = last > 1 ? sheet.getRange(2, 1, last - 1, HEADERS.length).getValues() : [];
  const index = {};
  data.forEach((r, i) => { index[String(r[COL.email - 1]).trim().toLowerCase()] = i; });
  const now = new Date();
  rows.forEach((r) => {
    const i = index[r.email];
    if (i === undefined) {
      const place = places && r.status === "waiting" ? places[r.email] || "" : "";
      const cells = appCells_(r, place).concat([now]);
      const row = [r.requestedAt || now, r.email, "", "", "", "app", "", "", "", "", ""].concat(cells);
      sheet.appendRow(row);
      data.push(row);
      index[r.email] = data.length - 1;
      return;
    }
    const old = data[i];
    const place = places ? (r.status === "waiting" ? places[r.email] || "" : "")
      : (r.status === "waiting" ? old[COL.appPlace - 1] : "");
    const cells = appCells_(r, place);
    // A website row keeps its own sign-up date and Source; only "Signed up in app" comes from Supabase
    const same = cells.every((c, k) => sameCell_(c, old[COL.appStatus - 1 + k]));
    if (same && old[COL.syncedAt - 1]) return;
    sheet.getRange(i + 2, COL.appStatus, 1, 5).setValues([cells.concat([now])]);
  });
}

// ---------- Pure helpers (no Sheet or network access) ----------

function appStatusCode_(label) {
  const codes = Object.keys(APP_STATUS);
  for (let i = 0; i < codes.length; i++) if (APP_STATUS[codes[i]] === label) return codes[i];
  return "";
}

// One row from Supabase → a checked, normalized row. Null if it isn't usable.
function normSyncRow_(raw) {
  if (!raw || typeof raw !== "object") return null;
  const email = String(raw.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || /^[=+\-@]/.test(email)) return null;
  if (!Object.prototype.hasOwnProperty.call(APP_STATUS, raw.status) || raw.status === "not_school") return null;
  const requested = raw.requested_at ? new Date(raw.requested_at) : null;
  return {
    email: email,
    status: raw.status,
    requestedAt: requested && !isNaN(requested.getTime()) ? requested : null,
    source: raw.source === "app" ? "app" : "website",
    invitedBy: raw.invited_by ? String(raw.invited_by) : "",
  };
}

// The five cells for App status, App place, Signed up in app, Invited by (Synced at is added by the caller)
function appCells_(r, place) {
  const signedUp = (r.source === "app" || r.status === "member") && r.requestedAt ? r.requestedAt : "";
  return [
    clean_(APP_STATUS[r.status], 40),
    r.status === "waiting" && Number(place) > 0 ? Number(place) : "",
    signedUp,
    clean_(r.invitedBy, 80),
  ];
}

// Place among waiting requests: oldest request first, ties by email. 1 = next.
function computePlaces_(rows) {
  const waiting = rows.filter((r) => r.status === "waiting");
  waiting.sort((a, b) => {
    const at = a.requestedAt ? a.requestedAt.getTime() : 0;
    const bt = b.requestedAt ? b.requestedAt.getTime() : 0;
    return at - bt || (a.email < b.email ? -1 : a.email > b.email ? 1 : 0);
  });
  const places = {};
  waiting.forEach((r, i) => { places[r.email] = i + 1; });
  return places;
}

function sameCell_(a, b) {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return String(a) === String(b);
}

function secretMatches_(given, expected) {
  const a = String(given || "");
  const b = String(expected || "");
  if (!b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function isoDate_(value) {
  const d = value instanceof Date ? value : new Date(value);
  return (isNaN(d.getTime()) ? new Date() : d).toISOString().replace(/\.\d+Z$/, "Z");
}
