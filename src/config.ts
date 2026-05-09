import os from "node:os";
import path from "node:path";
import { mkdir, readFile, writeFile, chmod, unlink } from "node:fs/promises";

// Honor process.env.HOME before falling back to os.homedir(). os.homedir()
// uses getpwuid() and ignores HOME on POSIX — without this, tests setting
// HOME wouldn't actually be isolated from the real ~/.config/warpgate-cli.
function homeDir(): string {
  return process.env.HOME ?? os.homedir();
}
function configDir(): string {
  return path.join(homeDir(), ".config", "warpgate-cli");
}
function configFile(): string {
  return path.join(configDir(), "config.json");
}

export interface Config {
  baseUrl: string;
  username?: string;
}

export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export async function readConfig(): Promise<Config | null> {
  try {
    const text = await readFile(configFile(), "utf8");
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
  await mkdir(configDir(), { recursive: true, mode: 0o700 });
  const normalized: Config = { baseUrl: normalizeBaseUrl(cfg.baseUrl) };
  if (cfg.username && cfg.username.trim().length > 0) {
    normalized.username = cfg.username.trim();
  }
  await writeFile(configFile(), JSON.stringify(normalized, null, 2), { mode: 0o600 });
  await chmod(configFile(), 0o600);
}

export async function deleteConfig(): Promise<void> {
  try {
    await unlink(configFile());
  } catch {
    // ignore — already gone
  }
}
