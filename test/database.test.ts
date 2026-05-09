import { test, expect, beforeEach, afterAll } from "bun:test";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, rmSync } from "node:fs";

// In-memory keychain backend → no macOS prompts, no leftover Keychain entries.
process.env.WARPGATE_KEYCHAIN_BACKEND = "memory";

// Isolate HOME so writes to ~/.config/warpgate-cli/databases.json land in a tmp dir.
const ORIG_HOME = process.env.HOME;
const TMP_HOME = mkdtempSync(path.join(os.tmpdir(), "warpgate-cli-test-"));
process.env.HOME = TMP_HOME;

// Ensure mock-mode does not leak fixture data into reads.
delete process.env.WARPGATE_MOCK;

const dbModule = await import("../src/database.ts");
const { getDbPassword } = await import("../src/keychain.ts");

beforeEach(async () => {
  // Reset JSON between tests so addDatabase counts are deterministic.
  const all = await dbModule.readDatabases();
  for (const e of all) await dbModule.removeDatabase(e.id);
});

afterAll(async () => {
  const all = await dbModule.readDatabases();
  for (const e of all) await dbModule.removeDatabase(e.id);
  rmSync(TMP_HOME, { recursive: true, force: true });
  if (ORIG_HOME !== undefined) process.env.HOME = ORIG_HOME;
  else delete process.env.HOME;
});

test("readDatabases returns empty array when file does not exist", async () => {
  const all = await dbModule.readDatabases();
  expect(all).toEqual([]);
});

