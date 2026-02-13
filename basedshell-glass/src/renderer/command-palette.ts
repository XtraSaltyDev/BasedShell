export interface CommandPaletteAction {
  id: string;
  title: string;
  description?: string;
  shortcut?: string;
  keywords?: string[];
  run: () => void | Promise<void>;
}

interface CommandPaletteOptions {
  root: HTMLElement;
  scrim: HTMLElement;
  input: HTMLInputElement;
  results: HTMLElement;
  onActionError?: (action: CommandPaletteAction, error: unknown) => void;
}

interface RankedAction {
  action: CommandPaletteAction;
  score: number;
  pinned: boolean;
  recent: boolean;
}

const PINS_STORAGE_KEY = 'basedshell.palette.pins.v1';
const RECENTS_STORAGE_KEY = 'basedshell.palette.recents.v1';
const MAX_RECENTS = 20;

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

function fuzzyScore(query: string, text: string): number | null {
  const q = normalize(query);
  const t = normalize(text);
  if (!q) {
    return 0;
  }

  let qIndex = 0;
  let score = 0;
  let lastMatchIndex = -2;
  for (let index = 0; index < t.length && qIndex < q.length; index += 1) {
    if (t[index] !== q[qIndex]) {
      continue;
    }

    score += index === lastMatchIndex + 1 ? 10 : 2;
    if (index === 0 || t[index - 1] === ' ' || t[index - 1] === '-' || t[index - 1] === '/') {
      score += 6;
    }
    lastMatchIndex = index;
    qIndex += 1;
  }

  if (qIndex !== q.length) {
    return null;
  }

  return score;
}

function readStoredList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((value): value is string => typeof value === 'string');
  } catch {
    return [];
  }
}

function writeStoredList(key: string, values: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(values));
  } catch {
    // Ignore storage failures (private mode, quota errors).
  }
}

export interface CommandPaletteController {
  isOpen: () => boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  setActions: (actions: CommandPaletteAction[]) => void;
  handleGlobalKeydown: (event: KeyboardEvent) => boolean;
}

