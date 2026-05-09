import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { DatabaseEntry, TargetSnapshot } from "../types.ts";

interface DbSubmenuProps {
  target: TargetSnapshot;
  databases: DatabaseEntry[];
  onPick: (db: DatabaseEntry) => void;
  onAddNew: () => void;
  onCancel: () => void;
  onDelete: (db: DatabaseEntry) => void;
}

type Row =
  | { type: "db"; db: DatabaseEntry }
  | { type: "new" };

export function DbSubmenu({
  target,
  databases,
  onPick,
  onAddNew,
  onCancel,
  onDelete,
}: DbSubmenuProps) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const rows: Row[] = [
    ...databases.map<Row>((db) => ({ type: "db", db })),
    { type: "new" },
  ];

  useInput((input, key) => {
    if (key.escape) {
      if (confirmDeleteId) {
        setConfirmDeleteId(null);
        return;
      }
      onCancel();
      return;
    }
    if (key.ctrl && input === "c") {
      onCancel();
      return;
    }
    if (confirmDeleteId) {
      if (input === "y" || input === "Y") {
        const db = databases.find((d) => d.id === confirmDeleteId);
        setConfirmDeleteId(null);
        if (db) onDelete(db);
      } else if (input === "n" || input === "N") {
        setConfirmDeleteId(null);
      }
      return;
    }
    if (key.upArrow || (key.ctrl && input === "p")) {
      setSelectedIdx((i) => Math.max(0, i - 1));
      return;
    }
    if (key.downArrow || (key.ctrl && input === "n")) {
      setSelectedIdx((i) => Math.min(rows.length - 1, i + 1));
      return;
    }
    if (key.return) {
      const row = rows[selectedIdx];
      if (!row) return;
      if (row.type === "new") onAddNew();
      else onPick(row.db);
      return;
    }
    if (input === "d" && rows[selectedIdx]?.type === "db") {
      const db = (rows[selectedIdx] as { type: "db"; db: DatabaseEntry }).db;
      setConfirmDeleteId(db.id);
      return;
    }
  });

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold color="cyan">
          Databases for {target.name}
        </Text>
      </Box>
      <Box>
        <Text color="gray">
          {databases.length} DB{databases.length === 1 ? "" : "s"} · up/down navigate · Enter open · d
          delete · Esc back
        </Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        {rows.map((row, i) => (
          <SubmenuRow
            key={row.type === "db" ? row.db.id : "__new__"}
            row={row}
            selected={i === selectedIdx}
            confirmDelete={
              row.type === "db" && row.db.id === confirmDeleteId ? true : false
            }
          />
        ))}
      </Box>
    </Box>
  );
}

function truncateMiddle(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  if (maxLen <= 1) return "";
  if (maxLen <= 3) return s.slice(0, maxLen - 1) + "…";
  const left = Math.ceil((maxLen - 1) / 2);
  const right = Math.floor((maxLen - 1) / 2);
  return s.slice(0, left) + "…" + s.slice(-right);
}

function SubmenuRow({
  row,
  selected,
  confirmDelete,
}: {
  row: Row;
  selected: boolean;
  confirmDelete: boolean;
}) {
  if (row.type === "new") {
    return (
      <Box>
        <Text color={selected ? "cyan" : undefined} bold={selected}>
          {selected ? "❯ " : "  "}
        </Text>
        <Text color={selected ? "cyan" : "green"} bold={selected}>
          + New database...
        </Text>
      </Box>
    );
  }
  const db = row.db;
  // Compute available width for the gray detail column. Emoji 🗄 renders ~2
  // cols wide in most terminals; budget conservatively to avoid wrap.
  const cols = process.stdout.columns ?? 80;
  const PREFIX = 2;          // "❯ " or "  "
  const ICON = 3;            // "🗄 " (emoji=2 + space=1)
  const SEPARATOR = 2;       // "  " between label and detail
  const SAFETY = 1;          // never run flush against the right edge
  const OVERHEAD = PREFIX + ICON + SEPARATOR + SAFETY;

  // Label keeps priority; reserve at least 30% of remaining width for detail
  // before we start truncating the label too.
  const labelMaxLen = Math.max(8, Math.floor((cols - OVERHEAD) * 0.7));
  const labelDisplay = truncateMiddle(db.label, labelMaxLen);

  if (confirmDelete) {
    return (
      <Box>
        <Text color="red" bold>
          {selected ? "❯ " : "  "}🗄 {labelDisplay}
        </Text>
        <Text color="red">  Really delete? (y/N)</Text>
      </Box>
    );
  }

  const detailRaw =
    db.dbUser +
    "@" +
    db.dbHost +
    (db.dbPort !== undefined ? ":" + db.dbPort : "") +
    "/" +
    db.dbName;
  const detailMax = Math.max(8, cols - OVERHEAD - labelDisplay.length);
  const detailDisplay = truncateMiddle(detailRaw, detailMax);

  return (
    <Box>
      <Text color={selected ? "cyan" : undefined} bold={selected}>
        {selected ? "❯ " : "  "}
      </Text>
      <Text color={selected ? "cyan" : undefined} bold={selected}>
        🗄 {labelDisplay}
      </Text>
      <Text color="gray">{"  " + detailDisplay}</Text>
    </Box>
  );
}
