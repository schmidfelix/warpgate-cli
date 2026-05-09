import { test, expect } from "bun:test";
import { buildTablePlusUrl, buildOpenCommandString } from "../src/tableplus.ts";
import type { SshConnection } from "../src/ssh.ts";
import type { DatabaseEntry } from "../src/types.ts";

const conn: SshConnection = {
  username: "warpusername",
  targetName: "warptarget",
  host: "warpgate.example.com",
  port: 22022,
};

const db: DatabaseEntry = {
  id: "fixed-id",
  targetName: "warptarget",
  label: "main",
  dbHost: "dbhost",
  dbUser: "dbname",
  dbName: "dbname",
  createdAt: "2026-05-06T00:00:00Z",
};

test("matches the documented example for trivial inputs", () => {
  const url = buildTablePlusUrl({ conn, db, dbPassword: "dbpassword" });
  expect(url).toBe(
    "mysql+ssh://warpusername%3Awarptarget@warpgate.example.com:22022" +
      "/dbname:dbpassword@dbhost/dbname" +
      "?name=warptarget&tLSMode=0&usePrivateKey=true" +
      "&safeModeLevel=0&advancedSafeModeLevel=0&driverVersion=0&lazyload=false",
  );
});

test("encodes %3A literally between warp user and target (not raw colon)", () => {
  const url = buildTablePlusUrl({ conn, db, dbPassword: "x" });
  // No raw "warpusername:warptarget" present — colon must be %3A
  expect(url).not.toContain("warpusername:warptarget");
  expect(url).toContain("warpusername%3Awarptarget");
  // and not double-encoded
  expect(url).not.toContain("%253A");
});

test("encodes special characters in db password", () => {
  const password = "p@ss/w&rd?#%";
  const url = buildTablePlusUrl({ conn, db, dbPassword: password });
  // Path is /<dbuser>:<encoded-pw>@<dbhost>/<dbname>?<params>
  // Split at ":<port>/" to isolate the path, then at the LAST "@" to find db host boundary.
  const path = url.split(`:${conn.port}/`)[1]!;
  const lastAt = path.lastIndexOf(`@${db.dbHost}`);
  const creds = path.slice(0, lastAt);
  const encodedPassword = creds.slice(creds.indexOf(":") + 1);
  expect(decodeURIComponent(encodedPassword)).toBe(password);
});

test("preserves dotted username (max.mustermann)", () => {
  const c2: SshConnection = { ...conn, username: "max.mustermann" };
  const url = buildTablePlusUrl({ conn: c2, db, dbPassword: "x" });
  expect(url).toContain("max.mustermann%3Awarptarget");
});

test("preserves hyphenated/underscored target name", () => {
  const c2: SshConnection = { ...conn, targetName: "stage_web-01" };
  const url = buildTablePlusUrl({ conn: c2, db, dbPassword: "x" });
  expect(url).toContain("warpusername%3Astage_web-01");
});

test("encodes db user with special chars", () => {
  const d2: DatabaseEntry = { ...db, dbUser: "user@host" };
  const url = buildTablePlusUrl({ conn, db: d2, dbPassword: "x" });
  // The "@" in dbUser must be encoded so the parser doesn't get confused
  expect(url).toContain("user%40host:");
});

test("encodes db name with special chars", () => {
  const d2: DatabaseEntry = { ...db, dbName: "weird name/db" };
  const url = buildTablePlusUrl({ conn, db: d2, dbPassword: "x" });
  expect(url).toContain("/weird%20name%2Fdb?");
});

test("includes db port when set", () => {
  const d2: DatabaseEntry = { ...db, dbPort: 3307 };
  const url = buildTablePlusUrl({ conn, db: d2, dbPassword: "p" });
  expect(url).toContain("@dbhost:3307/dbname");
});

test("omits db port when undefined (default 3306)", () => {
  const url = buildTablePlusUrl({ conn, db, dbPassword: "p" });
  // No ":<digits>/" between dbhost and dbname
  expect(url).toContain("@dbhost/dbname");
  expect(url).not.toMatch(/@dbhost:\d+\/dbname/);
});

test("buildOpenCommandString quotes URL with shell-special chars", () => {
  const url = "mysql+ssh://a%3Ab@h:22/u:p@db/n?name=t";
  const cmd = buildOpenCommandString(url);
  expect(cmd.startsWith("open ")).toBe(true);
  // Url contains '?' and '+' — must be quoted
  expect(cmd).toBe(`open '${url}'`);
});

test("buildOpenCommandString escapes single quotes in URL", () => {
  // password with a single quote → double-quoted/escaped form
  const url = "mysql+ssh://x@h:1/u:it's@db/n?name=t";
  const cmd = buildOpenCommandString(url);
  expect(cmd).toContain(`'mysql+ssh://x@h:1/u:it'\\''s@db/n?name=t'`);
});
