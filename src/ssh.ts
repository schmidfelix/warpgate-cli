import type { Config } from "./config.ts";
import type { Info, TargetSnapshot } from "./types.ts";

export class SshSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SshSetupError";
  }
}

export interface SshConnection {
  username: string;
  targetName: string;
  host: string;
  port: number;
}

export function buildSshConnection(
  target: TargetSnapshot,
  info: Info,
  config: Config,
): SshConnection {
  const username = info.username ?? config.username;
  if (!username) {
    throw new SshSetupError(
      "Username konnte nicht ermittelt werden. Setze ihn mit: warpgate-cli user <dein-username>",
    );
  }

  const port = info.ports?.ssh;
  if (!port) {
    throw new SshSetupError(
      "Warpgate-Instanz hat keinen SSH-Port konfiguriert (info.ports.ssh fehlt).",
    );
  }

  let host = info.external_hosts?.ssh ?? info.external_host;
  if (!host) {
    try {
      host = new URL(config.baseUrl).hostname;
    } catch {
      throw new SshSetupError(`Ungültige baseUrl in Config: ${config.baseUrl}`);
    }
  }

  return { username, targetName: target.name, host, port };
}

const SAFE_TOKEN = /^[A-Za-z0-9._:@/-]+$/;

function shellQuote(value: string): string {
  if (SAFE_TOKEN.test(value)) return value;
  return "'" + value.replace(/'/g, `'\\''`) + "'";
}

export function buildSshCommandString(conn: SshConnection): string {
  const dest = `${conn.username}:${conn.targetName}@${conn.host}`;
  return `ssh -p ${conn.port} ${shellQuote(dest)}`;
}
