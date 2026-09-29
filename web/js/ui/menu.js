/** A small anchored action menu: arrow keys move, Escape or an outside click closes. */

let openMenu = null;

function menuItems(menu) {
    return [...menu.querySelectorAll('[role="menuitem"]:not(:disabled), .action-menu__panel[tabindex="-1"]')];
}

export function closeMenu({ restoreFocus = false } = {}) {
    if (!openMenu) return;
    const { menu, anchor } = openMenu;
    openMenu = null;
    menu.remove();
    anchor.setAttribute('aria-expanded', 'false');
    if (restoreFocus && anchor.isConnected) anchor.focus();
}

function handleKeydown(event) {
    if (!openMenu) return;
    const items = menuItems(openMenu.menu);
    const index = items.indexOf(document.activeElement);
    if (event.key === 'Escape' || event.key === 'Tab') {
        if (event.key === 'Escape') event.preventDefault();
        event.stopPropagation();
        closeMenu({ restoreFocus: event.key === 'Escape' });
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        event.stopPropagation();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        items[(index + step + items.length) % items.length]?.focus();
    } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        event.stopPropagation();
        (event.key === 'Home' ? items[0] : items.at(-1))?.focus();
    }
}

function handlePointerDown(event) {
    if (!openMenu) return;
    if (openMenu.menu.contains(event.target) || openMenu.anchor.contains(event.target)) return;
    closeMenu();
}

/**
 * @param {HTMLElement} anchor - the button that opened the menu
 * @param {Array<'separator'|{label: string, hint?: string, onSelect: () => void, danger?: boolean, disabled?: boolean}>} items
 * @param {{label?: string, align?: 'start'|'end'}} [options]
 */
export function showMenu(anchor, items, { label, align = 'end' } = {}) {
    const menu = document.createElement('div');
    menu.className = 'action-menu';
    menu.setAttribute('role', 'menu');
    if (label) menu.setAttribute('aria-label', label);

    items.forEach(item => {
        if (item === 'separator') {
            const separator = document.createElement('div');
            separator.className = 'action-menu__separator';
            separator.setAttribute('role', 'separator');
            menu.appendChild(separator);
            return;
        }
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `action-menu__item${item.danger ? ' action-menu__item--danger' : ''}`;
        button.setAttribute('role', 'menuitem');
        const text = document.createElement('span');
        text.textContent = item.label;
        button.appendChild(text);
        if (item.hint) {
            const hint = document.createElement('span');
            hint.className = 'action-menu__hint';
            hint.textContent = item.hint;
            button.appendChild(hint);
        }
        button.disabled = Boolean(item.disabled);
        button.addEventListener('click', () => {
            closeMenu({ restoreFocus: true });
            item.onSelect();
        });
        menu.appendChild(button);
    });

    present(anchor, menu, align);
}

/** A non-interactive explanation anchored to a button, dismissed like a menu. */
export function showInfoPopover(anchor, { title, paragraphs }) {
    const panel = document.createElement('div');
    panel.className = 'action-menu action-menu--info';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', title);
    const body = document.createElement('div');
    body.className = 'action-menu__panel';
    body.tabIndex = -1;
    const heading = document.createElement('strong');
    heading.textContent = title;
    body.appendChild(heading);
    paragraphs.forEach(text => {
        const paragraph = document.createElement('p');
        paragraph.textContent = text;
        body.appendChild(paragraph);
    });
    panel.appendChild(body);
    present(anchor, panel, 'end');
}

function present(anchor, menu, align) {
    const reopening = openMenu?.anchor === anchor;
    closeMenu();
    if (reopening) return;

    document.body.appendChild(menu);
    const rect = anchor.getBoundingClientRect();
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    const preferred = align === 'start' ? rect.left : rect.right - width;
    const left = Math.max(12, Math.min(preferred, window.innerWidth - width - 12));
    const below = rect.bottom + 6;
    const top = below + height > window.innerHeight - 12 ? Math.max(12, rect.top - height - 6) : below;
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    openMenu = { menu, anchor };
    anchor.setAttribute('aria-expanded', 'true');
    menuItems(menu)[0]?.focus();
}

export function initMenus() {
    document.addEventListener('keydown', handleKeydown, true);
    document.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('resize', () => closeMenu());
    document.addEventListener('scroll', () => closeMenu(), true);
}
