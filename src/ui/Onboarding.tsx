import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { fetchInfo, AuthError } from "../api.ts";
import { normalizeBaseUrl } from "../config.ts";

interface OnboardingProps {
  defaultBaseUrl?: string;
  defaultUsername?: string;
  onComplete: (baseUrl: string, token: string, username?: string) => void;
  onCancel: () => void;
}

type Phase =
  | { kind: "url" }
  | { kind: "token"; baseUrl: string }
  | { kind: "validating"; baseUrl: string; token: string }
  | { kind: "username"; baseUrl: string; token: string }
  | { kind: "error"; baseUrl: string; message: string };

export function Onboarding({ defaultBaseUrl, defaultUsername, onComplete, onCancel }: OnboardingProps) {
  const [phase, setPhase] = useState<Phase>({ kind: "url" });
  const [urlValue, setUrlValue] = useState(defaultBaseUrl ?? "https://warpgate.example.com");
  const [tokenValue, setTokenValue] = useState("");
  const [usernameValue, setUsernameValue] = useState(defaultUsername ?? "");

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === "c")) onCancel();
  });

  if (phase.kind === "url") {
    return (
      <Box flexDirection="column">
        <Text bold color="cyan">Warpgate CLI Setup</Text>
        <Box marginTop={1}>
          <Text>Warpgate URL: </Text>
          <TextInput
            value={urlValue}
            onChange={setUrlValue}
            onSubmit={(v) => {
              const normalized = normalizeBaseUrl(v);
              if (!/^https?:\/\//i.test(normalized)) {
                setPhase({ kind: "error", baseUrl: normalized, message: "URL muss mit http:// oder https:// beginnen." });
                return;
              }
              setPhase({ kind: "token", baseUrl: normalized });
            }}
          />
        </Box>
        <Box marginTop={1}>
          <Text color="gray">Esc zum Abbrechen.</Text>
        </Box>
      </Box>
    );
  }

  if (phase.kind === "token") {
    return (
      <Box flexDirection="column">
        <Text bold color="cyan">Warpgate CLI Setup</Text>
        <Box marginTop={1}>
          <Text color="gray">URL: {phase.baseUrl}</Text>
        </Box>
        <Box marginTop={1}>
          <Text>API-Token: </Text>
          <TextInput
            value={tokenValue}
            onChange={setTokenValue}
            mask="•"
            onSubmit={(v) => {
              const t = v.trim();
              if (!t) {
                setPhase({ kind: "error", baseUrl: phase.baseUrl, message: "Token darf nicht leer sein." });
                return;
              }
              validate(phase.baseUrl, t);
            }}
          />
        </Box>
        <Box marginTop={1}>
          <Text color="gray">Token erstellst du im Warpgate Web-UI unter Profil → API Tokens.</Text>
        </Box>
      </Box>
    );
  }

  if (phase.kind === "validating") {
    return (
      <Box flexDirection="column">
        <Text bold color="cyan">Warpgate CLI Setup</Text>
        <Box marginTop={1}>
          <Text color="yellow">Validiere Token gegen {phase.baseUrl}…</Text>
        </Box>
      </Box>
    );
  }

  if (phase.kind === "username") {
    return (
      <Box flexDirection="column">
        <Text bold color="cyan">Warpgate CLI Setup</Text>
        <Box marginTop={1}>
          <Text color="green">✓ Token validiert.</Text>
        </Box>
        <Box marginTop={1}>
          <Text color="gray">
            Warpgate hat keinen Username für diesen Token zurückgeliefert. Bitte manuell eingeben
            (derselbe Name, mit dem du dich im Warpgate Web-UI anmeldest).
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text>Warpgate-Username: </Text>
          <TextInput
            value={usernameValue}
            onChange={setUsernameValue}
            onSubmit={(v) => {
              const u = v.trim();
              if (!u) {
                setPhase({ kind: "error", baseUrl: phase.baseUrl, message: "Username darf nicht leer sein." });
                return;
              }
              onComplete(phase.baseUrl, phase.token, u);
            }}
          />
        </Box>
      </Box>
    );
  }

  // error
  return (
    <Box flexDirection="column">
      <Text bold color="cyan">Warpgate CLI Setup</Text>
      <Box marginTop={1}>
        <Text color="red">✖ {phase.message}</Text>
      </Box>
      <Box marginTop={1}>
        <Text color="gray">Drücke Enter um es erneut zu versuchen oder Esc zum Abbrechen.</Text>
      </Box>
      <ErrorContinueWatcher onContinue={() => {
        setTokenValue("");
        setPhase({ kind: "url" });
        setUrlValue(phase.baseUrl);
      }} />
    </Box>
  );

  function validate(baseUrl: string, token: string) {
    setPhase({ kind: "validating", baseUrl, token });
    fetchInfo(baseUrl, token).then(
      (info) => {
        if (info.username && info.username.length > 0) {
          onComplete(baseUrl, token, info.username);
        } else {
          setPhase({ kind: "username", baseUrl, token });
        }
      },
      (e) => {
        const msg = e instanceof AuthError
          ? "Token wurde abgelehnt. Bitte erneut versuchen."
          : `Validierung fehlgeschlagen: ${(e as Error).message}`;
        setPhase({ kind: "error", baseUrl, message: msg });
      },
    );
  }
}

function ErrorContinueWatcher({ onContinue }: { onContinue: () => void }) {
  useInput((_, key) => {
    if (key.return) onContinue();
  });
  return null;
}
