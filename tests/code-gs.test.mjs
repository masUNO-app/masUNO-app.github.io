import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../apps-script/Code.gs", import.meta.url), "utf8");

// Loads Code.gs with the Apps Script services faked, so its pure helpers and the sync push can run.
function load(props = {}) {
  const output = [];
  const context = vm.createContext({
    console: { info() {}, warn() {}, error() {} },
    ContentService: {
      MimeType: { JSON: "json" },
      createTextOutput: (text) => ({ text, setMimeType() { return this; } }),
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {} }) },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key) => props[key] ?? null,
        setProperty: (key, value) => { props[key] = value; },
      }),
    },
    Utilities: { getUuid: () => "uuid" },
    output,
  });
  vm.runInContext(source, context);
  return context;
}

test("status codes map to the Sheet's words and back", () => {
  const gs = load();
  assert.deepEqual(
    ["waiting", "approved", "member", "not_school", "removed"].map((c) => vm.runInContext(`APP_STATUS.${c}`, gs)),
    ["Waiting", "Approved", "In the app", "Not a school email", "Removed"],
  );
  assert.equal(gs.appStatusCode_("In the app"), "member");
  assert.equal(gs.appStatusCode_("nope"), "");
});

test("rows from Supabase are checked and normalized", () => {
  const gs = load();
  const row = gs.normSyncRow_({ email: " A0123@TEC.MX ", status: "waiting", requested_at: "2026-11-14T15:04:05Z", source: "app", invited_by: "Ana G." });
  assert.equal(row.email, "a0123@tec.mx");
  assert.equal(row.source, "app");
  assert.equal(row.invitedBy, "Ana G.");
  assert.equal(gs.normSyncRow_({ email: "nope", status: "waiting" }), null);
  assert.equal(gs.normSyncRow_({ email: "a@b.co", status: "weird" }), null);
  assert.equal(gs.normSyncRow_({ email: "=a@b.co", status: "waiting" }), null);
  assert.equal(gs.normSyncRow_(null), null);
});

test("places count waiting requests oldest first, ties by email", () => {
  const gs = load();
  const rows = [
    { email: "c@x.co", status: "waiting", requestedAt: new Date("2026-11-02T00:00:00Z") },
    { email: "b@x.co", status: "waiting", requestedAt: new Date("2026-11-01T00:00:00Z") },
    { email: "a@x.co", status: "waiting", requestedAt: new Date("2026-11-02T00:00:00Z") },
    { email: "z@x.co", status: "approved", requestedAt: new Date("2026-10-01T00:00:00Z") },
  ];
  assert.deepEqual({ ...gs.computePlaces_(rows) }, { "b@x.co": 1, "a@x.co": 2, "c@x.co": 3 });
});

test("app cells show a place only while waiting and guard against formulas", () => {
  const gs = load();
  const when = new Date("2026-11-14T15:00:00Z");
  assert.deepEqual([...gs.appCells_({ status: "waiting", source: "website", requestedAt: when, invitedBy: "" }, 4)], ["Waiting", 4, "", ""]);
  assert.deepEqual([...gs.appCells_({ status: "member", source: "app", requestedAt: when, invitedBy: "=HYPERLINK()" }, 4)], ["In the app", "", when, "'=HYPERLINK()"]);
  assert.equal(gs.appCells_({ status: "removed", source: "app", requestedAt: when, invitedBy: "" }, 4)[1], "");
});

test("the secret is compared exactly and never accepted when unset", () => {
  const gs = load();
  assert.equal(gs.secretMatches_("abc", "abc"), true);
  assert.equal(gs.secretMatches_("abd", "abc"), false);
  assert.equal(gs.secretMatches_("", ""), false);
  assert.equal(gs.secretMatches_(undefined, "abc"), false);
});

test("a push with the wrong secret, or with sync off, is refused", () => {
  const body = JSON.stringify({ action: "sync", secret: "wrong", rows: [{ email: "a@b.co", status: "waiting" }] });
  const on = load({ WAITLIST_SYNC_SECRET: "right-secret-at-least-32-characters-long", SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "k" });
  assert.deepEqual({ ...on.handleSync_(body) }, { ok: false, error: "bad_secret" });
  const off = load();
  assert.deepEqual({ ...off.handleSync_(JSON.stringify({ action: "sync", secret: "", rows: [] })) }, { ok: false, error: "bad_secret" });
  assert.deepEqual({ ...on.handleSync_("not json") }, { ok: false, error: "bad_request" });
});

