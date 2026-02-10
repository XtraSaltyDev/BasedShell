const ICONS = {
  plus: '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 3V13M3 8H13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  close:
    '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 4L12 12M12 4L4 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  gear:
    '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6.2 2.3h3.6l.5 1.4c.3.1.6.2.9.4L12.7 3l2.5 2.5-1.1 1.5c.2.3.3.6.4.9l1.4.5v3.6l-1.4.5c-.1.3-.2.6-.4.9l1.1 1.5-2.5 2.5-1.5-1.1c-.3.2-.6.3-.9.4l-.5 1.4H6.2l-.5-1.4c-.3-.1-.6-.2-.9-.4L3.3 15 0.8 12.5l1.1-1.5c-.2-.3-.3-.6-.4-.9L0 9.6V6l1.5-.5c.1-.3.2-.6.4-.9L0.8 3.1 3.3.6l1.5 1.1c.3-.2.6-.3.9-.4L6.2.9Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><circle cx="8" cy="8" r="2.2" stroke="currentColor" stroke-width="1.1"/></svg>',
  dot: '<svg viewBox="0 0 8 8" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="4" cy="4" r="3" fill="currentColor"/></svg>'
} as const;

export type IconName = keyof typeof ICONS;

export function icon(name: IconName, size = 16): string {
  return `<span class="icon" style="--icon-size:${size}px" aria-hidden="true">${ICONS[name]}</span>`;
}
