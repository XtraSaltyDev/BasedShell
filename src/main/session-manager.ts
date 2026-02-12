import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import type { BrowserWindow } from 'electron';
import * as pty from 'node-pty';
import type {
  CreateSessionRequest,
  SessionContextEvent,
  SessionDataEvent,
  SessionExitEvent,
  SessionResizeRequest,
  SessionSummary,
  SessionWriteRequest
} from '../shared/types';
import { SettingsService } from './settings';

interface SessionRecord {
  id: string;
  process: pty.IPty;
  profileId: string;
  shell: string;
  cwd: string;
  sshHost: string | null;
}

let spawnHelperChecked = false;
const execFileAsync = promisify(execFile);
const SSH_OPTION_REQUIRES_VALUE = new Set([
  '-b',
  '-c',
  '-D',
  '-E',
  '-e',
  '-F',
  '-I',
  '-i',
  '-J',
  '-L',
  '-l',
  '-m',
  '-O',
  '-o',
  '-p',
  '-Q',
  '-R',
  '-S',
  '-W',
  '-w'
]);

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sanitizeRuntimeEnv(input: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};

  for (const [key, value] of Object.entries(input)) {
    if (typeof value !== 'string') {
      continue;
    }

    out[key] = value;
  }

  // `npm run dev` injects many npm_* vars that should not bleed into interactive shells.
  const blockedExact = new Set([
    'npm_config_prefix',
    'NPM_CONFIG_PREFIX',
    'npm_execpath',
    'npm_node_execpath',
    'npm_command',
    'npm_lifecycle_event',
    'npm_lifecycle_script'
  ]);

  for (const key of Object.keys(out)) {
    if (blockedExact.has(key)) {
      delete out[key];
      continue;
    }

    if (key.startsWith('npm_package_') || key.startsWith('npm_config_')) {
      delete out[key];
    }
  }

  return out;
}

function ensureSpawnHelperExecutable(): void {
  if (spawnHelperChecked || process.platform !== 'darwin') {
    return;
  }

  spawnHelperChecked = true;

  try {
    const packagePath = require.resolve('node-pty/package.json');
    const root = path.dirname(packagePath);
    const candidates = [
      path.join(root, 'build', 'Release', 'spawn-helper'),
      path.join(root, 'build', 'Debug', 'spawn-helper'),
      path.join(root, 'prebuilds', `darwin-${process.arch}`, 'spawn-helper'),
      path.join(root, 'prebuilds', 'darwin-arm64', 'spawn-helper'),
      path.join(root, 'prebuilds', 'darwin-x64', 'spawn-helper')
    ];

    for (const helperPath of candidates) {
      if (!fs.existsSync(helperPath)) {
        continue;
      }

      const stat = fs.statSync(helperPath);
      const mode = stat.mode & 0o777;
      if ((mode & 0o111) !== 0) {
        continue;
      }

      fs.chmodSync(helperPath, mode | 0o755);
    }
  } catch {
    // If helper permissions can't be adjusted, node-pty spawn will surface the error.
  }
}

function parseShellTokens(command: string): string[] {
  const matches = command.match(/"[^"]*"|'[^']*'|\S+/g);
  if (!matches) {
    return [];
  }

  return matches.map((token) => token.replace(/^['"]|['"]$/g, ''));
}

function parseSshHost(command: string): string | null {
  const tokens = parseShellTokens(command);
  if (tokens.length === 0) {
    return null;
  }

  const execName = path.basename(tokens[0] ?? '');
  if (!execName.includes('ssh')) {
    return null;
  }

  let hostToken: string | undefined;
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token) {
      continue;
    }

    if (token === '--') {
      hostToken = tokens[index + 1];
      break;
    }

    if (token.startsWith('-')) {
      if (token.length > 2 && SSH_OPTION_REQUIRES_VALUE.has(token.slice(0, 2))) {
        continue;
      }

      if (SSH_OPTION_REQUIRES_VALUE.has(token)) {
        index += 1;
      }
      continue;
    }

    hostToken = token;
    break;
  }

  if (!hostToken) {
    return null;
  }

  let host = hostToken;
  const at = host.lastIndexOf('@');
  if (at >= 0 && at < host.length - 1) {
    host = host.slice(at + 1);
  }

  if (host.startsWith('[')) {
    const closing = host.indexOf(']');
    if (closing > 1) {
      host = host.slice(1, closing);
    }
  } else if (host.includes(':')) {
    host = host.split(':', 1)[0] ?? host;
  }

  const normalized = host.trim();
  return normalized.length > 0 ? normalized : null;
}

async function resolveProcessCwd(pid: number): Promise<string | null> {
  if (process.platform === 'linux') {
    try {
      return await fs.promises.readlink(`/proc/${pid}/cwd`);
    } catch {
      return null;
    }
  }

  if (process.platform === 'darwin') {
    try {
      const { stdout } = await execFileAsync('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], {
        timeout: 1500,
        maxBuffer: 128 * 1024
      });
      for (const line of stdout.split('\n')) {
        if (line.startsWith('n')) {
          const cwd = line.slice(1).trim();
          return cwd || null;
        }
      }
    } catch {
      return null;
    }
  }

  return null;
}

