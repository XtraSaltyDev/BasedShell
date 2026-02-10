# LocalTerminal — Phase 2: Intensive Design Implementation

## Competitive Landscape & Design Target

Phase 1 delivered a rock-solid terminal: multi-tab PTY sessions, settings persistence, 4 themes, keyboard shortcuts, macOS menu integration, strict TypeScript, Electron context isolation. The foundation is production-grade. But the UI reads as "developer prototype" — flat surfaces, no motion, Unicode button glyphs, a modal settings dialog, themes that only reskin the xterm area while the chrome stays permanently dark. Phase 2 closes that gap.

The benchmark is the top tier of macOS terminal design: Warp's full-UI theming with gradient support and block-based visual hierarchy. Kitty's GPU-smooth tab bar styles (fade, slant, powerline). iTerm2's inactive-pane dimming and tab activity indicators. Tabby's native vibrancy with acrylic blur. Rio's sub-50µs render times and minimal-yet-rich aesthetic. The target is not to copy any one of these — it is to match their level of craft and exceed it in coherence, because LocalTerminal controls both the chrome and the terminal renderer in a single Electron process where every pixel is ours.

The design north star: **every interaction should feel like sliding a finger across glass — zero friction, immediate feedback, nothing janky, nothing abrupt.**

---

## 1. Design Token System

This is the foundation. Every color, spacing value, font size, shadow, radius, duration, and easing in the entire app must come from tokens. Nothing hardcoded. This makes full-UI theming, light mode, high-contrast mode, and future customization possible without touching component CSS.

### 1A. Token Architecture — Three Layers

Create `src/renderer/tokens.css`, imported before `styles.css`.

**Layer 1 — Primitives** (raw palette values, never used directly in components):

```css
/* Graphite palette */
--primitive-gray-950: #0b0d12;
--primitive-gray-900: #111317;
--primitive-gray-850: #151b26;
--primitive-gray-800: #1a1f2b;
--primitive-gray-750: #1f2736;
--primitive-gray-700: #252e3f;
--primitive-gray-600: #2d3447;
--primitive-gray-500: #3b4a63;
--primitive-gray-400: #4d5f7a;
--primitive-gray-300: #6b7d9b;
--primitive-gray-200: #8c95ab;
--primitive-gray-100: #b0b8cc;
--primitive-gray-50:  #d7deef;
--primitive-gray-25:  #eaf0ff;

--primitive-green-500: #54d2a1;
--primitive-green-400: #6fd3af;
--primitive-green-300: #97ecc0;
--primitive-green-200: #bef5da;
--primitive-green-600: #3d8268;
--primitive-green-700: #1d3f34;
--primitive-green-800: #0f2a22;

--primitive-red-500: #f16d7e;
--primitive-red-400: #ff9bb0;
--primitive-red-600: #c94d5e;
--primitive-red-700: #7a2a35;

--primitive-blue-500: #75a7f0;
--primitive-blue-400: #94bbff;
--primitive-blue-600: #4a7dd4;

--primitive-yellow-500: #f4d68c;
--primitive-yellow-400: #ffe6ad;

--primitive-purple-500: #b89bf6;
--primitive-purple-400: #cab3ff;

--primitive-cyan-500: #72d4e5;
--primitive-cyan-400: #94ecfc;
```

**Layer 2 — Semantic tokens** (intent-based, these are what components reference):

```css
/* Surfaces */
--color-bg-base:             var(--primitive-gray-950);
--color-bg-surface:          var(--primitive-gray-900);
--color-bg-elevated:         var(--primitive-gray-800);
--color-bg-overlay:          rgba(15, 18, 28, 0.95);
--color-bg-inset:            var(--primitive-gray-850);

/* Borders */
--color-border-default:      var(--primitive-gray-600);
--color-border-subtle:       var(--primitive-gray-700);
--color-border-strong:       var(--primitive-gray-500);
--color-border-accent:       rgba(107, 203, 168, 0.35);

/* Text */
--color-text-primary:        var(--primitive-gray-50);
--color-text-secondary:      var(--primitive-gray-200);
--color-text-muted:          var(--primitive-gray-300);
--color-text-disabled:       var(--primitive-gray-400);
--color-text-inverse:        var(--primitive-gray-950);

/* Interactive */
--color-accent:              var(--primitive-green-500);
--color-accent-hover:        var(--primitive-green-400);
--color-accent-muted:        var(--primitive-green-700);
--color-accent-subtle:       var(--primitive-green-800);
--color-danger:              var(--primitive-red-500);
--color-danger-hover:        var(--primitive-red-400);
--color-danger-muted:        var(--primitive-red-700);
--color-warning:             var(--primitive-yellow-500);
--color-info:                var(--primitive-blue-500);
--color-success:             var(--primitive-green-500);

/* Focus */
--color-focus-ring:          rgba(84, 210, 161, 0.5);

/* Shadows */
--shadow-sm:    0 1px 2px rgba(0, 0, 0, 0.3);
--shadow-md:    0 4px 12px rgba(0, 0, 0, 0.4);
--shadow-lg:    0 8px 32px rgba(0, 0, 0, 0.5);
--shadow-glow:  0 0 12px rgba(84, 210, 161, 0.15);
--shadow-inset: inset 0 1px 0 rgba(255, 255, 255, 0.03);
```

**Layer 3 — Component tokens** (scoped per component, override semantic tokens):

```css
/* Tab bar */
--tab-bg-idle:       var(--color-bg-inset);
--tab-bg-active:     var(--color-bg-elevated);
--tab-bg-hover:      var(--primitive-gray-750);
--tab-fg-idle:       var(--color-text-secondary);
--tab-fg-active:     var(--color-text-primary);
--tab-border-idle:   var(--color-border-subtle);
--tab-border-active: var(--color-border-strong);
--tab-indicator:     var(--color-accent);
--tab-close-hover:   rgba(255, 255, 255, 0.08);

/* Topbar */
--topbar-bg:         linear-gradient(180deg, var(--primitive-gray-800) 0%, var(--primitive-gray-850) 100%);
--topbar-border:     var(--color-border-default);

/* Status bar */
--statusbar-bg:      var(--primitive-gray-900);
--statusbar-border:  var(--color-border-default);
--statusbar-fg:      var(--color-text-muted);

/* Settings panel */
--panel-bg:          var(--primitive-gray-900);
--panel-border:      var(--color-border-default);

/* Search */
--search-bg:         var(--color-bg-overlay);
--search-border:     var(--color-border-strong);
--search-match:      rgba(84, 210, 161, 0.25);
--search-match-active: rgba(84, 210, 161, 0.5);

/* Command palette */
--palette-bg:        var(--color-bg-overlay);
--palette-border:    var(--color-border-strong);
--palette-item-hover: rgba(255, 255, 255, 0.04);
--palette-item-active: var(--color-accent-subtle);

/* Inputs */
--input-bg:          var(--primitive-gray-950);
--input-border:      var(--color-border-default);
--input-border-focus: var(--color-accent);
--input-fg:          var(--color-text-primary);
--input-placeholder: var(--color-text-disabled);

/* Toast */
--toast-bg:          var(--color-bg-elevated);
--toast-border:      var(--color-border-default);
```

