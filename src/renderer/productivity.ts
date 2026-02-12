export type TaskScope = 'global' | 'project';

export interface TaskPreset {
  id: string;
  name: string;
  command: string;
  scope: TaskScope;
  projectRoot: string | null;
  preferredCwd: string | null;
  favorite: boolean;
  createdAt: number;
  lastRunAt: number | null;
}

export interface SmartHistoryEntry {
  id: string;
  signature: string;
  command: string;
  cwd: string;
  groupRoot: string;
  groupLabel: string;
  lastExitCode: number | null;
  lastDurationMs: number | null;
  lastRanAt: number;
  runCount: number;
  favorite: boolean;
}

export interface ShellCommandReport {
  command: string;
  cwd: string;
  exitCode: number;
  durationMs: number;
}

interface ShellPayload {
  cmd?: string;
  cwd?: string;
  exit?: string;
  dur?: string;
}

const TASKS_STORAGE_KEY = 'basedshell.tasks.v1';
const HISTORY_STORAGE_KEY = 'basedshell.smart-history.v1';
const HISTORY_LIMIT = 600;
const OSC_PREFIX = '\u001b]633;';
const OSC_TERMINATOR_BEL = '\u0007';
const OSC_TERMINATOR_ST = '\u001b\\';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizePath(pathValue: string): string {
  const normalized = pathValue.replace(/\\/g, '/').trim();
  return normalized || '/';
}

function basename(pathValue: string): string {
  const normalized = normalizePath(pathValue).replace(/\/+$/, '');
  if (!normalized || normalized === '/') {
    return '/';
  }

  const parts = normalized.split('/');
  return parts[parts.length - 1] || normalized;
}

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }

    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage write failures (quota/private mode).
  }
}

export function loadTaskPresets(): TaskPreset[] {
  const parsed = readStorage<unknown[]>(TASKS_STORAGE_KEY, []);
  if (!Array.isArray(parsed)) {
    return [];
  }

  const deduped: TaskPreset[] = [];
  const seen = new Set<string>();
  for (const item of parsed) {
    if (!isObject(item)) {
      continue;
    }

    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    const command = typeof item.command === 'string' ? item.command.trim() : '';
    const scope: TaskScope = item.scope === 'project' ? 'project' : 'global';
    const projectRoot = typeof item.projectRoot === 'string' ? normalizePath(item.projectRoot) : null;
    const preferredCwd = typeof item.preferredCwd === 'string' ? normalizePath(item.preferredCwd) : null;
    const favorite = Boolean(item.favorite);
    const createdAt = Number.isFinite(item.createdAt) ? Number(item.createdAt) : Date.now();
    const lastRunAt = Number.isFinite(item.lastRunAt) ? Number(item.lastRunAt) : null;

    if (!id || !name || !command || seen.has(id)) {
      continue;
    }

    seen.add(id);
    deduped.push({
      id,
      name,
      command,
      scope,
      projectRoot: scope === 'project' ? projectRoot : null,
      preferredCwd,
      favorite,
      createdAt,
      lastRunAt
    });
  }

  return deduped;
}

export function saveTaskPresets(tasks: TaskPreset[]): void {
  writeStorage(TASKS_STORAGE_KEY, tasks);
}

export function loadSmartHistory(): SmartHistoryEntry[] {
  const parsed = readStorage<unknown[]>(HISTORY_STORAGE_KEY, []);
  if (!Array.isArray(parsed)) {
    return [];
  }

  const deduped = new Map<string, SmartHistoryEntry>();
  for (const item of parsed) {
    if (!isObject(item)) {
      continue;
    }

    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const signature = typeof item.signature === 'string' ? item.signature.trim() : '';
    const command = typeof item.command === 'string' ? item.command.trim() : '';
    const cwd = typeof item.cwd === 'string' ? normalizePath(item.cwd) : '';
    const groupRoot = typeof item.groupRoot === 'string' ? normalizePath(item.groupRoot) : '';
    const groupLabel = typeof item.groupLabel === 'string' ? item.groupLabel.trim() : basename(groupRoot || cwd || '/');
    const lastExitCode = Number.isFinite(item.lastExitCode) ? Number(item.lastExitCode) : null;
    const lastDurationMs = Number.isFinite(item.lastDurationMs) ? Number(item.lastDurationMs) : null;
    const lastRanAt = Number.isFinite(item.lastRanAt) ? Number(item.lastRanAt) : 0;
    const runCount = Number.isFinite(item.runCount) ? Math.max(1, Math.round(Number(item.runCount))) : 1;
    const favorite = Boolean(item.favorite);

    if (!id || !signature || !command || !cwd || !groupRoot || lastRanAt <= 0) {
      continue;
    }

    const existing = deduped.get(signature);
    if (!existing || existing.lastRanAt < lastRanAt) {
      deduped.set(signature, {
        id,
        signature,
        command,
        cwd,
        groupRoot,
        groupLabel,
        lastExitCode,
        lastDurationMs,
        lastRanAt,
        runCount,
        favorite
      });
    }
  }

  return Array.from(deduped.values()).sort((left, right) => right.lastRanAt - left.lastRanAt);
}

