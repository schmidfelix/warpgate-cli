#!/usr/bin/env bun
import React, { useEffect, useState } from "react";
import path from "node:path";
import os from "node:os";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { render, Box, Text, useApp } from "ink";
import { readConfig, writeConfig, deleteConfig } from "./config.ts";
import type { Config } from "./config.ts";
import { getToken, setToken, deleteToken } from "./keychain.ts";
import { fetchInfo, fetchTargets, AuthError } from "./api.ts";
import { Picker } from "./ui/Picker.tsx";
import { Onboarding } from "./ui/Onboarding.tsx";
import {
  buildSshConnection,
  buildSshCommandString,
  SshSetupError,
} from "./ssh.ts";
import type { Info, TargetSnapshot } from "./types.ts";

const cmd = process.argv[2];

async function main(): Promise<void> {
  switch (cmd) {
    case "pick":
      return runPick();
    case "login":
      return runLogin();
    case "logout":
      return runLogout();
    case "user":
      return runSetUser(process.argv[3]);
    case "setup-shell":
      return runSetupShell(process.argv[3]);
    case "help":
    case "--help":
    case "-h":
      printHelp();
      return;
    case undefined:
      process.stderr.write(NO_DEFAULT_MSG);
      process.exit(64);
    /* falls through */
    default:
      process.stderr.write(`Unbekannter Befehl: ${cmd}\n\n`);
      printHelp();
      process.exit(64);
  }
}

const NO_DEFAULT_MSG =
  `warpgate-cli ist ein Helper-Binary, kein direkter Aufruf.

Bitte einmal die Shell-Function installieren:

  warpgate-cli setup-shell

Anschließend in einer neuen Shell:

  warpgate

Mehr Optionen: warpgate-cli help
`;

function printHelp(): void {
  process.stdout.write(
    `warpgate-cli — Quick-Access Helper für Warpgate SSH-Targets

Verwendung:
  warpgate-cli setup-shell [--print]   Wrapper-Function in Shell installieren
  warpgate-cli pick                    Picker zeigen, gewähltes ssh-Command auf stdout
                                       (wird vom Shell-Wrapper aufgerufen)
  warpgate-cli login                   API-Token setzen oder erneuern
  warpgate-cli logout                  API-Token und Config entfernen
  warpgate-cli user <name>             Warpgate-Username manuell setzen
  warpgate-cli help                    Diese Hilfe anzeigen

Nach setup-shell startest du eine neue Shell und nutzt: warpgate

Umgebungsvariablen:
  WARPGATE_MOCK=1               Lokale Fixtures statt echter API verwenden
  WARPGATE_KEYCHAIN_SERVICE     Keychain-Service-Name (Default: warpgate-cli)
`,
  );
}

// ─── Subcommands ─────────────────────────────────────────────────────────────

async function runLogout(): Promise<void> {
  await Promise.all([deleteToken(), deleteConfig()]);
  process.stderr.write("✓ Token aus dem Keychain gelöscht und Config entfernt.\n");
}

async function runLogin(): Promise<void> {
  if (!process.stderr.isTTY) {
    process.stderr.write("warpgate-cli: login benötigt ein interaktives Terminal.\n");
    process.exit(1);
  }

  const existing = await readConfig();
  const credentials = await runOnboarding(existing?.baseUrl, existing?.username);
  if (!credentials) {
    process.exitCode = 1;
    return;
  }

  const cfg: Config = { baseUrl: credentials.baseUrl };
  if (credentials.username) cfg.username = credentials.username;
  await writeConfig(cfg);
  await setToken(credentials.token);
  process.stderr.write(`✓ Token gespeichert für ${credentials.baseUrl}.\n`);
}

async function runSetUser(name: string | undefined): Promise<void> {
  if (!name || name.trim().length === 0) {
    process.stderr.write("Verwendung: warpgate-cli user <username>\n");
    process.exit(64);
  }
  const existing = await readConfig();
  if (!existing) {
    process.stderr.write(
      "Keine Config gefunden. Bitte zuerst `warpgate-cli login` ausführen.\n",
    );
    process.exit(2);
  }
  await writeConfig({ ...existing, username: name.trim() });
  process.stderr.write(`✓ Username gesetzt: ${name.trim()}\n`);
}