async function resolveSshHost(pid: number): Promise<string | null> {
  try {
    const child = await execFileAsync('pgrep', ['-P', String(pid), 'ssh'], {
      timeout: 1000,
      maxBuffer: 128 * 1024
    });
    const sshPid = child.stdout
      .split(/\s+/)
      .map((value) => value.trim())
      .find((value) => value.length > 0);
    if (!sshPid) {
      return null;
    }

    const command = await execFileAsync('ps', ['-o', 'command=', '-p', sshPid], {
      timeout: 1000,
      maxBuffer: 128 * 1024
    });
    return parseSshHost(command.stdout.trim());
  } catch {
    return null;
  }
}

export class SessionManager {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly contextPollTimer: ReturnType<typeof setInterval>;

  constructor(
    private readonly settings: SettingsService,
    private readonly getWindow: () => BrowserWindow | null
  ) {
    this.contextPollTimer = setInterval(() => {
      void this.refreshSessionContext();
    }, 2000);
  }

  createSession(request: CreateSessionRequest): SessionSummary {
    ensureSpawnHelperExecutable();

    const profile = this.settings.findProfile(request.profileId);
    const cols = Math.round(clamp(request.cols, 20, 600));
    const rows = Math.round(clamp(request.rows, 10, 300));

    const desiredCwd = request.cwd?.trim() || profile.cwd;
    const cwd = desiredCwd && fs.existsSync(desiredCwd) ? desiredCwd : profile.cwd;

    const env = {
      ...sanitizeRuntimeEnv(process.env),
      ...profile.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor'
    };

    const proc = pty.spawn(profile.shell, profile.args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env
    });

    const sessionId = randomUUID();

    this.sessions.set(sessionId, {
      id: sessionId,
      process: proc,
      profileId: profile.id,
      shell: profile.shell,
      cwd,
      sshHost: null
    });

    proc.onData((data) => {
      this.sendToRenderer<SessionDataEvent>('terminal:data', {
        sessionId,
        data
      });
    });

    proc.onExit((event) => {
      this.sendToRenderer<SessionExitEvent>('terminal:exit', {
        sessionId,
        exitCode: event.exitCode,
        signal: event.signal
      });

      this.sessions.delete(sessionId);
    });

    return {
      sessionId,
      profileId: profile.id,
      shell: profile.shell,
      cwd,
      pid: proc.pid
    };
  }

  write(request: SessionWriteRequest): void {
    const session = this.sessions.get(request.sessionId);
    if (!session) {
      return;
    }

    session.process.write(request.data);
  }

  resize(request: SessionResizeRequest): void {
    const session = this.sessions.get(request.sessionId);
    if (!session) {
      return;
    }

    const cols = Math.round(clamp(request.cols, 20, 600));
    const rows = Math.round(clamp(request.rows, 10, 300));
    session.process.resize(cols, rows);
  }

  close(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    session.process.kill();
    this.sessions.delete(sessionId);
  }

  dispose(): void {
    clearInterval(this.contextPollTimer);
    for (const session of this.sessions.values()) {
      session.process.kill();
    }

    this.sessions.clear();
  }

  private async refreshSessionContext(): Promise<void> {
    for (const session of this.sessions.values()) {
      const cwd = (await resolveProcessCwd(session.process.pid)) ?? session.cwd;
      const sshHost = await resolveSshHost(session.process.pid);
      if (cwd === session.cwd && sshHost === session.sshHost) {
        continue;
      }

      session.cwd = cwd;
      session.sshHost = sshHost;
      this.sendToRenderer<SessionContextEvent>('terminal:context', {
        sessionId: session.id,
        cwd,
        sshHost
      });
    }
  }

  private sendToRenderer<T>(channel: string, payload: T): void {
    const window = this.getWindow();
    if (!window || window.isDestroyed()) {
      return;
    }

    window.webContents.send(channel, payload);
  }
}