test("a push with the right secret upserts rows into the Sheet", () => {
  const gs = load({ WAITLIST_SYNC_SECRET: "right-secret-at-least-32-characters-long", SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "k" });
  const appended = [];
  const writes = [];
  const existing = ["2026-11-01", "web@tec.mx", "", "", "", "direct", "", "tok", "Mexico", "CODE", "", "", "", "", "", ""];
  const sheet = {
    getLastRow: () => 2,
    getRange: (row, col) => ({
      getValues: () => [existing],
      setValues: (v) => writes.push({ row, col, v: v[0] }),
    }),
    appendRow: (r) => appended.push(r),
  };
  gs.getSheet_ = () => sheet;
  const res = gs.handleSync_(JSON.stringify({
    action: "sync",
    secret: "right-secret-at-least-32-characters-long",
    rows: [
      { email: "web@tec.mx", status: "approved", requested_at: "2026-11-01T00:00:00Z", source: "website" },
      { email: "new@tec.mx", status: "waiting", requested_at: "2026-11-14T00:00:00Z", source: "app", position: 3 },
    ],
  }));
  assert.equal(res.ok, true);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].row, 2);
  assert.equal(writes[0].v[0], "Approved");
  assert.equal(appended.length, 1);
  assert.equal(appended[0][1], "new@tec.mx");
  assert.equal(appended[0][5], "app");
  assert.equal(appended[0][7], "");
  assert.equal(appended[0][11], "Waiting");
  assert.equal(appended[0][12], 3);
});

test("a removed request deletes every row with that email, bottom-up, and appends nothing", () => {
  const secret = "right-secret-at-least-32-characters-long";
  const gs = load({ WAITLIST_SYNC_SECRET: secret, SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "k" });
  const row = (email) => ["2026-11-01", email, "find", "Tec", "", "direct", "", "tok", "Mexico", "CODE", "", "Waiting", 2, "", "", "2026-11-02"];
  const data = [row("gone@tec.mx"), row("stay@tec.mx"), row(" GONE@tec.mx "), row("other@tec.mx")];
  const deleted = [];
  const appended = [];
  const writes = [];
  gs.getSheet_ = () => ({
    getLastRow: () => data.length + 1,
    getRange: (r, col) => ({ getValues: () => data, setValues: (v) => writes.push({ r, col, v: v[0] }) }),
    appendRow: (r) => appended.push(r),
    deleteRow: (r) => deleted.push(r),
  });
  const res = gs.handleSync_(JSON.stringify({
    action: "sync",
    secret,
    rows: [
      { email: "gone@tec.mx", status: "removed", requested_at: "2026-11-01T00:00:00Z", source: "website" },
      { email: "never-here@tec.mx", status: "removed", requested_at: "2026-11-01T00:00:00Z", source: "app" },
    ],
  }));
  assert.equal(res.ok, true);
  assert.equal(res.deleted, 2);
  assert.deepEqual(deleted, [4, 2]);
  assert.equal(appended.length, 0);
  assert.equal(writes.length, 0);
});

test("removals run after updates and appends in the same batch", () => {
  const gs = load();
  const row = (email) => ["2026-11-01", email, "", "", "", "direct", "", "tok", "", "CODE", "", "Waiting", 1, "", "", ""];
  const data = [row("gone@tec.mx"), row("stay@tec.mx")];
  const events = [];
  const sheet = {
    getLastRow: () => data.length + 1,
    getRange: (r, col) => ({ getValues: () => data, setValues: () => events.push(`write ${r}`) }),
    appendRow: (r) => events.push(`append ${r[1]}`),
    deleteRow: (r) => events.push(`delete ${r}`),
  };
  const deleted = gs.upsertRows_(sheet, [
    { email: "gone@tec.mx", status: "removed", requestedAt: null, source: "website", invitedBy: "", position: 0 },
    { email: "stay@tec.mx", status: "approved", requestedAt: null, source: "website", invitedBy: "", position: 0 },
    { email: "new@tec.mx", status: "waiting", requestedAt: null, source: "app", invitedBy: "", position: 5 },
  ], null);
  assert.equal(deleted, 1);
  assert.deepEqual(events, ["write 3", "append new@tec.mx", "delete 2"]);
});

test("sync config rejects a secret shorter than the database requires", () => {
  const gs = load({ WAITLIST_SYNC_SECRET: "short", SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "k" });
  assert.equal(gs.syncConfig_(), null);
  assert.equal(gs.checkSync().error, "secret_too_short");
});

test("configuration check names missing properties without exposing values", () => {
  const gs = load({ SUPABASE_ANON_KEY: "private-key-value" });
  const report = gs.checkSync();
  assert.equal(report.ok, false);
  assert.deepEqual([...report.missing], ["WAITLIST_SYNC_SECRET", "SUPABASE_URL"]);
  assert.equal(JSON.stringify(report).includes("private-key-value"), false);
});

