from datetime import datetime
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

root = Path('/Users/mjemion/Code/localTerminal')
out_path = root / 'output' / 'pdf' / 'BasedShell_Project_Overview.pdf'

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name='TitleLarge', parent=styles['Title'], fontName='Helvetica-Bold', fontSize=26, leading=30, spaceAfter=14))
styles.add(ParagraphStyle(name='Subtle', parent=styles['Normal'], fontName='Helvetica', fontSize=10, leading=14, textColor=colors.HexColor('#4B5563')))
styles.add(ParagraphStyle(name='H1', parent=styles['Heading1'], fontName='Helvetica-Bold', fontSize=18, leading=22, spaceBefore=8, spaceAfter=8))
styles.add(ParagraphStyle(name='H2', parent=styles['Heading2'], fontName='Helvetica-Bold', fontSize=13, leading=17, spaceBefore=6, spaceAfter=6))
styles.add(ParagraphStyle(name='Body', parent=styles['Normal'], fontName='Helvetica', fontSize=10.5, leading=15))
styles.add(ParagraphStyle(name='BodySmall', parent=styles['Normal'], fontName='Helvetica', fontSize=9.2, leading=13.2))
styles.add(ParagraphStyle(name='TableCell', parent=styles['Normal'], fontName='Helvetica', fontSize=8.4, leading=11.2))
styles.add(ParagraphStyle(name='TableHead', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=8.6, leading=11.0))
styles.add(ParagraphStyle(name='TableLabel', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=8.4, leading=11.2))


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont('Helvetica', 9)
    canvas.setFillColor(colors.HexColor('#6B7280'))
    canvas.drawString(doc.leftMargin, 0.45 * inch, 'BasedShell Project Overview')
    canvas.drawRightString(7.9 * inch, 0.45 * inch, f'Page {doc.page}')
    canvas.restoreState()


def p(text: str, style='TableCell'):
    return Paragraph(text, styles[style])


def make_table(rows, col_widths, first_col_bold=False):
    cooked = []
    for row_index, row in enumerate(rows):
        cooked_row = []
        for col_index, cell in enumerate(row):
            if row_index == 0:
                cooked_row.append(p(cell, 'TableHead'))
            elif first_col_bold and col_index == 0:
                cooked_row.append(p(cell, 'TableLabel'))
            else:
                cooked_row.append(p(cell, 'TableCell'))
        cooked.append(cooked_row)

    tbl = Table(cooked, colWidths=col_widths, repeatRows=1)
    tbl.setStyle(
        TableStyle([
            ('GRID', (0, 0), (-1, -1), 0.35, colors.HexColor('#D1D5DB')),
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#F3F4F6')),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 5),
            ('RIGHTPADDING', (0, 0), (-1, -1), 5),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ])
    )
    return tbl


doc = SimpleDocTemplate(
    str(out_path),
    pagesize=LETTER,
    topMargin=0.85 * inch,
    bottomMargin=0.75 * inch,
    leftMargin=0.75 * inch,
    rightMargin=0.75 * inch,
    title='BasedShell Project Overview',
    author='BasedShell Engineering',
)

story = []
generated = datetime.now().strftime('%Y-%m-%d %H:%M')

story.append(Paragraph('BasedShell Project Overview', styles['TitleLarge']))
story.append(Paragraph('Detailed technical and product summary generated from repository state on main.', styles['Subtle']))
story.append(Paragraph(f'Generated: {generated}', styles['Subtle']))
story.append(Spacer(1, 0.18 * inch))

snapshot_data = [
    ['Project', 'BasedShell'],
    ['Version', '1.0.0'],
    ['Platform Focus', 'macOS desktop terminal application'],
    ['Core Stack', 'Electron 31, node-pty 1.0, xterm.js 5.5, TypeScript, Vite'],
    ['Source Footprint', '20 source files, about 7,123 lines in src/'],
    ['Packaging', 'electron-builder targets: dmg, zip'],
    ['Primary Runtime Windows', 'Main terminal window + standalone settings window'],
]

story.append(make_table(snapshot_data, [1.8 * inch, 5.1 * inch], first_col_bold=True))

story.append(Spacer(1, 0.16 * inch))
story.append(Paragraph('Executive Summary', styles['H1']))
story.append(Paragraph(
    'BasedShell is a production-grade, keyboard-first terminal built as a native-feeling macOS app. The project has moved beyond a basic terminal container and now includes multi-tab orchestration, runtime Git telemetry, command palette workflows, inline search, toast notifications, persistent preferences, and a dedicated settings window with sectioned navigation. The current implementation emphasizes reliability and architectural guardrails, including DOM contract validation, typed cross-process APIs, settings schema versioning, and explicit theme metadata.',
    styles['Body']
))

