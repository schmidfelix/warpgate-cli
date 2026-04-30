import path from "node:path";
import { readFile } from "node:fs/promises";
import type { Info, TargetSnapshot } from "./types.ts";

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiError";
  }
}

const API_BASE_PATH = "/@warpgate/api";

function isMock(): boolean {
  return process.env.WARPGATE_MOCK === "1";
}

async function loadFixture<T>(name: string): Promise<T> {
  const fixtureDir = process.env.WARPGATE_MOCK_DIR
    ?? path.join(import.meta.dir, "..", "test", "fixtures");
  const file = path.join(fixtureDir, `${name}.json`);
  const text = await readFile(file, "utf8");
  return JSON.parse(text) as T;
}

async function get<T>(baseUrl: string, token: string, route: string): Promise<T> {
  const url = `${baseUrl}${API_BASE_PATH}${route}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "X-Warpgate-Token": token,
        Accept: "application/json",
      },
    });
  } catch (e) {
    throw new ApiError(`Netzwerkfehler beim Aufruf von ${url}: ${(e as Error).message}`);
  }
  if (res.status === 401 || res.status === 403) {
    throw new AuthError(`Token abgelehnt (HTTP ${res.status})`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ApiError(`API-Fehler ${res.status} ${res.statusText}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export function fetchInfo(baseUrl: string, token: string): Promise<Info> {
  if (isMock()) return loadFixture<Info>("info");
  return get<Info>(baseUrl, token, "/info");
}

export function fetchTargets(baseUrl: string, token: string): Promise<TargetSnapshot[]> {
  if (isMock()) return loadFixture<TargetSnapshot[]>("targets");
  return get<TargetSnapshot[]>(baseUrl, token, "/targets");
}