### 1B. Typography System

Replace all ad-hoc font sizes with a named scale. Use a ratio of roughly 1.2 (minor third) anchored to 13px body.

```css
/* Type scale */
--font-ui:           'SF Pro Text', 'Inter', 'Segoe UI', system-ui, sans-serif;
--font-ui-medium:    'SF Pro Text', 'Inter', 'Segoe UI', system-ui, sans-serif;
--font-mono:         'SF Mono', 'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace;

--type-xs:           10px;    /* status bar secondary, badges */
--type-sm:           11px;    /* status bar primary, captions */
--type-base:         13px;    /* body text, labels, menu items */
--type-md:           14px;    /* tab titles, input fields */
--type-lg:           16px;    /* section headers, dialog titles */
--type-xl:           20px;    /* panel titles */
--type-xxl:          24px;    /* onboarding, empty states */

/* Line heights — matched to type scale */
--leading-xs:        14px;
--leading-sm:        16px;
--leading-base:      20px;
--leading-md:        20px;
--leading-lg:        24px;
--leading-xl:        28px;
--leading-xxl:       32px;

/* Font weights */
--weight-regular:    400;
--weight-medium:     500;
--weight-semibold:   600;
--weight-bold:       700;

/* Letter spacing */
--tracking-tight:    -0.01em;
--tracking-normal:   0;
--tracking-wide:     0.02em;
--tracking-wider:    0.04em;
```

Implementation note: `SF Pro Text` is available on macOS natively. On other platforms, fall through to `Inter` (bundle it or rely on system fallback). The current `Avenir Next` is fine but SF Pro is what every native macOS app uses — matching it eliminates the "this feels like a web app" uncanny valley.

### 1C. Spacing Scale

4px base unit. Every margin, padding, and gap in the app must use one of these values:

```css
--space-0:   0;
--space-1:   4px;     /* tight internal padding, icon gaps */
--space-2:   8px;     /* standard internal padding */
--space-3:   12px;    /* between related elements */
--space-4:   16px;    /* section padding, component gaps */
--space-5:   20px;    /* generous component spacing */
--space-6:   24px;    /* section margins */
--space-8:   32px;    /* panel padding, major section gaps */
--space-10:  40px;    /* page-level margins */
--space-12:  48px;    /* topbar height */
```

### 1D. Radii Scale

```css
--radius-sm:   4px;   /* badges, small chips */
--radius-md:   8px;   /* buttons, inputs, tabs */
--radius-lg:   12px;  /* dialogs, panels, cards */
--radius-xl:   16px;  /* command palette, large overlays */
--radius-full: 9999px; /* pills, circular buttons */
```

---

## 2. Motion & Animation System

This is what makes the app feel "buttery." Every visual change — every hover, every panel slide, every tab switch — must be animated with consistent, physics-informed timing. No instant state changes anywhere except when `prefers-reduced-motion: reduce` is active.

### 2A. Motion Tokens

```css
/* Durations */
--duration-instant:  0ms;       /* reduced-motion override */
--duration-fast:     100ms;     /* micro hover, focus ring */
--duration-normal:   180ms;     /* tab switch, button press */
--duration-moderate: 280ms;     /* panel slide, overlay appear */
--duration-slow:     400ms;     /* full-page transitions, command palette */

/* Easing curves */

/* For elements ENTERING the viewport (slide in, fade in, expand): */
--ease-out:          cubic-bezier(0.16, 1, 0.3, 1);

/* For elements LEAVING the viewport (slide out, fade out, collapse): */
--ease-in:           cubic-bezier(0.55, 0, 1, 0.45);

/* For state changes that stay in place (color, background, border): */
--ease-standard:     cubic-bezier(0.2, 0, 0, 1);

/* For playful feedback (bouncy settings save, toast pop-in): */
--ease-spring:       cubic-bezier(0.34, 1.56, 0.64, 1);

/* For drag follow (cursor tracking, drag-reorder ghost): */
--ease-responsive:   cubic-bezier(0, 0, 0.2, 1);
```

### 2B. Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

### 2C. Specific Animation Specifications

Each interaction below specifies exact property, duration, and easing. These are not suggestions — they are the implementation spec.

**Hover states (buttons, tabs, interactive elements):**
```css
transition: background var(--duration-fast) var(--ease-standard),
            color var(--duration-fast) var(--ease-standard),
            border-color var(--duration-fast) var(--ease-standard),
            box-shadow var(--duration-fast) var(--ease-standard);
```

**Focus ring appearance:**
```css
transition: outline-offset 100ms var(--ease-out),
            outline-color 100ms var(--ease-out);
/* Focus visible: */
outline: 2px solid var(--color-focus-ring);
outline-offset: 2px;
```

**Panel slide-in (settings, command palette):**
```css
/* Enter */
transform: translateX(100%) → translateX(0);
opacity: 0 → 1;
transition: transform var(--duration-moderate) var(--ease-out),
            opacity var(--duration-normal) var(--ease-out);

/* Exit */
transform: translateX(0) → translateX(100%);
opacity: 1 → 0;
transition: transform var(--duration-normal) var(--ease-in),
            opacity var(--duration-fast) var(--ease-in);
```

**Tab creation:**
```css
/* New tab slides in from right and fades up */
@keyframes tab-enter {
  from {
    opacity: 0;
    max-width: 0;
    padding-left: 0;
    padding-right: 0;
    margin-right: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    max-width: 280px;
    padding-left: 10px;
    padding-right: 10px;
    margin-right: var(--space-1);
    transform: translateY(0);
  }
}
animation: tab-enter var(--duration-moderate) var(--ease-out) forwards;
```

**Tab close:**
```css
@keyframes tab-exit {
  from {
    opacity: 1;
    max-width: 280px;
    padding-left: 10px;
    padding-right: 10px;
    margin-right: var(--space-1);
    transform: scale(1);
  }
  to {
    opacity: 0;
    max-width: 0;
    padding-left: 0;
    padding-right: 0;
    margin-right: 0;
    transform: scale(0.95);
  }
}
animation: tab-exit var(--duration-normal) var(--ease-in) forwards;
/* After animation completes, remove DOM node */
```