test("addDatabase persists entry with generated id and stores password in keychain", async () => {
  const entry = await dbModule.addDatabase(
    {
      targetName: "stage-web",
      label: "stage-main",
      dbHost: "dbstage",
      dbUser: "appuser",
      dbName: "app",
    },
    "secret-pw",
  );
  expect(entry.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(entry.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

  const all = await dbModule.readDatabases();
  expect(all).toHaveLength(1);
  expect(all[0]!.label).toBe("stage-main");

  expect(await getDbPassword(entry.id)).toBe("secret-pw");
});

test("databasesForTarget filters by targetName", async () => {
  const e1 = await dbModule.addDatabase(
    { targetName: "stage-web", label: "main-1", dbHost: "h", dbUser: "u", dbName: "d" },
    "p",
  );
  await dbModule.addDatabase(
    { targetName: "stage-worker", label: "jobs", dbHost: "h", dbUser: "u", dbName: "d" },
    "p",
  );

  const stageWeb = await dbModule.databasesForTarget("stage-web");
  expect(stageWeb).toHaveLength(1);
  expect(stageWeb[0]!.id).toBe(e1.id);

  const ungroupedTarget = await dbModule.databasesForTarget("nonexistent");
  expect(ungroupedTarget).toHaveLength(0);
});

test("removeDatabase deletes from JSON and keychain", async () => {
  const entry = await dbModule.addDatabase(
    { targetName: "t", label: "x", dbHost: "h", dbUser: "u", dbName: "d" },
    "pw",
  );
  expect(await getDbPassword(entry.id)).toBe("pw");

  const ok = await dbModule.removeDatabase(entry.id);
  expect(ok).toBe(true);

  const all = await dbModule.readDatabases();
  expect(all.find((e) => e.id === entry.id)).toBeUndefined();
  expect(await getDbPassword(entry.id)).toBeNull();
});

test("findDatabase locates entry by id and label", async () => {
  const entry = await dbModule.addDatabase(
    { targetName: "t", label: "uniquelabel", dbHost: "h", dbUser: "u", dbName: "d" },
    "p",
  );
  expect((await dbModule.findDatabase(entry.id))?.id).toBe(entry.id);
  expect((await dbModule.findDatabase("uniquelabel"))?.id).toBe(entry.id);
  expect(await dbModule.findDatabase("does-not-exist")).toBeNull();
});

test("updateDatabase merges patch and optionally updates password", async () => {
  const entry = await dbModule.addDatabase(
    { targetName: "t", label: "foo", dbHost: "h", dbUser: "u", dbName: "d" },
    "old",
  );
  const updated = await dbModule.updateDatabase(entry.id, { label: "bar" }, "new");
  expect(updated?.label).toBe("bar");
  expect(await getDbPassword(entry.id)).toBe("new");
});

// ─── Mock-Mode Schutz ────────────────────────────────────────────────────────
// Regression: A previous version had asymmetric read/write — readDatabases
// returned fixtures under WARPGATE_MOCK=1 but writeDatabases always wrote to
// ~/.config/warpgate-cli/databases.json. Any mutation in mock mode wiped the
// real file. These tests guarantee writes in mock mode are refused.

test("writeDatabases throws under WARPGATE_MOCK=1", async () => {
  process.env.WARPGATE_MOCK = "1";
  try {
    await expect(dbModule.writeDatabases([])).rejects.toThrow(/WARPGATE_MOCK/);
  } finally {
    delete process.env.WARPGATE_MOCK;
  }
});

test("addDatabase throws under WARPGATE_MOCK=1", async () => {
  process.env.WARPGATE_MOCK = "1";
  try {
    await expect(
      dbModule.addDatabase(
        { targetName: "t", label: "x", dbHost: "h", dbUser: "u", dbName: "d" },
        "p",
      ),
    ).rejects.toThrow(/WARPGATE_MOCK/);
  } finally {
    delete process.env.WARPGATE_MOCK;
  }
});

test("updateDatabase throws under WARPGATE_MOCK=1", async () => {
  const entry = await dbModule.addDatabase(
    { targetName: "t", label: "x", dbHost: "h", dbUser: "u", dbName: "d" },
    "p",
  );
  process.env.WARPGATE_MOCK = "1";
  try {
    await expect(
      dbModule.updateDatabase(entry.id, { label: "y" }),
    ).rejects.toThrow(/WARPGATE_MOCK/);
  } finally {
    delete process.env.WARPGATE_MOCK;
  }
});

test("removeDatabase throws under WARPGATE_MOCK=1", async () => {
  const entry = await dbModule.addDatabase(
    { targetName: "t", label: "x", dbHost: "h", dbUser: "u", dbName: "d" },
    "p",
  );
  process.env.WARPGATE_MOCK = "1";
  try {
    await expect(dbModule.removeDatabase(entry.id)).rejects.toThrow(/WARPGATE_MOCK/);
  } finally {
    delete process.env.WARPGATE_MOCK;
  }
});

test("real config file is NOT touched when mutations are attempted in mock mode", async () => {
  // Seed two real entries.
  const e1 = await dbModule.addDatabase(
    { targetName: "real-1", label: "real-1", dbHost: "h", dbUser: "u", dbName: "d" },
    "p",
  );
  const e2 = await dbModule.addDatabase(
    { targetName: "real-2", label: "real-2", dbHost: "h", dbUser: "u", dbName: "d" },
    "p",
  );

  process.env.WARPGATE_MOCK = "1";
  try {
    // All four mutation attempts must throw, none must persist anything.
    await expect(dbModule.writeDatabases([])).rejects.toThrow();
    await expect(
      dbModule.addDatabase(
        { targetName: "x", label: "x", dbHost: "h", dbUser: "u", dbName: "d" },
        "p",
      ),
    ).rejects.toThrow();
    await expect(dbModule.removeDatabase(e1.id)).rejects.toThrow();
    await expect(dbModule.updateDatabase(e1.id, { label: "x" })).rejects.toThrow();
  } finally {
    delete process.env.WARPGATE_MOCK;
  }

  // Real file still intact.
  const all = await dbModule.readDatabases();
  expect(all).toHaveLength(2);
  expect(all.map((e) => e.id).sort()).toEqual([e1.id, e2.id].sort());
});

test("rotating backups capture the last 3 prior states", async () => {
  const fs = await import("node:fs/promises");
  const pathMod = await import("node:path");
  const dir = pathMod.join(process.env.HOME!, ".config", "warpgate-cli");
  const bak = (slot: number) => pathMod.join(dir, `databases.json.bak.${slot}`);
  // Clear any leftover backups so we test the fresh chain.
  for (const slot of [1, 2, 3, 4]) {
    try { await fs.unlink(bak(slot)); } catch { /* none */ }
  }

  // 5 sequential writes — only the last 3 prior states should remain in backups.
  const labels = ["a", "b", "c", "d", "e"];
  for (const label of labels) {
    await dbModule.addDatabase(
      { targetName: "t", label, dbHost: "h", dbUser: "u", dbName: "d" },
      "p",
    );
  }

  // Current file has all 5 entries.
  const current = await dbModule.readDatabases();
  expect(current.map((e) => e.label)).toEqual(labels);

  // .bak.1 = state right before the last write (4 entries: a..d)
  const bak1 = JSON.parse(await fs.readFile(bak(1), "utf8"));
  expect(bak1.map((e: { label: string }) => e.label)).toEqual(["a", "b", "c", "d"]);
  // .bak.2 = state before that (3 entries: a..c)
  const bak2 = JSON.parse(await fs.readFile(bak(2), "utf8"));
  expect(bak2.map((e: { label: string }) => e.label)).toEqual(["a", "b", "c"]);
  // .bak.3 = state before that (2 entries: a..b)
  const bak3 = JSON.parse(await fs.readFile(bak(3), "utf8"));
  expect(bak3.map((e: { label: string }) => e.label)).toEqual(["a", "b"]);
  // .bak.4 must NOT exist — only 3 slots are kept.
  await expect(fs.access(bak(4))).rejects.toThrow();
});

test("does not write outside HOME (test isolation regression)", async () => {
  // This test guards against the os.homedir() bug that previously caused
  // writes to land in the real ~/.config/warpgate-cli regardless of HOME.
  const realHome = os.homedir();
  const realConfigDir = `${realHome}/.config/warpgate-cli`;
  if (process.env.HOME === realHome) {
    throw new Error("Test sanity check: HOME should be set to a tmp dir");
  }
  // The mtime of the real config dir must not change while tests run.
  const fs = await import("node:fs/promises");
  let mtimeBefore: number;
  try {
    mtimeBefore = (await fs.stat(realConfigDir)).mtimeMs;
  } catch {
    return; // real dir doesn't exist — nothing to protect on this machine
  }
  await dbModule.addDatabase(
    { targetName: "iso-test", label: "iso", dbHost: "h", dbUser: "u", dbName: "d" },
    "p",
  );
  const mtimeAfter = (await fs.stat(realConfigDir)).mtimeMs;
  expect(mtimeAfter).toBe(mtimeBefore);
});
