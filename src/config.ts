import os from "node:os";
import path from "node:path";
import { mkdir, readFile, writeFile, chmod, unlink } from "node:fs/promises";

const CONFIG_DIR = path.join(os.homedir(), ".config", "warpgate-cli");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

export interface Config {
  baseUrl: string;
  username?: string;
}

export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export async function readConfig(): Promise<Config | null> {
  try {
    const text = await readFile(CONFIG_FILE, "utf8");
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed.baseUrl === "string") {
      const cfg: Config = { baseUrl: normalizeBaseUrl(parsed.baseUrl) };
      if (typeof parsed.username === "string" && parsed.username.length > 0) {
        cfg.username = parsed.username;
      }
      return cfg;
    }
    return null;
  } catch {
    return null;
  }
}

export async function writeConfig(cfg: Config): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  const normalized: Config = { baseUrl: normalizeBaseUrl(cfg.baseUrl) };
  if (cfg.username && cfg.username.trim().length > 0) {
    normalized.username = cfg.username.trim();
  }
  await writeFile(CONFIG_FILE, JSON.stringify(normalized, null, 2), { mode: 0o600 });
  await chmod(CONFIG_FILE, 0o600);
}

export async function deleteConfig(): Promise<void> {
  try {
    await unlink(CONFIG_FILE);
  } catch {
    // ignore — already gone
  }
}