**Terminal pane crossfade on tab switch:**
```css
.terminal-pane {
  transition: opacity var(--duration-normal) var(--ease-standard);
}
.terminal-pane.active {
  opacity: 1;
  pointer-events: auto;
}
.terminal-pane:not(.active) {
  opacity: 0;
  pointer-events: none;
}
```

**Toast notification pop-in:**
```css
@keyframes toast-enter {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
@keyframes toast-exit {
  from {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  to {
    opacity: 0;
    transform: translateY(-4px) scale(0.98);
  }
}
/* Enter: */
animation: toast-enter var(--duration-moderate) var(--ease-spring) forwards;
/* Exit (after 3s delay): */
animation: toast-exit var(--duration-normal) var(--ease-in) forwards;
```

**Command palette open:**
```css
@keyframes palette-enter {
  from {
    opacity: 0;
    transform: translateY(-8px) scale(0.98);
    backdrop-filter: blur(0px);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
    backdrop-filter: blur(20px);
  }
}
animation: palette-enter var(--duration-moderate) var(--ease-out) forwards;
```

**Scroll-linked tab overflow fade masks:**
```css
#tab-strip {
  mask-image: linear-gradient(
    to right,
    transparent 0px,
    black 24px,
    black calc(100% - 24px),
    transparent 100%
  );
  /* Only applied when scrollable; toggle via JS class */
}
```

---

## 3. Tab Bar — Premium Redesign

The tab bar is the single most visible UI element. It must rival Warp's clean tab strip and Kitty's stylized tab variants.

### 3A. Layout & Dimensions

```
Topbar height:    44px  (reduced from 48px for tighter feel)
Tab height:       32px
Tab min-width:    100px (compresses to 80px at 10+ tabs)
Tab max-width:    220px
Tab gap:          4px
Tab border-radius: var(--radius-md)  (8px)
Tab padding:      0 var(--space-3) 0 var(--space-2)  (0 12px 0 8px)
Traffic light offset: 14px horizontal, centered vertically in topbar
Topbar left padding: 80px (clears macOS traffic lights with breathing room)
```

### 3B. Tab Visual States

**Idle tab:**
```css
.tab {
  background: var(--tab-bg-idle);
  color: var(--tab-fg-idle);
  border: 1px solid transparent;  /* no visible border by default — cleaner */
  border-radius: var(--radius-md);
  box-shadow: none;
  position: relative;
  overflow: hidden;
}
```

**Hovered tab:**
```css
.tab:hover {
  background: var(--tab-bg-hover);
  color: var(--tab-fg-active);
}
```

**Active tab — the hero state.** This must be unmistakable. Use a luminous bottom indicator (inspired by Warp) combined with elevated background:

```css
.tab.active {
  background: var(--tab-bg-active);
  color: var(--tab-fg-active);
  border-color: var(--tab-border-active);
  box-shadow: var(--shadow-sm), var(--shadow-inset);
}

/* Luminous accent indicator — 2px bar at the bottom of the active tab */
.tab.active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 8px;
  right: 8px;
  height: 2px;
  background: var(--tab-indicator);
  border-radius: 2px 2px 0 0;
  box-shadow: 0 0 8px rgba(84, 210, 161, 0.3);
}
```

This glow effect is the signature visual. It says "this tab is alive."

**Exited tab:**
```css
.tab.exit .tab-title {
  color: var(--color-danger);
  text-decoration: line-through;
  text-decoration-color: rgba(241, 109, 126, 0.4);
}
/* Dim the indicator */
.tab.exit.active::after {
  background: var(--color-danger);
  box-shadow: 0 0 8px rgba(241, 109, 126, 0.2);
}
```

### 3C. Tab Close Button — Hidden by Default

Inspired by iTerm2 and Warp: the close button is invisible until you hover the tab, then it fades in. On the active tab, it's always visible but subdued.

```css
.tab-close {
  opacity: 0;
  width: 18px;
  height: 18px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity var(--duration-fast) var(--ease-standard),
              background var(--duration-fast) var(--ease-standard);
}

.tab.active .tab-close {
  opacity: 0.5;
}

.tab:hover .tab-close {
  opacity: 0.7;
}

.tab-close:hover {
  opacity: 1 !important;
  background: var(--tab-close-hover);
}

.tab-close:active {
  background: rgba(241, 109, 126, 0.15);
  color: var(--color-danger);
}
```

### 3D. Tab Activity Indicator

Benchmark: iTerm2 shows a blue dot for unread output, an activity icon for active output, and a dead icon for exited sessions.

Add a small colored dot (6px diameter) to the left of the tab title for session state:

```
• Green dot (pulsing):   active session receiving output
• No dot:                idle session (no recent output)
• Red dot (static):      exited session
• Blue dot:              unread output (tab was in background when output arrived)
```

Implementation: track a `hasUnreadOutput` flag per tab. Set it when `onSessionData` fires for a non-active tab. Clear it when that tab is activated. The pulsing green dot uses a CSS animation:

```css
@keyframes pulse-dot {
  0%, 100% { opacity: 0.6; transform: scale(1); }
  50%      { opacity: 1;   transform: scale(1.15); }
}
.tab-indicator-dot.active {
  background: var(--color-success);
  animation: pulse-dot 2s var(--ease-standard) infinite;
}
.tab-indicator-dot.unread {
  background: var(--color-info);
}
.tab-indicator-dot.exited {
  background: var(--color-danger);
}
```

### 3E. DOM Reconciliation — Enabling Animations

**This is the critical refactor.** The current `renderTabStrip()` function calls `ui.tabStrip.textContent = ''` and rebuilds every tab from scratch on every render. This makes CSS transitions impossible because elements are destroyed and recreated.

Refactor to a reconciliation model:

```typescript
function renderTabStrip(): void {
  const existingTabs = new Map<string, HTMLElement>();
  for (const child of ui.tabStrip.children) {
    const id = (child as HTMLElement).dataset.tabId;
    if (id) existingTabs.set(id, child as HTMLElement);
  }

  // Remove tabs that no longer exist (with exit animation)
  for (const [id, element] of existingTabs) {
    if (!tabs.has(id)) {
      element.classList.add('tab-exiting');
      element.addEventListener('animationend', () => element.remove(), { once: true });
      existingTabs.delete(id);
    }
  }

  // Update or create tabs in order
  let previousElement: Element | null = null;
  for (const tabId of tabOrder) {
    const tab = tabs.get(tabId);
    if (!tab) continue;

    let element = existingTabs.get(tabId);
    if (!element) {
      element = createTabElement(tab);
      element.classList.add('tab-entering');
    }

    // Update state
    updateTabElement(element, tab, tabId === activeTabId);

    // Ensure correct position
    const expectedNext = previousElement ? previousElement.nextElementSibling : ui.tabStrip.firstElementChild;
    if (element !== expectedNext) {
      if (previousElement) {
        previousElement.after(element);
      } else {
        ui.tabStrip.prepend(element);
      }
    }

    previousElement = element;
  }
}
```

