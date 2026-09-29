/** Transient status messages with an optional single action (e.g. Undo). */

const DEFAULT_DURATION = 5000;
const MAX_VISIBLE = 3;
let region = null;

const TONE_ICONS = {
    info: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    error: '<path d="M12 8v5"/><path d="M12 16.5v.01"/><circle cx="12" cy="12" r="9"/>',
};

function dismiss(toast) {
    if (!toast.isConnected || toast.dataset.leaving) return;
    toast.dataset.leaving = 'true';
    window.clearTimeout(Number(toast.dataset.timer));
    toast.classList.add('toast--leaving');
    window.setTimeout(() => toast.remove(), 160);
}

function schedule(toast, duration) {
    toast.dataset.timer = String(window.setTimeout(() => dismiss(toast), duration));
}

/**
 * @param {string} message
 * @param {Object} [options]
 * @param {'info'|'error'} [options.tone]
 * @param {{label: string, onClick: () => void}} [options.action]
 * @param {number} [options.duration]
 */
export function showToast(message, { tone = 'info', action, duration } = {}) {
    if (!region) return null;
    const lifetime = duration ?? (tone === 'error' ? 8000 : DEFAULT_DURATION);

    const toast = document.createElement('div');
    toast.className = `toast toast--${tone}`;
    if (tone === 'error') toast.setAttribute('role', 'alert');

    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('aria-hidden', 'true');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.classList.add('toast__icon');
    icon.innerHTML = TONE_ICONS[tone] || TONE_ICONS.info;

    const text = document.createElement('span');
    text.className = 'toast__message';
    text.textContent = message;
    toast.append(icon, text);

    if (action) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'toast__action';
        button.textContent = action.label;
        button.addEventListener('click', () => {
            action.onClick();
            dismiss(toast);
        });
        toast.appendChild(button);
    }

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'toast__close';
    close.setAttribute('aria-label', 'Dismiss notification');
    close.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    close.addEventListener('click', () => dismiss(toast));
    toast.appendChild(close);

    // Pause while the pointer or keyboard focus is on the toast so actions stay reachable.
    toast.addEventListener('pointerenter', () => window.clearTimeout(Number(toast.dataset.timer)));
    toast.addEventListener('pointerleave', () => schedule(toast, 2000));
    toast.addEventListener('focusin', () => window.clearTimeout(Number(toast.dataset.timer)));
    toast.addEventListener('focusout', () => schedule(toast, 2000));

    region.appendChild(toast);
    const live = [...region.children].filter(item => !item.dataset.leaving);
    live.slice(0, Math.max(0, live.length - MAX_VISIBLE)).forEach(dismiss);
    schedule(toast, lifetime);
    return toast;
}

export function initToasts(element) {
    region = element;
}
