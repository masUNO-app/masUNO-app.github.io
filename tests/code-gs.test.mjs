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
  const on = load({ WAITLIST_SYNC_SECRET: "right-secret", SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "k" });
  assert.deepEqual({ ...on.handleSync_(body) }, { ok: false, error: "bad_secret" });
  const off = load();
  assert.deepEqual({ ...off.handleSync_(JSON.stringify({ action: "sync", secret: "", rows: [] })) }, { ok: false, error: "bad_secret" });
  assert.deepEqual({ ...on.handleSync_("not json") }, { ok: false, error: "bad_request" });
});

test("a push with the right secret upserts rows into the Sheet", () => {
  const gs = load({ WAITLIST_SYNC_SECRET: "right-secret", SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "k" });
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
    secret: "right-secret",
    rows: [
      { email: "web@tec.mx", status: "approved", requested_at: "2026-11-01T00:00:00Z", source: "website" },
      { email: "new@tec.mx", status: "waiting", requested_at: "2026-11-14T00:00:00Z", source: "app" },
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
});
