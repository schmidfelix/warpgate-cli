import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import { scoreTarget } from "../fuzzy.ts";
import { inkColorFor } from "../colors.ts";
import { DbSubmenu } from "./DbSubmenu.tsx";
import { DbWizard } from "./DbWizard.tsx";
import type { BootstrapColor, DatabaseEntry, TargetSnapshot } from "../types.ts";

export interface PickerProps {
  targets: TargetSnapshot[];
  databasesByTarget: Map<string, DatabaseEntry[]>;
  onSelectSsh: (target: TargetSnapshot) => void;
  onSelectDb: (target: TargetSnapshot, db: DatabaseEntry) => void;
  onAddDb: (
    target: TargetSnapshot,
    draft: {
      label: string;
      dbHost: string;
      dbUser: string;
      dbName: string;
      dbPort?: number;
      password: string;
    },
  ) => Promise<void>;
  onDeleteDb: (db: DatabaseEntry) => Promise<void>;
  onCancel: () => void;
}

type Row =
  | { type: "header"; groupName: string; color?: BootstrapColor }
  | { type: "item"; target: TargetSnapshot; groupColor?: BootstrapColor };

type View =
  | { kind: "main" }
  | { kind: "submenu"; target: TargetSnapshot }
  | { kind: "wizard"; target: TargetSnapshot };

const UNGROUPED_KEY = "__ungrouped__";
const UNGROUPED_LABEL = "Ungrouped";

export function Picker({
  targets,
  databasesByTarget,
  onSelectSsh,
  onSelectDb,
  onAddDb,
  onDeleteDb,
  onCancel,
}: PickerProps) {
  const [view, setView] = useState<View>({ kind: "main" });

  if (view.kind === "submenu") {
    const dbs = databasesByTarget.get(view.target.name) ?? [];
    return (
      <DbSubmenu
        target={view.target}
        databases={dbs}
        onPick={(db) => onSelectDb(view.target, db)}
        onAddNew={() => setView({ kind: "wizard", target: view.target })}
        onCancel={() => setView({ kind: "main" })}
        onDelete={async (db) => {
          await onDeleteDb(db);
        }}
      />
    );
  }

  if (view.kind === "wizard") {
    return (
      <DbWizard
        targetName={view.target.name}
        onComplete={async (draft) => {
          await onAddDb(view.target, draft);
          setView({ kind: "submenu", target: view.target });
        }}
        onCancel={() => setView({ kind: "submenu", target: view.target })}
      />
    );
  }

  return (
    <MainPicker
      targets={targets}
      databasesByTarget={databasesByTarget}
      onSelectSsh={onSelectSsh}
      onOpenSubmenu={(target) => setView({ kind: "submenu", target })}
      onCancel={onCancel}
    />
  );
}

interface MainPickerProps {
  targets: TargetSnapshot[];
  databasesByTarget: Map<string, DatabaseEntry[]>;
  onSelectSsh: (target: TargetSnapshot) => void;
  onOpenSubmenu: (target: TargetSnapshot) => void;
  onCancel: () => void;
}

