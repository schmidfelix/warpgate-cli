import os from "node:os";

const SERVICE = process.env.WARPGATE_KEYCHAIN_SERVICE ?? "warpgate-cli";
const ACCOUNT = os.userInfo().username;

async function readAll(stream: ReadableStream<Uint8Array> | null): Promise<string> {
  if (!stream) return "";
  return new Response(stream).text();
}

export async function getToken(): Promise<string | null> {
  const proc = Bun.spawn(
    ["security", "find-generic-password", "-a", ACCOUNT, "-s", SERVICE, "-w"],
    { stdout: "pipe", stderr: "pipe" },
  );
  const exit = await proc.exited;
  if (exit !== 0) return null;
  const out = await readAll(proc.stdout);
  return out.trim() || null;
}

export async function setToken(token: string): Promise<void> {
  const proc = Bun.spawn(
    [
      "security",
      "add-generic-password",
      "-a", ACCOUNT,
      "-s", SERVICE,
      "-w", token,
      "-U",
      "-T", "",
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const exit = await proc.exited;
  if (exit !== 0) {
    const err = await readAll(proc.stderr);
    throw new Error(`Keychain konnte Token nicht speichern: ${err.trim() || `exit ${exit}`}`);
  }
}

export async function deleteToken(): Promise<void> {
  const proc = Bun.spawn(
    ["security", "delete-generic-password", "-a", ACCOUNT, "-s", SERVICE],
    { stdout: "pipe", stderr: "pipe" },
  );
  await proc.exited;
}