export function createCommandPalette(options: CommandPaletteOptions): CommandPaletteController {
  const actions = new Map<string, CommandPaletteAction>();
  let pinnedIds = readStoredList(PINS_STORAGE_KEY);
  let recentIds = readStoredList(RECENTS_STORAGE_KEY);
  let visibleActions: RankedAction[] = [];
  let activeIndex = 0;
  let open = false;

  function savePins(): void {
    writeStoredList(PINS_STORAGE_KEY, pinnedIds);
  }

  function saveRecents(): void {
    writeStoredList(RECENTS_STORAGE_KEY, recentIds);
  }

  function currentQuery(): string {
    return options.input.value.trim();
  }

  function pinIndex(actionId: string): number {
    return pinnedIds.findIndex((id) => id === actionId);
  }

  function recentIndex(actionId: string): number {
    return recentIds.findIndex((id) => id === actionId);
  }

  function togglePin(actionId: string): void {
    const current = pinIndex(actionId);
    if (current >= 0) {
      pinnedIds = pinnedIds.filter((id) => id !== actionId);
    } else {
      pinnedIds = [actionId, ...pinnedIds.filter((id) => id !== actionId)];
    }

    savePins();
    render();
  }

  function rememberAction(actionId: string): void {
    recentIds = [actionId, ...recentIds.filter((id) => id !== actionId)].slice(0, MAX_RECENTS);
    saveRecents();
  }

  function actionCorpus(action: CommandPaletteAction): string {
    return [action.title, action.description ?? '', action.keywords?.join(' ') ?? ''].join(' ');
  }

  function rankActions(query: string): RankedAction[] {
    const queryNorm = normalize(query);
    const ranked: RankedAction[] = [];
    for (const action of actions.values()) {
      const pinned = pinIndex(action.id) >= 0;
      const recent = recentIndex(action.id) >= 0;
      if (!queryNorm) {
        ranked.push({
          action,
          score: 0,
          pinned,
          recent
        });
        continue;
      }

      const score = fuzzyScore(queryNorm, actionCorpus(action));
      if (score === null) {
        continue;
      }

      ranked.push({
        action,
        score: score + (pinned ? 20 : 0) + (recent ? 8 : 0),
        pinned,
        recent
      });
    }

    if (!queryNorm) {
      ranked.sort((left, right) => {
        const leftPin = pinIndex(left.action.id);
        const rightPin = pinIndex(right.action.id);
        if (leftPin >= 0 || rightPin >= 0) {
          if (leftPin < 0) {
            return 1;
          }

          if (rightPin < 0) {
            return -1;
          }

          return leftPin - rightPin;
        }

        const leftRecent = recentIndex(left.action.id);
        const rightRecent = recentIndex(right.action.id);
        if (leftRecent >= 0 || rightRecent >= 0) {
          if (leftRecent < 0) {
            return 1;
          }

          if (rightRecent < 0) {
            return -1;
          }

          return leftRecent - rightRecent;
        }

        return left.action.title.localeCompare(right.action.title);
      });
      return ranked;
    }

    ranked.sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.action.title.localeCompare(right.action.title);
    });
    return ranked;
  }

  function close(): void {
    if (!open) {
      return;
    }

    open = false;
    options.root.classList.remove('open');
    options.scrim.classList.remove('open');
    setTimeout(() => {
      if (!open) {
        options.root.classList.add('hidden');
        options.scrim.classList.add('hidden');
      }
    }, 220);
  }

  function executeAction(action: CommandPaletteAction): void {
    rememberAction(action.id);
    close();
    const result = action.run();
    void Promise.resolve(result).catch((error) => {
      options.onActionError?.(action, error);
    });
  }

  function render(): void {
    visibleActions = rankActions(currentQuery());
    if (visibleActions.length === 0) {
      activeIndex = 0;
      options.results.innerHTML = '<li class="palette-empty">No matching actions</li>';
      return;
    }

    activeIndex = Math.max(0, Math.min(activeIndex, visibleActions.length - 1));
    options.results.innerHTML = '';

    const fragment = document.createDocumentFragment();
    for (let index = 0; index < visibleActions.length; index += 1) {
      const ranked = visibleActions[index];
      if (!ranked) {
        continue;
      }
      const item = document.createElement('li');
      item.className = 'palette-item';
      if (index === activeIndex) {
        item.classList.add('active');
      }
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', index === activeIndex ? 'true' : 'false');
      item.dataset.actionId = ranked.action.id;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'palette-action';
      button.dataset.actionId = ranked.action.id;

      const text = document.createElement('span');
      text.className = 'palette-text';
      const title = document.createElement('span');
      title.className = 'palette-title';
      title.textContent = ranked.action.title;
      const meta = document.createElement('span');
      meta.className = 'palette-meta';
      const metaParts: string[] = [];
      if (ranked.pinned) {
        metaParts.push('Pinned');
      }
      if (ranked.recent) {
        metaParts.push('Recent');
      }
      if (ranked.action.description) {
        metaParts.push(ranked.action.description);
      }
      meta.textContent = metaParts.join(' · ');
      text.append(title, meta);

      const right = document.createElement('span');
      right.className = 'palette-right';
      if (ranked.action.shortcut) {
        const shortcut = document.createElement('span');
        shortcut.className = 'palette-shortcut';
        shortcut.textContent = ranked.action.shortcut;
        right.append(shortcut);
      }

      const pin = document.createElement('button');
      pin.type = 'button';
      pin.className = 'palette-pin';
      pin.setAttribute('aria-label', ranked.pinned ? 'Unpin action' : 'Pin action');
      pin.title = ranked.pinned ? 'Unpin action' : 'Pin action';
      pin.textContent = ranked.pinned ? '★' : '☆';
      pin.dataset.actionId = ranked.action.id;
      right.append(pin);

      button.append(text, right);
      item.append(button);
      fragment.append(item);
    }

    options.results.append(fragment);
  }

  function openPalette(): void {
    if (open) {
      options.input.focus();
      options.input.select();
      return;
    }

    open = true;
    options.root.classList.remove('hidden');
    options.scrim.classList.remove('hidden');
    activeIndex = 0;
    render();
    requestAnimationFrame(() => {
      options.root.classList.add('open');
      options.scrim.classList.add('open');
      options.input.focus();
      options.input.select();
    });
  }

  function moveSelection(direction: 1 | -1): void {
    if (visibleActions.length === 0) {
      return;
    }

    activeIndex = (activeIndex + direction + visibleActions.length) % visibleActions.length;
    render();
  }

  options.input.addEventListener('input', () => {
    activeIndex = 0;
    render();
  });

  options.scrim.addEventListener('click', () => {
    close();
  });

  options.results.addEventListener('mousemove', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const item = target.closest<HTMLElement>('.palette-item');
    if (!item || !item.dataset.actionId) {
      return;
    }

    const index = visibleActions.findIndex((entry) => entry.action.id === item.dataset.actionId);
    if (index >= 0 && index !== activeIndex) {
      activeIndex = index;
      render();
    }
  });

  options.results.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const pinButton = target.closest<HTMLButtonElement>('.palette-pin');
    if (pinButton?.dataset.actionId) {
      event.preventDefault();
      event.stopPropagation();
      togglePin(pinButton.dataset.actionId);
      return;
    }

    const actionButton = target.closest<HTMLButtonElement>('.palette-action');
    const actionId = actionButton?.dataset.actionId;
    if (!actionId) {
      return;
    }

    const action = actions.get(actionId);
    if (!action) {
      return;
    }

    executeAction(action);
  });

  return {
    isOpen: () => open,
    open: openPalette,
    close,
    toggle: () => {
      if (open) {
        close();
      } else {
        openPalette();
      }
    },
    setActions: (nextActions: CommandPaletteAction[]) => {
      actions.clear();
      for (const action of nextActions) {
        actions.set(action.id, action);
      }

      pinnedIds = pinnedIds.filter((id) => actions.has(id));
      recentIds = recentIds.filter((id) => actions.has(id));
      savePins();
      saveRecents();
      if (open) {
        render();
      }
    },
    handleGlobalKeydown: (event: KeyboardEvent): boolean => {
      if (!open) {
        return false;
      }

      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        close();
        return true;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return true;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveSelection(1);
        return true;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveSelection(-1);
        return true;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        const active = visibleActions[activeIndex];
        if (active) {
          executeAction(active.action);
        }
        return true;
      }

      return false;
    }
  };
}