story.append(Paragraph('Current Product Surface', styles['H2']))
items = [
    'Terminal sessions backed by node-pty with login-shell profile support.',
    'Multi-tab UX with activity states (active, unread output, exited) and keyboard shortcuts.',
    'Status HUD with shell, cwd, Git branch/dirty state, command context, tab count, and theme segment.',
    'Command palette with fuzzy matching, pinned actions, and recents.',
    'Standalone settings window with section-based panels and live preview.',
    'Theme system spanning terminal ANSI colors and UI chrome tokens, including Catppuccin flavors.',
]
story.append(ListFlowable([ListItem(Paragraph(i, styles['Body'])) for i in items], bulletType='bullet', start='-'))

story.append(PageBreak())

story.append(Paragraph('Architecture Overview', styles['H1']))
story.append(Paragraph('The application uses a three-layer Electron architecture with strict type sharing and focused responsibilities per layer.', styles['Body']))

arch_data = [
    ['Layer', 'Location', 'Primary Responsibilities'],
    ['Main Process', 'src/main/', 'Window lifecycle, IPC handlers, settings persistence, session manager orchestration, system appearance, Git status resolution, menu wiring'],
    ['Preload Bridge', 'src/preload/preload.ts', 'Context-isolated, typed API surface (invoke/send/subscribe) exposed as window.terminalAPI'],
    ['Renderer UIs', 'src/renderer/', 'Terminal UI, tabs, search, command palette, toasts, settings window, theme application'],
    ['Shared Contracts', 'src/shared/', 'Cross-process types, settings schema, theme metadata, appearance resolution'],
]
story.append(Spacer(1, 0.08 * inch))
story.append(make_table(arch_data, [1.2 * inch, 1.35 * inch, 4.35 * inch]))

story.append(Spacer(1, 0.12 * inch))
story.append(Paragraph('IPC Contract (Main Channels)', styles['H2']))
ipc_data = [
    ['Type', 'Channel', 'Purpose'],
    ['invoke', 'app:get-version, app:get-home-directory', 'Environment and app metadata'],
    ['invoke', 'system:get-appearance', 'Current OS dark/light state'],
    ['invoke', 'git:status', 'Repo root, branch, dirty flag for active cwd'],
    ['invoke', 'settings:get / settings:update', 'Read and persist typed application settings'],
    ['invoke', 'settings:open-window', 'Open or focus the standalone settings window'],
    ['invoke', 'terminal:create-session', 'Create PTY session from selected profile and cwd'],
    ['send', 'terminal:write / terminal:resize / terminal:close-session', 'Session IO and lifecycle control'],
    ['event', 'terminal:data / terminal:exit / terminal:context', 'PTY output, exit notifications, cwd/ssh context updates'],
    ['event', 'settings:changed / menu:action / system:appearance-changed', 'Cross-window sync and command dispatch'],
]
story.append(make_table(ipc_data, [0.75 * inch, 2.15 * inch, 4.0 * inch]))

story.append(Spacer(1, 0.12 * inch))
story.append(Paragraph('Session Management Notes', styles['H2']))
story.append(ListFlowable([
    ListItem(Paragraph('PTY sessions are created through node-pty with clamped cols/rows and validated cwd.', styles['Body'])),
    ListItem(Paragraph('Runtime environment is sanitized to remove npm-injected variables that can break shell behavior (notably npm_config_prefix leakage).', styles['Body'])),
    ListItem(Paragraph('On macOS, spawn-helper execute bit is proactively repaired to prevent posix_spawnp failures.', styles['Body'])),
    ListItem(Paragraph('Session context polling updates cwd and ssh host hints to keep tab titles and telemetry accurate.', styles['Body'])),
], bulletType='bullet', start='-'))

story.append(PageBreak())

story.append(Paragraph('Renderer and UX Capabilities', styles['H1']))

story.append(Paragraph('Main Terminal Window', styles['H2']))
story.append(ListFlowable([
    ListItem(Paragraph('Tab strip with overflow handling, density modes, enter/exit animations, unread and exited state indicators.', styles['Body'])),
    ListItem(Paragraph('Repository-aware tab labels using Git repo/branch context when available, with fallback path labels and SSH host prefixes.', styles['Body'])),
    ListItem(Paragraph('Status bar segments act as interactive controls with contextual tooltips and state coloring.', styles['Body'])),
    ListItem(Paragraph('Search UX supports case-sensitive and regex toggles, directional next/previous navigation, and result counters.', styles['Body'])),
    ListItem(Paragraph('Command palette supports fuzzy ranking, pinning, recents, and keyboard-centric action execution.', styles['Body'])),
    ListItem(Paragraph('Toast system provides non-blocking notifications and ARIA-compatible announcements.', styles['Body'])),
], bulletType='bullet', start='-'))

