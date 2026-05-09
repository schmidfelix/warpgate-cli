import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";

interface DbWizardProps {
  targetName: string;
  initialLabel?: string;
  initialDbHost?: string;
  initialDbUser?: string;
  initialDbName?: string;
  initialDbPort?: number;
  onComplete: (draft: {
    label: string;
    dbHost: string;
    dbUser: string;
    dbName: string;
    dbPort?: number;
    password: string;
  }) => void;
  onCancel: () => void;
}

type Phase =
  | { kind: "label" }
  | { kind: "host"; label: string }
  | { kind: "user"; label: string; dbHost: string }
  | { kind: "name"; label: string; dbHost: string; dbUser: string }
  | { kind: "port"; label: string; dbHost: string; dbUser: string; dbName: string }
  | {
      kind: "password";
      label: string;
      dbHost: string;
      dbUser: string;
      dbName: string;
      dbPort?: number;
    }
  | { kind: "error"; message: string; back: Phase };

export function DbWizard({
  targetName,
  initialLabel,
  initialDbHost,
  initialDbUser,
  initialDbName,
  initialDbPort,
  onComplete,
  onCancel,
}: DbWizardProps) {
  const [phase, setPhase] = useState<Phase>({ kind: "label" });
  const [labelValue, setLabelValue] = useState(initialLabel ?? `${targetName}-main`);
  const [hostValue, setHostValue] = useState(initialDbHost ?? "");
  const [userValue, setUserValue] = useState(initialDbUser ?? "");
  const [nameValue, setNameValue] = useState(initialDbName ?? "");
  const [portValue, setPortValue] = useState(
    initialDbPort !== undefined ? String(initialDbPort) : "3306",
  );
  const [pwdValue, setPwdValue] = useState("");

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === "c")) onCancel();
  });

  const Header = () => (
    <Box flexDirection="column">
      <Text bold color="cyan">
        New database for {targetName}
      </Text>
    </Box>
  );

  if (phase.kind === "label") {
    return (
      <Box flexDirection="column">
        <Header />
        <Box marginTop={1}>
          <Text>Label: </Text>
          <TextInput
            value={labelValue}
            onChange={setLabelValue}
            onSubmit={(v) => {
              const t = v.trim();
              if (!t) {
                setPhase({
                  kind: "error",
                  message: "Label must not be empty.",
                  back: { kind: "label" },
                });
                return;
              }
              if (!nameValue) setNameValue(t);
              setPhase({ kind: "host", label: t });
            }}
          />
        </Box>
        <Box marginTop={1}>
          <Text color="gray">Display name in the picker. Press Esc to cancel.</Text>
        </Box>
      </Box>
    );
  }

  if (phase.kind === "host") {
    return (
      <Box flexDirection="column">
        <Header />
        <Box marginTop={1}>
          <Text>DB-Host: </Text>
          <TextInput
            value={hostValue}
            onChange={setHostValue}
            placeholder="e.g. dbstage"
            onSubmit={(v) => {
              const t = v.trim();
              if (!t) {
                setPhase({
                  kind: "error",
                  message: "DB host must not be empty.",
                  back: { kind: "host", label: phase.label },
                });
                return;
              }
              setPhase({ kind: "user", label: phase.label, dbHost: t });
            }}
          />
        </Box>
        <Box marginTop={1}>
          <Text color="gray">Resolved on the SSH target (e.g. dbstage, localhost, 10.0.0.5).</Text>
        </Box>
      </Box>
    );
  }

  if (phase.kind === "user") {
    return (
      <Box flexDirection="column">
        <Header />
        <Box marginTop={1}>
          <Text>DB-User: </Text>
          <TextInput
            value={userValue}
            onChange={setUserValue}
            onSubmit={(v) => {
              const t = v.trim();
              if (!t) {
                setPhase({
                  kind: "error",
                  message: "DB user must not be empty.",
                  back: { kind: "user", label: phase.label, dbHost: phase.dbHost },
                });
                return;
              }
              setPhase({
                kind: "name",
                label: phase.label,
                dbHost: phase.dbHost,
                dbUser: t,
              });
            }}
          />
        </Box>
      </Box>
    );
  }

  if (phase.kind === "name") {
    return (
      <Box flexDirection="column">
        <Header />
        <Box marginTop={1}>
          <Text>DB-Name: </Text>
          <TextInput
            value={nameValue || phase.label}
            onChange={setNameValue}
            onSubmit={(v) => {
              const t = v.trim();
              if (!t) {
                setPhase({
                  kind: "error",
                  message: "DB name must not be empty.",
                  back: {
                    kind: "name",
                    label: phase.label,
                    dbHost: phase.dbHost,
                    dbUser: phase.dbUser,
                  },
                });
                return;
              }
              setPhase({
                kind: "port",
                label: phase.label,
                dbHost: phase.dbHost,
                dbUser: phase.dbUser,
                dbName: t,
              });
            }}
          />
        </Box>
      </Box>
    );
  }

  if (phase.kind === "port") {
    return (
      <Box flexDirection="column">
        <Header />
        <Box marginTop={1}>
          <Text>Port: </Text>
          <TextInput
            value={portValue}
            onChange={setPortValue}
            onSubmit={(v) => {
              const t = v.trim();
              const port = t.length === 0 ? undefined : Number(t);
              if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65535)) {
                setPhase({
                  kind: "error",
                  message: "Port must be a number between 1 and 65535.",
                  back: {
                    kind: "port",
                    label: phase.label,
                    dbHost: phase.dbHost,
                    dbUser: phase.dbUser,
                    dbName: phase.dbName,
                  },
                });
                return;
              }
              setPhase({
                kind: "password",
                label: phase.label,
                dbHost: phase.dbHost,
                dbUser: phase.dbUser,
                dbName: phase.dbName,
                dbPort: port === 3306 ? undefined : port,
              });
            }}
          />
        </Box>
        <Box marginTop={1}>
          <Text color="gray">Default is 3306. Leave empty to use the default.</Text>
        </Box>
      </Box>
    );
  }

  if (phase.kind === "password") {
    return (
      <Box flexDirection="column">
        <Header />
        <Box marginTop={1}>
          <Text>Password: </Text>
          <TextInput
            value={pwdValue}
            onChange={setPwdValue}
            mask="•"
            onSubmit={(v) => {
              if (!v) {
                setPhase({
                  kind: "error",
                  message: "Password must not be empty.",
                  back: {
                    kind: "password",
                    label: phase.label,
                    dbHost: phase.dbHost,
                    dbUser: phase.dbUser,
                    dbName: phase.dbName,
                    dbPort: phase.dbPort,
                  },
                });
                return;
              }
              onComplete({
                label: phase.label,
                dbHost: phase.dbHost,
                dbUser: phase.dbUser,
                dbName: phase.dbName,
                dbPort: phase.dbPort,
                password: v,
              });
            }}
          />
        </Box>
        <Box marginTop={1}>
          <Text color="gray">Saved in the macOS Keychain.</Text>
        </Box>
      </Box>
    );
  }

  // error
  return (
    <Box flexDirection="column">
      <Header />
      <Box marginTop={1}>
        <Text color="red">✖ {phase.message}</Text>
      </Box>
      <Box marginTop={1}>
        <Text color="gray">Press Enter to try again.</Text>
      </Box>
      <ErrorContinueWatcher onContinue={() => setPhase(phase.back)} />
    </Box>
  );
}

function ErrorContinueWatcher({ onContinue }: { onContinue: () => void }) {
  useInput((_, key) => {
    if (key.return) onContinue();
  });
  return null;
}