async function runPick(): Promise<void> {
  if (!process.stderr.isTTY) {
    process.stderr.write("warpgate-cli: pick benötigt ein interaktives Terminal auf stderr.\n");
    process.exit(1);
  }

  let config = await readConfig();
  let token = await getToken();

  if (process.env.WARPGATE_MOCK === "1") {
    config = config ?? { baseUrl: "https://mock.local", username: "demo-user" };
    token = token ?? "mock-token";
  }

  if (!config || !token) {
    const credentials = await runOnboarding(config?.baseUrl, config?.username);
    if (!credentials) {
      process.exit(130);
    }
    const cfg: Config = { baseUrl: credentials.baseUrl };
    if (credentials.username) cfg.username = credentials.username;
    await writeConfig(cfg);
    await setToken(credentials.token);
    config = cfg;
    token = credentials.token;
  }

  const result = await runPickerUI(config, token);
  if (!result) process.exit(130);

  if (result.kind === "auth-error") {
    process.stderr.write(
      "warpgate-cli: Token wurde abgelehnt. Setze ihn neu mit: warpgate-cli login\n",
    );
    process.exit(2);
  }
  if (result.kind === "fetch-error") {
    process.stderr.write(`warpgate-cli: ${result.message}\n`);
    process.exit(2);
  }

  try {
    const conn = buildSshConnection(result.target, result.info, config);
    process.stdout.write(buildSshCommandString(conn) + "\n");
    process.exit(0);
  } catch (e) {
    if (e instanceof SshSetupError) {
      process.stderr.write(`warpgate-cli: ${e.message}\n`);
      process.exit(2);
    }
    throw e;
  }
}

// ─── Shell-Wrapper Setup ─────────────────────────────────────────────────────

const SH_FN = `# >>> warpgate-cli >>>
warpgate() {
  local cmd
  cmd=$(FORCE_COLOR=1 command warpgate-cli pick) || return $?
  eval "$cmd"
}
# <<< warpgate-cli <<<
`;

const FISH_FN = `function warpgate
    set -lx FORCE_COLOR 1
    set -l cmd (command warpgate-cli pick)
    or return $status
    eval $cmd
end
`;

const MARKER_BEGIN = "# >>> warpgate-cli >>>";
const MARKER_END = "# <<< warpgate-cli <<<";

async function runSetupShell(flag: string | undefined): Promise<void> {
  const printOnly = flag === "--print";
  const shellPath = process.env.SHELL ?? "";
  const shell = path.basename(shellPath);

  if (printOnly) {
    process.stdout.write(shell === "fish" ? FISH_FN : SH_FN);
    return;
  }

  if (shell === "zsh" || shell === "bash") {
    await installPosixFunction(shell);
    return;
  }
  if (shell === "fish") {
    await installFishFunction();
    return;
  }

  process.stderr.write(
    `Konnte Shell nicht erkennen ($SHELL=${shellPath}).\n` +
      `Füge folgendes manuell in deine rc-Datei ein:\n\n${SH_FN}\n` +
      `(oder rufe \`warpgate-cli setup-shell --print\` auf, um den Snippet zu erhalten)\n`,
  );
  process.exit(2);
}

async function installPosixFunction(shell: "zsh" | "bash"): Promise<void> {
  const file = path.join(os.homedir(), shell === "zsh" ? ".zshrc" : ".bashrc");
  let existing = "";
  try {
    existing = await readFile(file, "utf8");
  } catch {
    // file doesn't exist yet — wird gleich erstellt
  }

  const beginIdx = existing.indexOf(MARKER_BEGIN);
  const endIdx = existing.indexOf(MARKER_END);
  const hasBlock = beginIdx !== -1 && endIdx !== -1 && endIdx > beginIdx;

  let newContent: string;
  let action: "installiert" | "aktualisiert";

  if (hasBlock) {
    const before = existing.slice(0, beginIdx);
    const after = existing.slice(endIdx + MARKER_END.length);
    const existingBlock = existing.slice(beginIdx, endIdx + MARKER_END.length);
    if (existingBlock === SH_FN.trimEnd()) {
      process.stderr.write(`✓ Wrapper in ${file} ist bereits aktuell.\n`);
      return;
    }
    newContent = before + SH_FN.trimEnd() + after;
    action = "aktualisiert";
  } else {
    const sep = existing.length === 0 || existing.endsWith("\n") ? "" : "\n";
    newContent = `${existing}${sep}\n${SH_FN}`;
    action = "installiert";
  }

  await writeFile(file, newContent);
  process.stderr.write(
    `✓ Wrapper-Function in ${file} ${action}.\n` +
      `  Aktiviere sie mit: source ${file}\n` +
      `  oder öffne eine neue Shell. Dann: warpgate\n`,
  );
}