story.append(Paragraph('Standalone Settings Window', styles['H2']))
story.append(ListFlowable([
    ListItem(Paragraph('Dedicated BrowserWindow with hiddenInset title bar on macOS and titlebar-safe header spacing.', styles['Body'])),
    ListItem(Paragraph('Left-side section navigation where only one section panel is displayed at a time on the right.', styles['Body'])),
    ListItem(Paragraph('Live preview path applies theme and opacity before save; Cmd/Ctrl+S persists changes.', styles['Body'])),
    ListItem(Paragraph('Cross-window consistency via settings:changed events; main and settings windows stay synchronized.', styles['Body'])),
], bulletType='bullet', start='-'))

story.append(Paragraph('Theme and Appearance System', styles['H2']))
theme_data = [
    ['Category', 'Available Options'],
    ['Core Themes', 'graphite, midnight, solarized-dark, paper, aurora, noir, fog'],
    ['Catppuccin Flavors', 'catppuccin-latte, catppuccin-frappe, catppuccin-macchiato, catppuccin-mocha'],
    ['Meta Selection', 'system (maps by OS appearance through shared theme metadata)'],
    ['Appearance Preference', 'system, dark, light'],
    ['Vibrancy', 'Optional under-window vibrancy on macOS'],
]
story.append(make_table(theme_data, [1.6 * inch, 5.3 * inch], first_col_bold=True))

story.append(Spacer(1, 0.12 * inch))
story.append(Paragraph('Engineering Quality Guardrails', styles['H2']))
story.append(ListFlowable([
    ListItem(Paragraph('DOM contract check script validates required assertDom selectors against renderer HTML IDs to prevent mixed-state UI crashes.', styles['Body'])),
    ListItem(Paragraph('Settings schema includes an explicit schemaVersion and sanitization logic for bounds-safe numeric values and profile fallback behavior.', styles['Body'])),
    ListItem(Paragraph('Main process enforces single-instance lock and persists window state for reliable app relaunch behavior.', styles['Body'])),
    ListItem(Paragraph('Typed shared contracts reduce IPC drift between main, preload, and renderer layers.', styles['Body'])),
], bulletType='bullet', start='-'))

story.append(PageBreak())

story.append(Paragraph('Build, Packaging, and Operations', styles['H1']))
story.append(Paragraph('Development and release workflow is script-driven and optimized for local iteration.', styles['Body']))

build_data = [
    ['Command', 'Purpose'],
    ['npm run dev', 'Build main once, watch main process TS, run Vite dev server, and launch Electron with renderer URL'],
    ['npm run typecheck', 'Runs DOM contract check + TS noEmit for main and renderer configs'],
    ['npm run build', 'Clean + compile main + production bundle renderer'],
    ['npm run start', 'Build and launch packaged runtime locally'],
    ['npm run package:mac', 'Generate macOS distributables (dmg and zip) through electron-builder'],
]
story.append(Spacer(1, 0.08 * inch))
story.append(make_table(build_data, [1.45 * inch, 5.45 * inch], first_col_bold=True))

story.append(Spacer(1, 0.14 * inch))
story.append(Paragraph('Top Source Modules by Size', styles['H2']))
modules = [
    ['src/renderer/main.ts', '1,923', 'Primary terminal UX controller, tab lifecycle, search, status HUD, shortcuts'],
    ['src/renderer/styles.css', '1,088', 'Core main-window styling and theme-token-driven visual rules'],
    ['src/renderer/themes.ts', '830', 'Theme definitions and chrome token mapping including Catppuccin flavors'],
    ['src/renderer/command-palette.ts', '473', 'Action registry, fuzzy ranking, pins, recents, keyboard behavior'],
    ['src/main/session-manager.ts', '392', 'PTY spawn, IO routing, context polling, environment sanitation'],
    ['src/main/main.ts', '379', 'Window lifecycle, IPC registration, settings sync, OS appearance integration'],
    ['src/renderer/settings.ts', '351', 'Standalone settings window state, preview, persistence, nav section switching'],
]
mod_rows = [['File', 'LOC', 'Responsibility']] + modules
story.append(make_table(mod_rows, [2.25 * inch, 0.6 * inch, 4.05 * inch]))

story.append(Spacer(1, 0.12 * inch))
story.append(Paragraph('Recommended Next Milestones', styles['H2']))
story.append(ListFlowable([
    ListItem(Paragraph('Finalize and polish PR9 task presets plus smart history workflows in command palette.', styles['Body'])),
    ListItem(Paragraph('Execute PR10 release gate: accessibility pass, reduced-motion behavior validation, and cross-theme QA.', styles['Body'])),
    ListItem(Paragraph('Add automated renderer tests for critical window flows (settings save/reset, theme sync, tab lifecycle).', styles['Body'])),
    ListItem(Paragraph('Add a small docs page for IPC channel contracts and renderer lifecycle expectations for future contributors.', styles['Body'])),
], bulletType='bullet', start='-'))

story.append(Spacer(1, 0.22 * inch))
story.append(Paragraph('End of report.', styles['BodySmall']))

doc.build(story, onFirstPage=footer, onLaterPages=footer)
print(out_path)