### 3F. Tab Drag-to-Reorder

Users must be able to drag tabs to reorder them. This is table stakes — iTerm2, Warp, and Hyper all support it.

Implementation approach using pointer events:

```
1. pointerdown on a tab → record starting X, mark tab as "dragging"
2. pointermove → calculate deltaX, apply translateX to the dragged tab
   as a CSS transform (GPU-composited, no layout thrashing)
3. As the dragged tab crosses the midpoint of an adjacent tab, swap
   their positions in tabOrder[] and animate the displaced tab to its
   new slot using transform with var(--duration-normal) var(--ease-out)
4. pointerup → snap the dragged tab to its final position with a
   short spring animation, remove drag state
5. During drag, the dragged tab gets:
   - z-index: 10
   - box-shadow: var(--shadow-lg)
   - scale(1.02) for a "lifted" feel
   - cursor: grabbing
```

### 3G. Tab Overflow

When tabs exceed the visible width:

```css
/* Fade masks on overflow edges */
#tab-strip.overflow-left {
  mask-image: linear-gradient(to right, transparent 0, black 32px, black 100%);
}
#tab-strip.overflow-right {
  mask-image: linear-gradient(to left, transparent 0, black 32px, black 100%);
}
#tab-strip.overflow-left.overflow-right {
  mask-image: linear-gradient(
    to right,
    transparent 0, black 32px,
    black calc(100% - 32px), transparent 100%
  );
}
```

Toggle `.overflow-left` / `.overflow-right` classes based on `scrollLeft` vs `scrollWidth` in a scroll event listener (debounced at 16ms — one frame).

Dynamic tab width compression: as tab count grows, min-width shrinks:

```
1-5 tabs:   min-width 140px, max-width 220px
6-10 tabs:  min-width 100px, max-width 180px
11+ tabs:   min-width 80px,  max-width 140px
```

---

## 4. Settings Panel — Side Drawer with Live Preview

The current `<dialog>` modal is the weakest UI element. Replace it with a slide-in panel that keeps the terminal visible, so theme/font/opacity changes preview in real-time. Benchmark: Warp's settings are a full GUI with real-time preview. Tabby uses a non-modal settings view with visual controls.

### 4A. Panel Structure

```
Position:     right edge of window
Width:        380px
Background:   var(--panel-bg) with backdrop-filter: blur(24px)
Border-left:  1px solid var(--panel-border)
Box-shadow:   -8px 0 32px rgba(0, 0, 0, 0.3)
Z-index:      20 (above terminal, below command palette)
```

The panel pushes nothing — it overlays the terminal area. The terminal dims slightly behind it:

```css
#terminal-host::after {
  /* Scrim overlay when settings panel is open */
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.25);
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--duration-moderate) var(--ease-standard);
  z-index: 15;
}
#terminal-host.panel-open::after {
  opacity: 1;
}
```

### 4B. Panel Layout

```
┌─────────────────────────────────┐
│  ← Settings                 ✕  │  ← Header: 48px, back arrow + title + close
├─────────────────────────────────┤
│                                 │
│  APPEARANCE                     │  ← Section header: uppercase, --type-xs,
│  ───────────                    │     --tracking-wider, --color-text-muted
│                                 │
│  Theme                          │
│  ┌─────┐ ┌─────┐ ┌─────┐      │  ← Visual swatches, not a <select>
│  │Graph│ │Midnt│ │Solar│ ...   │     56x40px each, 4px radius, ring on select
│  └─────┘ └─────┘ └─────┘      │
│                                 │
│  Font family                    │
│  ┌─────────────────────────┐   │
│  │ SF Mono, JetBrains Mono │   │  ← Text input with monospace preview
│  └─────────────────────────┘   │
│                                 │
│  Font size           ◄ 14 ►    │  ← Stepper with - / + buttons and display
│  ──────────────────○────────   │  ← Range slider underneath
│                                 │
│  Line height         ◄ 1.35 ►  │
│  ──────────────────○────────   │
│                                 │
│  Background opacity  ◄ 0.92 ►  │
│  ──────────────────○────────   │  ← With live preview stripe
│                                 │
│  TERMINAL                       │
│  ───────────                    │
│                                 │
│  Cursor style                   │
│  ┌─▌─┐ ┌──┐ ┌──┐              │  ← Visual toggle: block/bar/underline
│  │blk│ │bar│ │und│              │     icons showing actual cursor shape
│  └───┘ └───┘ └───┘             │
│                                 │
│  ☑ Cursor blink                 │  ← Custom toggle switch, not native checkbox
│                                 │
│  Scrollback lines               │
│  ┌─────────────────────────┐   │
│  │ 20000                   │   │  ← Number input with formatted display
│  └─────────────────────────┘   │
│                                 │
│  PROFILES                       │
│  ───────────                    │
│                                 │
│  ┌─────────────────────────┐   │
│  │ 🐚 Default Shell       ✎│   │  ← Profile cards
│  │ /bin/zsh · ~            │   │
│  └─────────────────────────┘   │
│  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐   │
│  │       + Add profile     │   │  ← Dashed border "add" card
│  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘   │
│                                 │
│  KEYBINDINGS                    │  ← Future section placeholder
│  ───────────                    │
│  (coming soon)                  │
│                                 │
└─────────────────────────────────┘
```

### 4C. Theme Swatches

Each swatch is a miniature rendering of the theme's palette — 5 color bars stacked horizontally showing the background, foreground, accent, and two ANSI colors:

```css
.theme-swatch {
  width: 56px;
  height: 40px;
  border-radius: var(--radius-sm);
  border: 2px solid transparent;
  cursor: pointer;
  overflow: hidden;
  transition: border-color var(--duration-fast) var(--ease-standard),
              transform var(--duration-fast) var(--ease-spring);
}
.theme-swatch:hover {
  transform: scale(1.05);
}
.theme-swatch.selected {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 2px var(--color-focus-ring);
}
```

Inside each swatch, render 5 horizontal stripes using the theme's actual colors — this gives users an instant visual preview without needing to apply the theme.