async function installFishFunction(): Promise<void> {
  const dir = path.join(os.homedir(), ".config", "fish", "functions");
  const file = path.join(dir, "warpgate.fish");
  await mkdir(dir, { recursive: true });
  await writeFile(file, FISH_FN);
  process.stderr.write(
    `✓ Wrapper nach ${file} installiert.\n` +
      `  Öffne eine neue fish-Shell, dann: warpgate\n`,
  );
}

// ─── Ink-Renderer ────────────────────────────────────────────────────────────

const RENDER_OPTS = { stdout: process.stderr } as const;

async function runOnboarding(
  defaultBaseUrl?: string,
  defaultUsername?: string,
): Promise<{ baseUrl: string; token: string; username?: string } | null> {
  let collected: { baseUrl: string; token: string; username?: string } | null = null;
  const instance = render(
    <OnboardingApp
      defaultBaseUrl={defaultBaseUrl}
      defaultUsername={defaultUsername}
      onComplete={(baseUrl, token, username) => {
        collected = { baseUrl, token, username };
      }}
    />,
    RENDER_OPTS,
  );
  await instance.waitUntilExit();
  return collected;
}

type PickerResult =
  | { kind: "selected"; target: TargetSnapshot; info: Info }
  | { kind: "auth-error" }
  | { kind: "fetch-error"; message: string };

async function runPickerUI(config: Config, token: string): Promise<PickerResult | null> {
  let outcome: PickerResult | null = null;
  const instance = render(
    <PickerApp
      baseUrl={config.baseUrl}
      token={token}
      onResult={(r) => {
        outcome = r;
      }}
    />,
    RENDER_OPTS,
  );
  await instance.waitUntilExit();
  return outcome;
}

function OnboardingApp({
  defaultBaseUrl,
  defaultUsername,
  onComplete,
}: {
  defaultBaseUrl?: string;
  defaultUsername?: string;
  onComplete: (baseUrl: string, token: string, username?: string) => void;
}) {
  const { exit } = useApp();
  return (
    <Onboarding
      defaultBaseUrl={defaultBaseUrl}
      defaultUsername={defaultUsername}
      onComplete={(baseUrl, token, username) => {
        onComplete(baseUrl, token, username);
        exit();
      }}
      onCancel={() => exit()}
    />
  );
}

function PickerApp({
  baseUrl,
  token,
  onResult,
}: {
  baseUrl: string;
  token: string;
  onResult: (r: PickerResult) => void;
}) {
  const { exit } = useApp();
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ready"; info: Info; targets: TargetSnapshot[] }
  >({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchInfo(baseUrl, token), fetchTargets(baseUrl, token)]).then(
      ([info, all]) => {
        if (cancelled) return;
        const sshTargets = all.filter((t) => t.kind === "Ssh");
        setState({ kind: "ready", info, targets: sshTargets });
      },
      (e) => {
        if (cancelled) return;
        if (e instanceof AuthError) onResult({ kind: "auth-error" });
        else onResult({ kind: "fetch-error", message: (e as Error).message });
        exit();
      },
    );
    return () => {
      cancelled = true;
    };
  }, [baseUrl, token]);

  if (state.kind === "loading") {
    return (
      <Box>
        <Text color="yellow">⏳ Lade Targets von {baseUrl}…</Text>
      </Box>
    );
  }

  if (state.targets.length === 0) {
    return (
      <Box flexDirection="column">
        <Text color="yellow">Keine SSH-Targets für diesen Account verfügbar.</Text>
        <NoTargetsExit onExit={() => exit()} />
      </Box>
    );
  }

  return (
    <Picker
      targets={state.targets}
      onSelect={(target) => {
        onResult({ kind: "selected", target, info: state.info });
        exit();
      }}
      onCancel={() => exit()}
    />
  );
}

function NoTargetsExit({ onExit }: { onExit: () => void }) {
  useEffect(() => {
    const t = setTimeout(onExit, 1500);
    return () => clearTimeout(t);
  }, [onExit]);
  return null;
}

// Suppress EPIPE crashes when stdout/stderr is closed early by the caller
// (e.g. piped to `head`). This is normal Unix behavior, not an error.
for (const stream of [process.stdout, process.stderr]) {
  stream.on?.("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EPIPE") process.exit(0);
    throw err;
  });
}

main().catch((e) => {
  process.stderr.write(`warpgate-cli: Fataler Fehler: ${(e as Error).message}\n`);
  process.exit(1);
});