export function saveSmartHistory(history: SmartHistoryEntry[]): void {
  writeStorage(HISTORY_STORAGE_KEY, history.slice(0, HISTORY_LIMIT));
}

function smartHistorySignature(groupRoot: string, command: string): string {
  return `${groupRoot}::${command}`;
}

export function upsertSmartHistoryEntry(
  history: SmartHistoryEntry[],
  report: ShellCommandReport,
  groupRoot: string,
  groupLabel: string
): SmartHistoryEntry[] {
  const command = report.command.trim();
  if (!command) {
    return history;
  }

  const signature = smartHistorySignature(groupRoot, command);
  const next = history.slice();
  const existingIndex = next.findIndex((entry) => entry.signature === signature);
  const now = Date.now();

  if (existingIndex >= 0) {
    const current = next[existingIndex];
    if (!current) {
      return history;
    }

    next[existingIndex] = {
      ...current,
      cwd: normalizePath(report.cwd),
      groupRoot,
      groupLabel,
      lastExitCode: report.exitCode,
      lastDurationMs: report.durationMs,
      lastRanAt: now,
      runCount: current.runCount + 1
    };
  } else {
    next.push({
      id: crypto.randomUUID(),
      signature,
      command,
      cwd: normalizePath(report.cwd),
      groupRoot,
      groupLabel,
      lastExitCode: report.exitCode,
      lastDurationMs: report.durationMs,
      lastRanAt: now,
      runCount: 1,
      favorite: false
    });
  }

  next.sort((left, right) => {
    if (left.favorite !== right.favorite) {
      return left.favorite ? -1 : 1;
    }

    return right.lastRanAt - left.lastRanAt;
  });

  if (next.length <= HISTORY_LIMIT) {
    return next;
  }

  const pinned = next.filter((entry) => entry.favorite);
  const unpinned = next.filter((entry) => !entry.favorite);
  return [...pinned, ...unpinned.slice(0, Math.max(0, HISTORY_LIMIT - pinned.length))];
}

export function toggleHistoryFavorite(history: SmartHistoryEntry[], entryId: string): SmartHistoryEntry[] {
  return history.map((entry) =>
    entry.id === entryId
      ? {
          ...entry,
          favorite: !entry.favorite
        }
      : entry
  );
}

export function touchTaskRun(tasks: TaskPreset[], taskId: string): TaskPreset[] {
  return tasks.map((task) =>
    task.id === taskId
      ? {
          ...task,
          lastRunAt: Date.now()
        }
      : task
  );
}

export function toggleTaskFavorite(tasks: TaskPreset[], taskId: string): TaskPreset[] {
  return tasks.map((task) =>
    task.id === taskId
      ? {
          ...task,
          favorite: !task.favorite
        }
      : task
  );
}