### 4D. Custom Toggle Switch

Replace native checkboxes with a macOS-style toggle:

```css
.toggle-switch {
  width: 36px;
  height: 20px;
  border-radius: var(--radius-full);
  background: var(--primitive-gray-600);
  position: relative;
  cursor: pointer;
  transition: background var(--duration-normal) var(--ease-standard);
}
.toggle-switch.on {
  background: var(--color-accent);
}
.toggle-switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: white;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  transition: transform var(--duration-normal) var(--ease-spring);
}
.toggle-switch.on::after {
  transform: translateX(16px);
}
```

### 4E. Range Sliders

Custom-styled range inputs with a filled track and accent-colored thumb:

```css
.range-slider {
  -webkit-appearance: none;
  width: 100%;
  height: 4px;
  border-radius: 2px;
  background: linear-gradient(
    to right,
    var(--color-accent) 0%,
    var(--color-accent) var(--fill-percent),
    var(--primitive-gray-600) var(--fill-percent),
    var(--primitive-gray-600) 100%
  );
  outline: none;
}
.range-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--color-accent);
  box-shadow: 0 0 0 3px rgba(84, 210, 161, 0.2);
  cursor: pointer;
  transition: box-shadow var(--duration-fast) var(--ease-standard);
}
.range-slider::-webkit-slider-thumb:hover {
  box-shadow: 0 0 0 6px rgba(84, 210, 161, 0.2);
}
```

The `--fill-percent` is set inline via JS as the slider moves, creating a real-time filled track effect.

### 4F. Live Preview

Settings changes apply to the terminal **instantly** as the user adjusts them, before they hit "Save." This is critical for the premium feel — you see the font size change as you drag the slider, not after you click a button.

Implementation: on every `input` event from a settings control, apply the change to the active tab's terminal immediately. Only persist to disk on "Save." On "Cancel," revert to the stored settings.

---

## 5. Full-UI Theming

### 5A. Theme Application Model

**Current gap:** Themes only affect xterm.js ANSI colors via `themeMap` in `main.ts`. The window chrome is permanently dark.

**New model:** Each theme provides two datasets:

```typescript
interface FullTheme {
  // Terminal ANSI palette (existing)
  terminal: ITerminalOptions['theme'];

  // UI chrome tokens (new) — overrides semantic tokens
  chrome: {
    bgBase: string;
    bgSurface: string;
    bgElevated: string;
    bgOverlay: string;
    borderDefault: string;
    borderSubtle: string;
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    accent: string;
    accentHover: string;
    accentMuted: string;
    danger: string;
    // ... complete set matching semantic tokens
  };

  // Window-level properties
  electronBgColor: string;    // BrowserWindow backgroundColor
  vibrancy?: string;          // macOS vibrancy type, if any
}
```

When the theme changes, apply the chrome tokens by setting CSS variables on `document.documentElement`:

```typescript
function applyThemeChrome(theme: FullTheme): void {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme.chrome)) {
    root.style.setProperty(`--color-${camelToKebab(key)}`, value);
  }
}
```

Also add a `data-theme` attribute to `<html>` for any theme-specific CSS overrides:

```html
<html data-theme="paper" data-appearance="light">
```

### 5B. Paper (Light) Theme — Full Implementation

The Paper theme must produce a **fully light** UI. This is the acid test for the theming system.

```typescript
paper: {
  terminal: { /* existing paper ANSI palette */ },
  chrome: {
    bgBase:        '#f0ede4',
    bgSurface:     '#f6f3ea',
    bgElevated:    '#ffffff',
    bgOverlay:     'rgba(246, 243, 234, 0.97)',
    borderDefault: '#d4cfc3',
    borderSubtle:  '#e2ddd2',
    textPrimary:   '#2d2b28',
    textSecondary: '#5c5a54',
    textMuted:     '#8a867c',
    accent:        '#3e8558',
    accentHover:   '#4a9d68',
    accentMuted:   '#d4e8db',
    danger:        '#b5434a',
  },
  electronBgColor: '#f0ede4',
}
```

**Light theme shadows flip to lighter tones:**

```css
[data-appearance="light"] {
  --shadow-sm:    0 1px 2px rgba(0, 0, 0, 0.06);
  --shadow-md:    0 4px 12px rgba(0, 0, 0, 0.08);
  --shadow-lg:    0 8px 32px rgba(0, 0, 0, 0.12);
  --shadow-inset: inset 0 1px 0 rgba(255, 255, 255, 0.6);
}
```

### 5C. New Themes (3 additions)

