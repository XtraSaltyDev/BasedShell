import { BrowserWindow, Menu, shell } from 'electron';
import type { MenuAction } from '../shared/types';

function focusedWindow(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow();
}

function dispatch(action: MenuAction): void {
  const win = focusedWindow();
  if (!win) {
    return;
  }

  win.webContents.send('menu:action', action);
}

export function createAppMenu(): Menu {
  const isMac = process.platform === 'darwin';
  const separator: Electron.MenuItemConstructorOptions = { type: 'separator' };
  const roleItem = (
    role: NonNullable<Electron.MenuItemConstructorOptions['role']>
  ): Electron.MenuItemConstructorOptions => ({ role });

  const template: Electron.MenuItemConstructorOptions[] = [];

  if (isMac) {
    template.push({
      label: 'BasedShell',
      submenu: [
        roleItem('about'),
        separator,
        {
          label: 'Preferences…',
          accelerator: 'CmdOrCtrl+,',
          click: () => dispatch('settings')
        },
        separator,
        roleItem('services'),
        separator,
        roleItem('hide'),
        roleItem('hideOthers'),
        roleItem('unhide'),
        separator,
        roleItem('quit')
      ]
    });
  }

  template.push({
    label: 'File',
    submenu: [
      {
        label: 'New Tab',
        accelerator: 'CmdOrCtrl+T',
        click: () => dispatch('new-tab')
      },
      {
        label: 'Close Tab',
        accelerator: 'CmdOrCtrl+W',
        click: () => dispatch('close-tab')
      },
      separator,
      isMac ? roleItem('close') : roleItem('quit')
    ]
  });

  template.push({
    label: 'Edit',
    submenu: [
      roleItem('undo'),
      roleItem('redo'),
      separator,
      roleItem('cut'),
      roleItem('copy'),
      roleItem('paste'),
      roleItem('pasteAndMatchStyle'),
      roleItem('selectAll'),
      separator,
      {
        label: 'Find',
        accelerator: 'CmdOrCtrl+F',
        click: () => dispatch('search')
      },
      {
        label: 'Clear Terminal',
        accelerator: 'CmdOrCtrl+K',
        click: () => dispatch('clear-terminal')
      }
    ]
  });

  template.push({
    label: 'View',
    submenu: [
      {
        label: 'Next Tab',
        accelerator: 'Ctrl+Tab',
        click: () => dispatch('next-tab')
      },
      {
        label: 'Previous Tab',
        accelerator: 'Ctrl+Shift+Tab',
        click: () => dispatch('previous-tab')
      },
      separator,
      roleItem('resetZoom'),
      roleItem('zoomIn'),
      roleItem('zoomOut'),
      separator,
      roleItem('togglefullscreen'),
      roleItem('toggleDevTools')
    ]
  });

  template.push({
    label: 'Window',
    submenu: [
      roleItem('minimize'),
      roleItem('zoom'),
      ...(isMac ? [roleItem('front')] : [roleItem('close')])
    ]
  });

  template.push({
    role: 'help',
    submenu: [
      {
        label: 'Project Website',
        click: async () => {
          await shell.openExternal('https://xtermjs.org/');
        }
      }
    ]
  });

  return Menu.buildFromTemplate(template);
}
