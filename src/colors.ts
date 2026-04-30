import type { BootstrapColor } from "./types.ts";

export function inkColorFor(c: BootstrapColor | undefined): string {
  switch (c) {
    case "Primary":
      return "blue";
    case "Success":
      return "green";
    case "Danger":
      return "red";
    case "Warning":
      return "yellow";
    case "Info":
      return "cyan";
    case "Secondary":
      return "gray";
    case "Light":
      return "white";
    case "Dark":
      return "blackBright";
    default:
      return "gray";
  }
}
