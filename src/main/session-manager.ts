import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { BrowserWindow } from 'electron';
import * as pty from 'node-pty';
import type {
  CreateSessionRequest,
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
}

let spawnHelperChecked = false;

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

export class SessionManager {
  private readonly sessions = new Map<string, SessionRecord>();

  constructor(
    private readonly settings: SettingsService,
    private readonly getWindow: () => BrowserWindow | null
  ) {}

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
      cwd
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
    for (const session of this.sessions.values()) {
      session.process.kill();
    }

    this.sessions.clear();
  }

  private sendToRenderer<T>(channel: string, payload: T): void {
    const window = this.getWindow();
    if (!window || window.isDestroyed()) {
      return;
    }

    window.webContents.send(channel, payload);
  }
}