1. **Aurora** — Signature theme. Deep navy base (#0a0e1a) with a teal-to-violet gradient accent system. The accent color isn't a single value but a CSS gradient used on the active tab indicator, the settings panel header, and the command palette border. This is the "flex" theme — the one people screenshot.

2. **Noir** — High contrast. True black base (#000000), pure white text (#ffffff), bright neon accent (#00ff88). Designed for accessibility and outdoor use. All borders are 1px solid #333. No gradients, no blur, no translucency. Pure function.

3. **Fog** — Muted monochrome. Warm gray base (#1c1b1f), desaturated lavender text (#c8c3d4), muted purple accent (#8b7bb5). Everything feels soft and quiet. Ideal for night coding sessions.

### 5D. System Appearance Following

```typescript
// In main.ts, listen for macOS appearance changes:
import { nativeTheme } from 'electron';

nativeTheme.on('updated', () => {
  const isDark = nativeTheme.shouldUseDarkColors;
  mainWindow?.webContents.send('system:appearance-changed', isDark);
});
```

Add a "System" option in the theme selector that automatically picks the user's preferred dark/light theme based on macOS appearance.

---

## 6. Status Bar — Information-Rich, Interactive

Benchmark: VS Code's status bar is the gold standard — segmented, interactive, color-coded. Warp's status shows context-aware information. iTerm2 shows per-pane status.

### 6A. Segmented Layout

Replace the two plain spans with structured segments:

```
┌──────────────────────────────────────────────────────────────┐
│ 🐚 zsh │ 📂 ~/projects/local-terminal │ ⎇ main │  2 tabs │ Graphite │
└──────────────────────────────────────────────────────────────┘
  └─ shell  └─ cwd (truncated)             └─ git   └─ count  └─ theme
```

Each segment is a clickable `<button>` styled as inline text:

```css
.status-segment {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 0 var(--space-2);
  height: 100%;
  border: none;
  background: transparent;
  color: var(--statusbar-fg);
  font-size: var(--type-sm);
  font-family: var(--font-ui);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: background var(--duration-fast) var(--ease-standard),
              color var(--duration-fast) var(--ease-standard);
}
.status-segment:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--color-text-primary);
}
```

Segment actions:
- **Shell segment:** click opens profile switcher dropdown
- **CWD segment:** click copies path to clipboard (with toast confirmation)
- **Git segment:** shows branch name via IPC to main process (run `git rev-parse --abbrev-ref HEAD` in the session's cwd)
- **Tab count:** click does nothing (informational)
- **Theme segment:** click cycles to next theme

### 6B. Git Branch Detection

New IPC handler in main process:

```typescript
ipcMain.handle('git:branch', async (_, cwd: string) => {
  try {
    const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd });
    return stdout.trim();
  } catch {
    return null; // not a git repo
  }
});
```

Poll every 5 seconds for the active tab's cwd, or re-fetch on tab switch.

### 6C. Notification Toasts

Toasts appear above the status bar, anchored to the bottom-right corner:

```css
.toast-container {
  position: fixed;
  bottom: 36px;   /* above status bar */
  right: 12px;
  display: flex;
  flex-direction: column-reverse;
  gap: var(--space-2);
  z-index: 50;
  pointer-events: none;
}

.toast {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--toast-bg);
  border: 1px solid var(--toast-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  font-size: var(--type-sm);
  color: var(--color-text-primary);
  max-width: 320px;
  backdrop-filter: blur(16px);
}

.toast.error {
  border-left: 3px solid var(--color-danger);
}
.toast.success {
  border-left: 3px solid var(--color-success);
}
.toast.info {
  border-left: 3px solid var(--color-info);
}
```

Toast API:

```typescript
function showToast(message: string, type: 'info' | 'success' | 'error' = 'info', duration = 3000): void {
  // Create element, animate in, auto-dismiss after duration
  // Error toasts persist until clicked
}
```

---

## 7. Command Palette

Benchmark: Warp's Cmd+P, VS Code's Cmd+Shift+P, iTerm2's toolbox. This is the single most impactful new component for discoverability and power-user workflow.

### 7A. Structure & Appearance

```
┌────────────────────────────────────────────────────┐
│  🔍 Type a command...                              │
├────────────────────────────────────────────────────┤
│  ▸ New Tab                                  ⌘T     │  ← highlighted (active)
│    Close Tab                                ⌘W     │
│    Clear Terminal                            ⌘K     │
│    Open Settings                             ⌘,     │
│    Toggle Theme                                     │
│    Switch to Tab 1                           ⌘1     │
│    Switch to Tab 2                           ⌘2     │
│    Find in Terminal                          ⌘F     │
│    Reset Font Size                           ⌘0     │
│    Increase Font Size                        ⌘=     │
│    Decrease Font Size                        ⌘-     │
└────────────────────────────────────────────────────┘
```

```css
.command-palette {
  position: fixed;
  top: 20%;
  left: 50%;
  transform: translateX(-50%);
  width: min(520px, 85vw);
  max-height: 420px;
  background: var(--palette-bg);
  border: 1px solid var(--palette-border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
  backdrop-filter: blur(24px);
  z-index: 100;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.palette-input {
  padding: var(--space-3) var(--space-4);
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--color-border-subtle);
  color: var(--color-text-primary);
  font-size: var(--type-md);
  font-family: var(--font-ui);
  outline: none;
}

.palette-results {
  overflow-y: auto;
  flex: 1;
  padding: var(--space-1) 0;
}

.palette-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-4);
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-standard);
}

.palette-item.active {
  background: var(--palette-item-active);
}

.palette-item:hover {
  background: var(--palette-item-hover);
}

.palette-shortcut {
  font-size: var(--type-xs);
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  letter-spacing: var(--tracking-wide);
}
```

### 7B. Fuzzy Matching

Implement a simple fuzzy matcher — no library needed for this scale:

```typescript
function fuzzyMatch(query: string, text: string): { match: boolean; score: number } {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let qi = 0;
  let score = 0;
  let prevMatch = -1;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += (ti === prevMatch + 1) ? 10 : 1;  // consecutive bonus
      if (ti === 0 || t[ti - 1] === ' ') score += 5; // word start bonus
      prevMatch = ti;
      qi++;
    }
  }

  return { match: qi === q.length, score };
}
```

### 7C. Backdrop Scrim

When the command palette is open, the rest of the app gets a subtle dark overlay:

```css
.palette-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 99;
  backdrop-filter: blur(2px);
}
```

---

## 8. Search Bar Redesign

### 8A. Inline Search Bar

Replace the floating overlay with a bar that slides down from the topbar:

```css
.search-bar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-3);
  height: 0;
  overflow: hidden;
  background: var(--color-bg-elevated);
  border-bottom: 1px solid var(--color-border-subtle);
  transition: height var(--duration-moderate) var(--ease-out),
              padding var(--duration-moderate) var(--ease-out);
}

.search-bar.open {
  height: 40px;
  padding: var(--space-2) var(--space-3);
}
```

### 8B. Match Counter

```
┌──────────────────────────────────────────────────────┐
│ 🔍 │ search query here        │ 3 of 17 │ Aa │.*│ ← ↑ ↓ ✕ │
└──────────────────────────────────────────────────────┘
       input field                 count    case regex  nav close
```

The match counter updates in real-time as the user types. Format: `{current} of {total}` or `No results` when empty.

### 8C. Toggle Buttons

Case-sensitive (`Aa`) and regex (`.*`) toggles are small pill buttons:

```css
.search-toggle {
  padding: 2px 8px;
  border-radius: var(--radius-full);
  border: 1px solid var(--color-border-default);
  background: transparent;
  color: var(--color-text-muted);
  font-size: var(--type-xs);
  font-family: var(--font-mono);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-standard);
}
.search-toggle.active {
  background: var(--color-accent-muted);
  border-color: var(--color-accent);
  color: var(--color-accent);
}
```

---

## 9. Window Chrome & Vibrancy

### 9A. macOS Native Vibrancy

In `main.ts`, conditionally enable vibrancy:

```typescript
const window = new BrowserWindow({
  // ... existing options
  transparent: true,
  vibrancy: settings.vibrancy ? 'under-window' : undefined,
  visualEffectState: 'active',
  backgroundColor: settings.vibrancy ? '#00000000' : theme.electronBgColor,
});
```

When vibrancy is on, the app background becomes transparent and macOS renders its native blur effect behind it. The CSS body background should become semi-transparent to let the vibrancy show through:

```css
[data-vibrancy="true"] body {
  background: rgba(15, 18, 24, 0.75);
}
[data-vibrancy="true"] #topbar {
  background: rgba(26, 31, 43, 0.6);
}
[data-vibrancy="true"] #statusbar {
  background: rgba(19, 23, 34, 0.6);
}
```

This creates the same translucent effect as Tabby and native macOS apps like Terminal.app. Add a "Vibrancy" toggle in the settings panel.

### 9B. Window Gradient Background

When vibrancy is off, the current radial gradient background is good but can be enhanced. Make it theme-aware:

```css
body {
  background:
    radial-gradient(ellipse at 15% -5%, var(--color-bg-elevated) 0%, transparent 40%),
    radial-gradient(ellipse at 95% 5%, rgba(84, 210, 161, 0.03) 0%, transparent 35%),
    var(--color-bg-base);
}
```

This adds a very subtle accent color glow in the top-right corner — enough to feel alive without being distracting. Each theme can override these gradient colors.

---

## 10. Icon System

### 10A. SVG Icon Registry

Replace all Unicode glyphs with crisp SVG icons. Create `src/renderer/icons.ts`:

```typescript
const ICONS = {
  plus:        '<svg viewBox="0 0 16 16" ...><path d="M8 2v12M2 8h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  close:       '<svg viewBox="0 0 16 16" ...><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  gear:        '<svg viewBox="0 0 16 16" ...><!-- gear icon --></svg>',
  search:      '<svg viewBox="0 0 16 16" ...><!-- magnifying glass --></svg>',
  chevronUp:   '<svg viewBox="0 0 16 16" ...><!-- up chevron --></svg>',
  chevronDown: '<svg viewBox="0 0 16 16" ...><!-- down chevron --></svg>',
  terminal:    '<svg viewBox="0 0 16 16" ...><!-- terminal prompt --></svg>',
  gitBranch:   '<svg viewBox="0 0 16 16" ...><!-- git branch --></svg>',
  folder:      '<svg viewBox="0 0 16 16" ...><!-- folder --></svg>',
  copy:        '<svg viewBox="0 0 16 16" ...><!-- clipboard --></svg>',
  check:       '<svg viewBox="0 0 16 16" ...><!-- checkmark --></svg>',
  warning:     '<svg viewBox="0 0 16 16" ...><!-- warning triangle --></svg>',
  palette:     '<svg viewBox="0 0 16 16" ...><!-- color palette --></svg>',
  arrowLeft:   '<svg viewBox="0 0 16 16" ...><!-- left arrow --></svg>',
  dot:         '<svg viewBox="0 0 8 8" ...><circle cx="4" cy="4" r="3" fill="currentColor"/></svg>',
} as const;

export function icon(name: keyof typeof ICONS, size = 16): string {
  return `<span class="icon" style="width:${size}px;height:${size}px" aria-hidden="true">${ICONS[name]}</span>`;
}
```

Icon styling:

```css
.icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: currentColor;
}
.icon svg {
  width: 100%;
  height: 100%;
}
```

Design the icons in a consistent stroke style: 1.5px stroke weight, round caps and joins, 16×16 viewBox. The visual language should feel close to SF Symbols or Lucide — clean, geometric, legible at small sizes.

---

## 11. Focus & Accessibility

### 11A. Focus Rings

Every interactive element must show a visible focus ring when navigated via keyboard:

```css
:focus-visible {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 2px;
  border-radius: inherit;
}

/* Remove default outlines — we're replacing them */
:focus:not(:focus-visible) {
  outline: none;
}
```

### 11B. ARIA Enhancements

```html
<!-- Tab strip -->
<div role="tablist" aria-label="Terminal tabs" aria-orientation="horizontal">
  <button role="tab" aria-selected="true" aria-controls="panel-{id}">...</button>
</div>

<!-- Terminal pane -->
<div role="tabpanel" id="panel-{id}" aria-labelledby="tab-{id}">...</div>

<!-- Command palette -->
<div role="combobox" aria-expanded="true" aria-haspopup="listbox">
  <input role="searchbox" aria-autocomplete="list" aria-controls="palette-results" />
  <ul role="listbox" id="palette-results">
    <li role="option" aria-selected="true">...</li>
  </ul>
</div>

<!-- Toast announcements -->
<div aria-live="polite" aria-atomic="true" class="sr-only" id="toast-announcer"></div>
```

### 11C. Contrast Requirements

All text/background combinations must pass WCAG AA (4.5:1 for normal text, 3:1 for large text). The Noir high-contrast theme must pass AAA (7:1).

Specific checks needed:
- `--color-text-muted` on `--color-bg-surface` → currently #8c95ab on #111317 = ~5.2:1 ✓
- `--color-text-muted` on `--color-bg-elevated` → verify for each theme
- `--color-accent` on `--color-bg-base` → #54d2a1 on #0b0d12 = ~8.5:1 ✓
- Paper theme: all dark text on light backgrounds must be verified

### 11D. Reduced Motion

Already covered in section 2B. The `prefers-reduced-motion` media query sets all durations to near-zero. Additionally, disable:
- Tab activity pulse animation
- Toast slide-in (show instantly)
- Command palette scale animation
- Cursor blink (respect user preference)

---

## 12. Micro-Interactions & Details

These are the 1% details that separate good from exceptional.

### 12A. Button Press Feedback

Every clickable element gets a subtle scale-down on `:active`:

```css
.icon-button:active,
.tab:active,
.status-segment:active {
  transform: scale(0.97);
  transition-duration: 50ms;
}
```

### 12B. Input Focus Glow

When a text input receives focus, add a subtle glow:

```css
input:focus, select:focus {
  border-color: var(--input-border-focus);
  box-shadow: 0 0 0 3px rgba(84, 210, 161, 0.12);
  transition: border-color var(--duration-fast) var(--ease-standard),
              box-shadow var(--duration-fast) var(--ease-standard);
}
```

### 12C. Cursor Shimmer on Active Tab Indicator

The 2px accent bar at the bottom of the active tab can have a very subtle shimmer:

```css
@keyframes indicator-shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
.tab.active::after {
  background: linear-gradient(
    90deg,
    var(--color-accent) 0%,
    var(--color-accent-hover) 50%,
    var(--color-accent) 100%
  );
  background-size: 200% 100%;
  animation: indicator-shimmer 3s linear infinite;
}
```

This is extremely subtle — barely perceptible — but it makes the active tab feel alive.

### 12D. Smooth Font Size Changes

When the user presses Cmd+= / Cmd+-, the terminal font size change should feel smooth, not jarring. Wrap the xterm container in a CSS transition:

```css
.terminal-pane {
  transition: opacity var(--duration-normal) var(--ease-standard);
  /* Font size changes trigger a brief opacity dip */
}
.terminal-pane.resizing {
  opacity: 0.85;
  transition: opacity 50ms var(--ease-standard);
}
```

After the font size is applied and the terminal re-fits, remove the `.resizing` class to fade back to full opacity.

### 12E. Settings Panel Open/Close Gesture

The settings panel close can be triggered by:
1. Clicking the ✕ button
2. Pressing Escape
3. Clicking outside the panel (on the scrim)
4. Swiping right on trackpad (stretch goal — would require pointer event tracking)

### 12F. Tab Title Truncation

Long tab titles get a smooth CSS fade instead of hard ellipsis:

```css
.tab-title {
  mask-image: linear-gradient(to right, black calc(100% - 24px), transparent 100%);
  /* Only applied when text overflows — check via JS */
}
```

This looks cleaner than `text-overflow: ellipsis` because it fades rather than clips.

---

## Implementation Sequence

Each phase builds on the previous. Do not skip ahead — tokens must exist before themes, themes before animations.

| Step | Work Item | Est. Effort | Dependencies |
|------|-----------|-------------|--------------|
| 1 | Design token system (tokens.css, type scale, spacing scale, radii, shadows) | Medium | None |
| 2 | Motion token system (durations, easings, reduced-motion) | Small | Step 1 |
| 3 | Refactor styles.css to use tokens (replace all hardcoded values) | Medium | Steps 1-2 |
| 4 | Full-UI theme data structures (FullTheme interface, chrome tokens per theme) | Medium | Step 3 |
| 5 | Theme application logic (CSS variable injection, data-theme attribute) | Small | Step 4 |
| 6 | Paper light theme + Noir + Aurora + Fog | Medium | Steps 4-5 |
| 7 | SVG icon system (icons.ts, replace all Unicode glyphs) | Small | None (parallel) |
| 8 | Tab bar DOM reconciliation refactor | Large | Step 3 |
| 9 | Tab visual overhaul (active indicator, hover states, close button, activity dot) | Medium | Steps 3, 8 |
| 10 | Tab animations (enter, exit, crossfade) | Medium | Steps 2, 8 |
| 11 | Tab drag-to-reorder | Medium | Steps 8-10 |
| 12 | Tab overflow (fade masks, dynamic widths) | Small | Step 8 |
| 13 | Status bar segments + interactive | Medium | Steps 3, 7 |
| 14 | Git branch detection IPC | Small | Step 13 |
| 15 | Toast notification system | Medium | Steps 2, 3 |
| 16 | Settings side panel (layout, slide animation, scrim) | Large | Steps 2, 3, 7 |
| 17 | Rich settings controls (swatches, toggles, sliders, profile cards) | Large | Step 16 |
| 18 | Live settings preview | Medium | Step 17 |
| 19 | Search bar redesign (inline bar, match count, toggle pills) | Medium | Steps 2, 3 |
| 20 | Command palette (fuzzy match, ARIA, animations) | Large | Steps 2, 3, 7 |
| 21 | Window vibrancy integration | Small | Step 5 |
| 22 | Accessibility pass (focus rings, ARIA audit, contrast verification) | Medium | All above |
| 23 | Micro-interactions pass (button press, input glow, shimmer, font zoom) | Small | All above |
| 24 | Cross-theme QA (verify every component looks correct in all 7 themes) | Medium | All above |

---

## Files Affected

| File | Changes |
|------|---------|
| **New: `src/renderer/tokens.css`** | All design tokens: primitives, semantics, components, typography, spacing, radii, shadows, motion |
| **New: `src/renderer/icons.ts`** | SVG icon registry with `icon()` helper function |
| **New: `src/renderer/command-palette.ts`** | Command palette component: fuzzy search, keyboard nav, action registry |
| **New: `src/renderer/toast.ts`** | Toast notification system: create, animate, auto-dismiss, announce |
| **New: `src/renderer/settings-panel.ts`** | Settings side panel: slide animation, section rendering, live preview, rich controls |
| **New: `src/renderer/themes.ts`** | Full theme definitions (terminal + chrome), theme application logic, system appearance listener |
| `src/renderer/styles.css` | Complete rewrite — all values replaced with tokens, new component styles, animations, responsive |
| `src/renderer/index.html` | New DOM: settings panel container, command palette, toast container, restructured topbar, search bar, status bar segments |
| `src/renderer/main.ts` | Tab DOM reconciliation, drag-reorder, command palette keybinding, toast calls, settings panel toggle, theme class management, status bar interactivity |
| `src/shared/types.ts` | `FullTheme` interface, expanded `ThemeName` union (add aurora/noir/fog), `CommandAction` type, toast types, `AppSettings` additions (vibrancy toggle, appearance preference) |
| `src/main/main.ts` | Vibrancy window option, dynamic backgroundColor per theme, system appearance IPC, git branch IPC handler |
| `src/main/settings.ts` | Validate new theme names, vibrancy setting, appearance preference, custom theme storage |

---

## Non-Goals for Phase 2

Explicitly deferred to maintain design focus:

- Split panes / tiling layout (architectural, not design)
- Plugin / extension system
- SSH / remote sessions
- Shell integration (OSC sequences, command completion)
- Multi-window support
- Auto-update mechanism
- Inline image rendering (Sixel/iTerm2 protocol)
- Session recording / replay

---

## Quality Bar

Before Phase 2 is considered complete, every one of these must be true:

1. **No instant state changes** — every visual transition uses the motion system. Toggling between tabs, opening settings, hovering a button — all animated.
2. **Full-UI theming** — switching to Paper produces a fully light app. Switching to Aurora produces a cohesive dark navy + gradient app. No dark chrome leaking into light themes.
3. **60fps minimum** — every animation, every scroll, every drag interaction must hit 60fps on a 2020 MacBook Air. Profile with Chrome DevTools Performance tab.
4. **Zero layout shifts** — no element should jump or reflow unexpectedly. Tab animations use `transform` and `opacity` (GPU-composited), not `width` or `height` where avoidable.
5. **Pixel-perfect at 2x** — all icons, borders, and shadows must look crisp on Retina displays. No half-pixel blurring.
6. **WCAG AA contrast** — every text/background pair verified. Noir theme passes AAA.
7. **Keyboard navigable** — every action reachable without a mouse. Focus rings visible. Command palette provides universal access.
8. **Reduced motion respected** — all animations disabled cleanly. App remains fully functional and visually coherent without motion.

*This document is the implementation contract. Every CSS value, every animation curve, every pixel dimension specified here is the target. The goal is an app that looks and feels like it was designed by a world-class product team — because that is what users of Warp, Kitty, and iTerm2 expect from any terminal they consider switching to.*