test("configuration check validates the secret without creating a signup", () => {
  const secret = "right-secret-at-least-32-characters-long";
  const gs = load({ WAITLIST_SYNC_SECRET: secret, SUPABASE_URL: "https://x.supabase.co/", SUPABASE_ANON_KEY: "key" });
  const calls = [];
  gs.callSupabase_ = (cfg, fn, body) => {
    calls.push({ fn, body });
    assert.equal(cfg.secret, secret);
    return { ok: false, error: "invalid_input" };
  };
  gs.ScriptApp = { getProjectTriggers: () => [{ getHandlerFunction: () => "reconcile" }] };
  const report = gs.checkSync();
  assert.equal(report.ok, true);
  assert.equal(report.triggerInstalled, true);
  assert.equal(report.supabaseUrl, "https://x.supabase.co");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].fn, "waitlist_join");
  assert.equal(calls[0].body.p_source, "setup_check");
  assert.equal(calls[0].body.p_email, "");
  assert.equal(JSON.stringify(report).includes(secret), false);
});

test("configuration check distinguishes a rejected secret from an unavailable backend", () => {
  const gs = load({ WAITLIST_SYNC_SECRET: "right-secret-at-least-32-characters-long", SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "key" });
  gs.callSupabase_ = () => ({ ok: false, error: "bad_secret" });
  assert.equal(gs.checkSync().error, "bad_secret");
  gs.callSupabase_ = () => null;
  assert.equal(gs.checkSync().error, "supabase_check_failed");
});

test("reconciliation releases the Sheet lock for retry and export network calls", () => {
  const gs = load({ WAITLIST_SYNC_SECRET: "right-secret-at-least-32-characters-long", SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "key" });
  let held = false;
  const lock = {
    tryLock() { assert.equal(held, false); held = true; return true; },
    releaseLock() { assert.equal(held, true); held = false; },
  };
  gs.LockService = { getScriptLock: () => lock };
  const old = ["2026-11-01", " WEB@TEC.MX ", "", "", "", "direct", "", "token", "Mexico", "CODE", "", "", "", "", "", ""];
  gs.getSheet_ = () => ({ getLastRow: () => 2, getRange: () => ({ getValues: () => { assert.equal(held, true); return [old]; } }) });
  const recorded = [];
  gs.joinSupabase_ = (email) => { assert.equal(held, false); assert.equal(email, "web@tec.mx"); return { status: "waiting", position: 2 }; };
  gs.recordSync_ = (email, result) => { assert.equal(held, false); recorded.push({ email, result }); };
  gs.callSupabase_ = (cfg, fn) => { assert.equal(held, false); assert.equal(fn, "waitlist_export"); return []; };
  gs.upsertRows_ = () => assert.equal(held, true);
  const result = gs.reconcile();
  assert.equal(result.ok, true);
  assert.equal(result.attemptedJoins, 1);
  assert.equal(recorded.length, 1);
  assert.equal(held, false);
});

test("a row moved during HTTP is published by email rather than its old row number", () => {
  const gs = load();
  const writes = [];
  gs.getSheet_ = () => ({ getRange: (row) => ({ getValue: () => "", setValues: (v) => writes.push({ row, v }) }) });
  gs.findRow_ = () => 8;
  gs.recordSync_("web@tec.mx", { status: "waiting", position: 3 });
  assert.equal(writes[0].row, 8);
  assert.equal(writes[0].v[0][1], 3);
});

test("retry candidates are bounded and exclude app-only and already synced rows", () => {
  const gs = load();
  const rows = Array.from({ length: 30 }, (_, i) => {
    const row = Array(16).fill(""); row[0] = "2026-11-01"; row[1] = `a${i}@tec.mx`; row[7] = "token"; return row;
  });
  rows[0][7] = "";
  rows[1][15] = "2026-11-02";
  const candidates = gs.retryJoinCandidates_({ getLastRow: () => rows.length + 1, getRange: () => ({ getValues: () => rows }) });
  assert.equal(candidates.length, 25);
  assert.equal(candidates[0].email, "a2@tec.mx");
});

test("failed export leaves Sheet data untouched and does not retain the lock", () => {
  const gs = load({ WAITLIST_SYNC_SECRET: "right-secret-at-least-32-characters-long", SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "key" });
  let held = false;
  gs.LockService = { getScriptLock: () => ({ tryLock() { held = true; return true; }, releaseLock() { held = false; } }) };
  gs.getSheet_ = () => ({ getLastRow: () => 1 });
  gs.callSupabase_ = () => null;
  gs.upsertRows_ = () => assert.fail("must not write on failed export");
  assert.equal(gs.reconcile().error, "export_failed");
  assert.equal(held, false);
});

test("setup does not install triggers or touch the Sheet with invalid credentials", () => {
  const gs = load();
  gs.checkSync = () => ({ ok: false, error: "bad_secret" });
  gs.setup = () => assert.fail("must not change Sheet");
  gs.installSyncTrigger = () => assert.fail("must not install trigger");
  assert.throws(() => gs.setupSync(), /bad_secret/);
});
