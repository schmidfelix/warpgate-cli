import type { SshConnection } from "./ssh.ts";
import type { DatabaseEntry } from "./types.ts";

const SAFE_TOKEN = /^[A-Za-z0-9._:@/-]+$/;

function shellQuote(value: string): string {
  if (SAFE_TOKEN.test(value)) return value;
  return "'" + value.replace(/'/g, `'\\''`) + "'";
}

export interface TablePlusUrlOptions {
  conn: SshConnection;
  db: DatabaseEntry;
  dbPassword: string;
}

export function buildTablePlusUrl(opts: TablePlusUrlOptions): string {
  const { conn, db, dbPassword } = opts;

  // userinfo = <warp-user>%3A<warp-target>
  // ":" is "safe" in encodeURIComponent → must inject %3A literally so the
  // URL parser does not treat <warp-target> as a port.
  const warpUser = encodeURIComponent(conn.username);
  const warpTarget = encodeURIComponent(conn.targetName);
  const userinfo = `${warpUser}%3A${warpTarget}`;

  const dbUser = encodeURIComponent(db.dbUser);
  const dbPwd = encodeURIComponent(dbPassword);
  const dbCreds = `${dbUser}:${dbPwd}`;

  const dbName = encodeURIComponent(db.dbName);
  // dbHost is resolved on the SSH target itself, so it stays as-is. We still
  // strip anything that would break URL parsing.
  const dbHost = encodeURI(db.dbHost);
  const dbPortPart = db.dbPort !== undefined ? `:${db.dbPort}` : "";

  const params = new URLSearchParams({
    name: conn.targetName,
    tLSMode: "0",
    usePrivateKey: "true",
    safeModeLevel: "0",
    advancedSafeModeLevel: "0",
    driverVersion: "0",
    lazyload: "false",
  });

  return (
    `mysql+ssh://${userinfo}@${conn.host}:${conn.port}` +
    `/${dbCreds}@${dbHost}${dbPortPart}/${dbName}?${params.toString()}`
  );
}

export function buildOpenCommandString(url: string): string {
  return `open ${shellQuote(url)}`;
}