function parseEscapedSegments(value: string): string[] {
  const result: string[] = [];
  let current = '';
  let escaped = false;

  for (const char of value) {
    if (escaped) {
      if (char === 'n') {
        current += '\n';
      } else {
        current += char;
      }
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === ';') {
      result.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  if (escaped) {
    current += '\\';
  }

  result.push(current);
  return result;
}

function parseShellPayload(payload: string): ShellPayload {
  const pairs = parseEscapedSegments(payload);
  const out: ShellPayload = {};
  for (const pair of pairs) {
    if (!pair) {
      continue;
    }

    const split = pair.indexOf('=');
    if (split <= 0) {
      continue;
    }

    const key = pair.slice(0, split);
    const value = pair.slice(split + 1);
    if (key === 'cmd' || key === 'cwd' || key === 'exit' || key === 'dur') {
      out[key] = value;
    }
  }

  return out;
}

function payloadToReport(payload: ShellPayload): ShellCommandReport | null {
  if (!payload.cmd || !payload.cwd) {
    return null;
  }

  const exitCode = Number(payload.exit);
  if (!Number.isFinite(exitCode)) {
    return null;
  }

  const durationMs = Number(payload.dur);
  if (!Number.isFinite(durationMs)) {
    return null;
  }

  return {
    command: payload.cmd.trim(),
    cwd: normalizePath(payload.cwd),
    exitCode: Math.round(exitCode),
    durationMs: Math.max(0, Math.round(durationMs))
  };
}

export function extractShellCommandReports(
  chunk: string,
  pendingBuffer: string
): { cleanData: string; buffer: string; reports: ShellCommandReport[] } {
  const combined = `${pendingBuffer}${chunk}`;
  if (!combined.includes(OSC_PREFIX)) {
    return {
      cleanData: combined,
      buffer: '',
      reports: []
    };
  }

  const output: string[] = [];
  const reports: ShellCommandReport[] = [];
  let cursor = 0;

  while (true) {
    const start = combined.indexOf(OSC_PREFIX, cursor);
    if (start < 0) {
      break;
    }

    const payloadStart = start + OSC_PREFIX.length;
    const belEnd = combined.indexOf(OSC_TERMINATOR_BEL, payloadStart);
    const stEnd = combined.indexOf(OSC_TERMINATOR_ST, payloadStart);
    const end = belEnd < 0 ? stEnd : stEnd < 0 ? belEnd : Math.min(belEnd, stEnd);
    if (end < 0) {
      break;
    }
    const terminatorLength = end === belEnd ? OSC_TERMINATOR_BEL.length : OSC_TERMINATOR_ST.length;

    output.push(combined.slice(cursor, start));
    const payload = combined.slice(payloadStart, end);
    const report = payloadToReport(parseShellPayload(payload));
    if (report && report.command.length > 0) {
      reports.push(report);
    }
    cursor = end + terminatorLength;
  }

  const remainder = combined.slice(cursor);
  const pendingStart = remainder.indexOf(OSC_PREFIX);
  if (pendingStart >= 0) {
    output.push(remainder.slice(0, pendingStart));
    return {
      cleanData: output.join(''),
      buffer: remainder.slice(pendingStart),
      reports
    };
  }

  output.push(remainder);
  return {
    cleanData: output.join(''),
    buffer: '',
    reports
  };
}

export function sortTasksForPalette(tasks: TaskPreset[]): TaskPreset[] {
  return tasks
    .slice()
    .sort((left, right) => {
      if (left.favorite !== right.favorite) {
        return left.favorite ? -1 : 1;
      }

      const leftRecent = left.lastRunAt ?? left.createdAt;
      const rightRecent = right.lastRunAt ?? right.createdAt;
      if (leftRecent !== rightRecent) {
        return rightRecent - leftRecent;
      }

      return left.name.localeCompare(right.name);
    });
}

export function sortHistoryForPalette(
  history: SmartHistoryEntry[],
  currentGroupRoot: string | null
): SmartHistoryEntry[] {
  return history
    .slice()
    .sort((left, right) => {
      const leftCurrent = currentGroupRoot !== null && left.groupRoot === currentGroupRoot;
      const rightCurrent = currentGroupRoot !== null && right.groupRoot === currentGroupRoot;
      if (leftCurrent !== rightCurrent) {
        return leftCurrent ? -1 : 1;
      }

      if (left.favorite !== right.favorite) {
        return left.favorite ? -1 : 1;
      }

      return right.lastRanAt - left.lastRanAt;
    });
}

export function findLastFailedHistory(
  history: SmartHistoryEntry[],
  currentGroupRoot: string | null
): SmartHistoryEntry | undefined {
  const ordered = sortHistoryForPalette(history, currentGroupRoot);
  return ordered.find((entry) => entry.lastExitCode !== null && entry.lastExitCode !== 0);
}
