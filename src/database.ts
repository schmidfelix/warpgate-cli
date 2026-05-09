import os from "node:os";
import path from "node:path";
import { mkdir, readFile, writeFile, chmod, rename, copyFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { DatabaseEntry } from "./types.ts";
import { setDbPassword, deleteDbPassword } from "./keychain.ts";

// Resolve HOME at *call time*, not import time, AND honor process.env.HOME
// before falling back to os.homedir(). os.homedir() uses getpwuid() and
// ignores HOME on POSIX, which previously broke test isolation: tests would
// silently overwrite the real ~/.config/warpgate-cli/databases.json. Never
// again. Tests now set process.env.HOME and these resolvers respect it.
function homeDir(): string {
  return process.env.HOME ?? os.homedir();
}
function configDir(): string {
  return path.join(homeDir(), ".config", "warpgate-cli");
}
function dbFile(): string {
  return path.join(configDir(), "databases.json");
}
function bakFile(slot: 1 | 2 | 3): string {
  return path.join(configDir(), `databases.json.bak.${slot}`);
}
const BACKUP_SLOTS = 3;

function fixturesPath(): string {
  // resolved relative to the CLI source tree; in compiled binary fall back to CWD
  return path.join(import.meta.dir ?? process.cwd(), "..", "test", "fixtures", "databases.json");
}

function isMockMode(): boolean {
  return process.env.WARPGATE_MOCK === "1";
}

async function loadFromFile(file: string): Promise<DatabaseEntry[]> {
  try {
    const text = await readFile(file, "utf8");
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidEntry);
  } catch {
    return [];
  }
}

function isValidEntry(x: unknown): x is DatabaseEntry {
  if (!x || typeof x !== "object") return false;
  const e = x as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    typeof e.targetName === "string" &&
    typeof e.label === "string" &&
    typeof e.dbHost === "string" &&
    typeof e.dbUser === "string" &&
    typeof e.dbName === "string" &&
    typeof e.createdAt === "string"
  );
}

export async function readDatabases(): Promise<DatabaseEntry[]> {
  if (isMockMode()) {
    const fixture = await loadFromFile(fixturesPath());
    if (fixture.length > 0) return fixture;
  }
  return loadFromFile(dbFile());
}

async function rotateBackups(): Promise<void> {
  // Drop the oldest, shift each remaining slot one further back, then copy
  // the current file into slot 1. Result: .bak.1 = previous, .bak.2 = older,
  // .bak.3 = oldest. Three writes are survivable.
  try {
    await unlink(bakFile(BACKUP_SLOTS));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  for (let slot = BACKUP_SLOTS - 1; slot >= 1; slot--) {
    try {
      await rename(bakFile(slot as 1 | 2), bakFile((slot + 1) as 2 | 3));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  }
  try {
    await copyFile(dbFile(), bakFile(1));
    await chmod(bakFile(1), 0o600);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    // No existing file, nothing to back up.
  }
}

export async function writeDatabases(entries: DatabaseEntry[]): Promise<void> {
  // Hard guard: in mock mode `readDatabases` returns fixture data, so writing
  // would persist the fixtures over the user's real config. Refuse outright.
  if (isMockMode()) {
    throw new Error(
      "writeDatabases verweigert: WARPGATE_MOCK=1 ist gesetzt. " +
        "Mock mode is read-only to avoid writing fixture data over the real databases.json. " +
        "Unset WARPGATE_MOCK for real mutations.",
    );
  }

  const dir = configDir();
  await mkdir(dir, { recursive: true, mode: 0o700 });

  // Defense in depth: keep the last 3 prior states as rotating backups so a
  // logic bug (or a user mistake) doesn't permanently destroy data.
  await rotateBackups();

  // Atomic write: write to a temp file in the same dir, then rename. POSIX
  // guarantees rename is atomic on the same filesystem, so observers either
  // see the old file or the new one — never a half-written file.
  const tmp = path.join(dir, `.databases.json.${process.pid}.${Date.now()}.tmp`);
  const json = JSON.stringify(entries, null, 2);
  await writeFile(tmp, json, { mode: 0o600 });
  await chmod(tmp, 0o600);
  await rename(tmp, dbFile());
}

export async function databasesForTarget(targetName: string): Promise<DatabaseEntry[]> {
  const all = await readDatabases();
  return all.filter((e) => e.targetName === targetName);
}

function ensureMutableContext(op: string): void {
  if (isMockMode()) {
    throw new Error(
      `${op} verweigert: WARPGATE_MOCK=1 ist gesetzt. Mutationen sind im Mock-Mode deaktiviert, ` +
        `so fixture data cannot overwrite the real config by accident. ` +
        `Unset WARPGATE_MOCK for real mutations.`,
    );
  }
}

export async function addDatabase(
  draft: Omit<DatabaseEntry, "id" | "createdAt">,
  password: string,
): Promise<DatabaseEntry> {
  ensureMutableContext("addDatabase");
  const entry: DatabaseEntry = {
    ...draft,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  };
  // Order matters: write JSON first, keychain after. If the keychain write
  // fails, removing the orphaned JSON entry is trivial; the inverse (orphaned
  // keychain entry, JSON wipe) used to be possible.
  const all = await readDatabases();
  all.push(entry);
  await writeDatabases(all);
  await setDbPassword(entry.id, password);
  return entry;
}

export async function updateDatabase(
  id: string,
  patch: Partial<Omit<DatabaseEntry, "id" | "createdAt">>,
  password?: string,
): Promise<DatabaseEntry | null> {
  ensureMutableContext("updateDatabase");
  const all = await readDatabases();
  const idx = all.findIndex((e) => e.id === id);
  if (idx === -1) return null;
  const updated: DatabaseEntry = { ...all[idx]!, ...patch };
  all[idx] = updated;
  await writeDatabases(all);
  if (password !== undefined) await setDbPassword(id, password);
  return updated;
}

export async function removeDatabase(id: string): Promise<boolean> {
  ensureMutableContext("removeDatabase");
  const all = await readDatabases();
  const filtered = all.filter((e) => e.id !== id);
  if (filtered.length === all.length) {
    // Entry not in JSON. Still try to clean up an orphan keychain entry.
    await deleteDbPassword(id);
    return false;
  }
  await writeDatabases(filtered);
  await deleteDbPassword(id);
  return true;
}

export async function findDatabase(query: string): Promise<DatabaseEntry | null> {
  const all = await readDatabases();
  return all.find((e) => e.id === query || e.label === query) ?? null;
}
