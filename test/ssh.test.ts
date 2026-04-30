import { test, expect } from "bun:test";
import { buildSshConnection, buildSshCommandString, SshSetupError } from "../src/ssh.ts";
import type { Info, TargetSnapshot } from "../src/types.ts";
import type { Config } from "../src/config.ts";

const config: Config = { baseUrl: "https://warpgate.example.com" };

const target: TargetSnapshot = {
  name: "prod-web-01",
  description: "",
  kind: "Ssh",
};

const fullInfo: Info = {
  username: "demo-user",
  ports: { ssh: 2222 },
  external_hosts: { ssh: "ssh.warpgate.example.com" },
};

test("uses external_hosts.ssh when present", () => {
  const conn = buildSshConnection(target, fullInfo, config);
  expect(conn).toEqual({
    username: "demo-user",
    targetName: "prod-web-01",
    host: "ssh.warpgate.example.com",
    port: 2222,
  });
});

test("falls back to baseUrl hostname when external_hosts.ssh missing", () => {
  const info: Info = { username: "demo-user", ports: { ssh: 2222 } };
  const conn = buildSshConnection(target, info, config);
  expect(conn.host).toBe("warpgate.example.com");
});

test("falls back to external_host when external_hosts.ssh missing", () => {
  const info: Info = {
    username: "demo-user",
    ports: { ssh: 2222 },
    external_host: "alt.example.com",
  };
  const conn = buildSshConnection(target, info, config);
  expect(conn.host).toBe("alt.example.com");
});

test("throws when username is missing in info AND config", () => {
  const info: Info = { ports: { ssh: 2222 } };
  expect(() => buildSshConnection(target, info, config)).toThrow(SshSetupError);
});

test("falls back to config.username when info has none", () => {
  const info: Info = { ports: { ssh: 2222 }, external_hosts: { ssh: "h" } };
  const cfg: Config = { baseUrl: "https://x", username: "alice" };
  const conn = buildSshConnection(target, info, cfg);
  expect(conn.username).toBe("alice");
});

test("info.username takes precedence over config.username", () => {
  const info: Info = { username: "bob", ports: { ssh: 2222 }, external_hosts: { ssh: "h" } };
  const cfg: Config = { baseUrl: "https://x", username: "alice" };
  const conn = buildSshConnection(target, info, cfg);
  expect(conn.username).toBe("bob");
});

test("buildSshCommandString uses standard format for safe identifiers", () => {
  const cmd = buildSshCommandString({
    username: "demo-user",
    targetName: "prod-web-01",
    host: "warpgate.example.com",
    port: 2222,
  });
  expect(cmd).toBe("ssh -p 2222 demo-user:prod-web-01@warpgate.example.com");
});

test("buildSshCommandString quotes destinations with shell-special chars", () => {
  const cmd = buildSshCommandString({
    username: "alice",
    targetName: "weird name",
    host: "example.com",
    port: 22,
  });
  expect(cmd).toBe("ssh -p 22 'alice:weird name@example.com'");
});

test("buildSshCommandString escapes single quotes in target name", () => {
  const cmd = buildSshCommandString({
    username: "u",
    targetName: "it's-fine",
    host: "h",
    port: 22,
  });
  expect(cmd).toContain("'u:it'\\''s-fine@h'");
});

test("throws when ssh port is missing", () => {
  const info: Info = { username: "demo-user", ports: {} };
  expect(() => buildSshConnection(target, info, config)).toThrow(SshSetupError);
});