function MainPicker({
  targets,
  databasesByTarget,
  onSelectSsh,
  onOpenSubmenu,
  onCancel,
}: MainPickerProps) {
  const [query, setQuery] = useState("");
  const [selectedItemIdx, setSelectedItemIdx] = useState(0);

  const { rows, itemRowIndices } = useMemo(() => {
    const scored = targets
      .map((t) => ({
        target: t,
        score: scoreTarget(query, [t.name, t.description, t.group?.name]),
      }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);

    const groups = new Map<
      string,
      { name: string; color?: BootstrapColor; items: TargetSnapshot[] }
    >();
    for (const { target } of scored) {
      const key = target.group?.id ?? UNGROUPED_KEY;
      let bucket = groups.get(key);
      if (!bucket) {
        bucket = {
          name: target.group?.name ?? UNGROUPED_LABEL,
          color: target.group?.color,
          items: [],
        };
        groups.set(key, bucket);
      }
      bucket.items.push(target);
    }

    const sortedGroups = [...groups.values()].sort((a, b) => {
      if (a.name === UNGROUPED_LABEL) return 1;
      if (b.name === UNGROUPED_LABEL) return -1;
      return a.name.localeCompare(b.name);
    });

    const rows: Row[] = [];
    const itemRowIndices: number[] = [];
    for (const group of sortedGroups) {
      rows.push({ type: "header", groupName: group.name, color: group.color });
      for (const item of group.items) {
        itemRowIndices.push(rows.length);
        rows.push({ type: "item", target: item, groupColor: group.color });
      }
    }
    return { rows, itemRowIndices };
  }, [targets, query]);

  useEffect(() => {
    setSelectedItemIdx(0);
  }, [query]);

  const itemCount = itemRowIndices.length;
  const cappedItemIdx = itemCount > 0 ? Math.min(selectedItemIdx, itemCount - 1) : -1;
  const selectedRowIdx = cappedItemIdx >= 0 ? itemRowIndices[cappedItemIdx]! : -1;
  const selectedTarget =
    selectedRowIdx >= 0 && rows[selectedRowIdx]?.type === "item"
      ? (rows[selectedRowIdx] as { type: "item"; target: TargetSnapshot }).target
      : null;

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.ctrl && input === "c") {
      onCancel();
      return;
    }
    if (key.upArrow || (key.ctrl && input === "p")) {
      setSelectedItemIdx((i) => Math.max(0, i - 1));
      return;
    }
    if (key.downArrow || (key.ctrl && input === "n")) {
      setSelectedItemIdx((i) => Math.min(itemCount - 1, i + 1));
      return;
    }
    if (key.tab || key.rightArrow) {
      if (selectedTarget) onOpenSubmenu(selectedTarget);
      return;
    }
    if (key.return) {
      if (selectedTarget) onSelectSsh(selectedTarget);
      return;
    }
    if (key.backspace || key.delete) {
      setQuery((q) => q.slice(0, -1));
      return;
    }
    if (key.ctrl && input === "u") {
      setQuery("");
      return;
    }
    if (key.ctrl || key.meta) return;
    if (input && input.length > 0 && input >= " ") {
      setQuery((q) => q + input);
    }
  });

  const totalRows = process.stdout.rows ?? 24;
  const headerLines = 3;
  const footerLines = 2;
  const visibleHeight = Math.max(6, totalRows - headerLines - footerLines);

  let windowStart = 0;
  if (rows.length > visibleHeight && selectedRowIdx >= 0) {
    if (selectedRowIdx < windowStart + 2) {
      windowStart = Math.max(0, selectedRowIdx - 2);
    } else if (selectedRowIdx >= windowStart + visibleHeight - 2) {
      windowStart = Math.min(rows.length - visibleHeight, selectedRowIdx - visibleHeight + 3);
    }
  }
  const windowEnd = Math.min(rows.length, windowStart + visibleHeight);
  const visibleRows = rows.slice(windowStart, windowEnd);

  return (
    <Box flexDirection="column">
      <Box>
        <Text color="cyan">› </Text>
        <Text>{query}</Text>
        <Text color="gray">{query.length === 0 ? "Search..." : ""}</Text>
        <Text>█</Text>
      </Box>
      <Box>
        <Text color="gray">
          {itemCount} target{itemCount === 1 ? "" : "s"} · up/down navigate · Enter SSH · Tab databases · Esc cancel
        </Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        {rows.length === 0 ? (
          <Text color="gray" italic>No targets found.</Text>
        ) : (
          visibleRows.map((row, i) => {
            const absIdx = windowStart + i;
            const dbCount =
              row.type === "item"
                ? (databasesByTarget.get(row.target.name)?.length ?? 0)
                : 0;
            return (
              <RowView
                key={absIdx}
                row={row}
                selected={absIdx === selectedRowIdx}
                dbCount={dbCount}
              />
            );
          })
        )}
      </Box>

      {windowEnd < rows.length && (
        <Box>
          <Text color="gray">... {rows.length - windowEnd} more</Text>
        </Box>
      )}
    </Box>
  );
}

function RowView({
  row,
  selected,
  dbCount,
}: {
  row: Row;
  selected: boolean;
  dbCount: number;
}) {
  if (row.type === "header") {
    return (
      <Box>
        <Text color={inkColorFor(row.color)} bold>
          ▎{row.groupName}
        </Text>
      </Box>
    );
  }
  const t = row.target;
  return (
    <Box>
      <Text color={selected ? "cyan" : undefined} bold={selected}>
        {selected ? "❯ " : "  "}
      </Text>
      <Text color={selected ? "cyan" : undefined} bold={selected}>
        {t.name}
      </Text>
      {t.description && (
        <Text color="gray">{"  " + t.description}</Text>
      )}
      {dbCount > 0 && (
        <Text color="gray">{"  🗄 " + dbCount}</Text>
      )}
    </Box>
  );
}
