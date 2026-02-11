import { icon } from './icons';

export type ToastTone = 'info' | 'success' | 'error';

export interface ToastManager {
  show: (message: string, tone?: ToastTone, durationMs?: number) => void;
}

export function createToastManager(container: HTMLElement, announcer: HTMLElement): ToastManager {
  let sequence = 0;

  function dismiss(toast: HTMLElement): void {
    if (toast.dataset.closing === 'true') {
      return;
    }

    toast.dataset.closing = 'true';
    toast.classList.remove('open');
    toast.classList.add('closing');

    const remove = () => {
      if (toast.parentElement) {
        toast.remove();
      }
    };

    toast.addEventListener('transitionend', remove, { once: true });
    setTimeout(remove, 220);
  }

  return {
    show(message: string, tone: ToastTone = 'info', durationMs = 3000): void {
      sequence += 1;
      const toast = document.createElement('div');
      toast.className = `toast toast-${tone}`;
      toast.setAttribute('role', tone === 'error' ? 'alert' : 'status');
      toast.dataset.toastId = String(sequence);
      toast.tabIndex = 0;

      const body = document.createElement('span');
      body.className = 'toast-message';
      body.textContent = message;

      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'toast-close';
      close.setAttribute('aria-label', 'Dismiss notification');
      close.innerHTML = icon('close', 12);

      close.addEventListener('click', () => {
        dismiss(toast);
      });
      toast.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          dismiss(toast);
        }
      });

      toast.append(body, close);
      container.prepend(toast);
      announcer.textContent = message;

      requestAnimationFrame(() => {
        toast.classList.add('open');
      });

      if (durationMs > 0 && tone !== 'error') {
        setTimeout(() => dismiss(toast), durationMs);
      }
    }
  };
}
