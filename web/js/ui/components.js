const ICONS = {
    rotate: '<path d="M20 11a8 8 0 10-2.3 5.7"/><path d="M20 4v7h-7"/>',
    left: '<path d="M15 5l-7 7 7 7"/>',
    right: '<path d="M9 5l7 7-7 7"/>',
    more: '<circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
    expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    redact: '<path d="M4 5h16M4 19h9"/><rect x="4" y="9.5" width="16" height="5" rx="1" fill="currentColor" stroke="none"/>',
    delete: '<path fill="currentColor" stroke="none" d="M7 21q-.825 0-1.412-.587T5 19V6H4V4h5V3h6v1h5v2h-1v13q0 .825-.587 1.413T17 21zM17 6H7v13h10zM9 17h2V8H9zm4 0h2V8h-2zM7 6v13z"/>',
};

export function createIconButton({ icon, label, className = 'icon-button', action }) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.setAttribute('aria-label', label);
    button.dataset.action = action;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.innerHTML = ICONS[icon];
    button.appendChild(svg);
    return button;
}

function applyFileColor(element, file) {
    const color = file.isBlank ? 'var(--border-strong)' : `var(--file-color-${file.colorIndex ?? 0})`;
    element.style.setProperty('--file-color', color);
}

/** A pointer shortcut in the gap beside a tile; keyboard and touch use Insert in the selection bar. */
function createInsertButton(insertAt, side) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `page-tile__insert page-tile__insert--${side}`;
    button.dataset.insertAt = String(insertAt);
    button.tabIndex = -1;
    button.setAttribute('aria-hidden', 'true');
    button.title = 'Insert a PDF or blank page here';
    button.innerHTML = '<span><svg viewBox="0 0 24 24"><path d="M12 6v12M6 12h12"/></svg></span>';
    return button;
}

function createBadge(icon, text, label) {
    const badge = document.createElement('span');
    badge.className = 'page-badge';
    badge.title = label;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.innerHTML = ICONS[icon];
    badge.append(svg, text);
    return badge;
}

/**
 * Draw a page's redaction boxes over its thumbnail, in the same page-relative positions used for
 * export, so the thumbnail shows exactly what will be removed from the download.
 */
export function renderThumbnailRedactions(container, redactions) {
    container.querySelectorAll('.thumbnail-redaction').forEach(box => box.remove());
    redactions.forEach(rect => {
        const box = document.createElement('span');
        box.className = 'thumbnail-redaction';
        box.setAttribute('aria-hidden', 'true');
        box.style.left = `${rect.x * 100}%`;
        box.style.top = `${rect.y * 100}%`;
        box.style.width = `${rect.width * 100}%`;
        box.style.height = `${rect.height * 100}%`;
        container.appendChild(box);
    });
}

export function describePage(page, file, position) {
    const parts = [`Page ${position + 1}`, file.isBlank ? 'blank page' : `${file.name} page ${page.sourcePageIndex + 1}`];
    if (page.rotation) parts.push(`rotated ${page.rotation}°`);
    if (page.redactions.length) parts.push(`${page.redactions.length} redaction${page.redactions.length === 1 ? '' : 's'}`);
    return parts.join(', ');
}

/**
 * A page tile is the page itself: a thumbnail on the grid's background with its number underneath.
 * Selection, focus and actions are drawn around the thumbnail instead of in a card.
 */
export function createPageTile(page, file, position, selected, { isLastInRun = false } = {}) {
    const tile = document.createElement('article');
    tile.className = `page-tile${selected ? ' page-tile--selected' : ''}`;
    tile.dataset.pageId = page.id;
    tile.dataset.sourceFileId = page.sourceFileId;
    tile.dataset.rotation = String(page.rotation);
    tile.setAttribute('role', 'option');
    tile.setAttribute('aria-selected', String(selected));
    tile.setAttribute('aria-label', describePage(page, file, position));
    tile.tabIndex = -1;
    tile.title = file.isBlank ? 'Blank page' : `${file.name} · page ${page.sourcePageIndex + 1}`;
    applyFileColor(tile, file);

    const media = document.createElement('div');
    media.className = 'page-tile__media';

    const thumb = document.createElement('div');
    thumb.className = 'page-thumb';
    const canvas = document.createElement('canvas');
    canvas.className = 'page-canvas';
    canvas.dataset.rendered = 'false';
    // A tiny letter-shaped bitmap; CSS stretches it so the page has its final footprint before rendering.
    const sideways = page.rotation % 180 !== 0;
    canvas.width = sideways ? 22 : 17;
    canvas.height = sideways ? 17 : 22;
    const spinner = document.createElement('span');
    spinner.className = 'thumbnail-spinner';
    spinner.setAttribute('aria-hidden', 'true');
    const check = document.createElement('span');
    check.className = 'page-tile__check';
    check.setAttribute('aria-hidden', 'true');
    check.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
    const badges = document.createElement('span');
    badges.className = 'page-tile__badges';
    badges.setAttribute('aria-hidden', 'true');
    if (page.rotation) badges.append(createBadge('rotate', `${page.rotation}°`, `Rotated ${page.rotation}°`));
    if (page.redactions.length) {
        badges.append(createBadge('redact', String(page.redactions.length), `${page.redactions.length} redaction${page.redactions.length === 1 ? '' : 's'}`));
    }
    thumb.append(canvas, spinner, badges, check);
    renderThumbnailRedactions(thumb, page.redactions);

    // Pointer shortcuts only; keyboard and touch users get the same actions from the selection bar.
    const actions = document.createElement('div');
    actions.className = 'page-tile__actions';
    actions.setAttribute('aria-hidden', 'true');
    actions.append(
        createIconButton({ icon: 'rotate', label: 'Rotate', action: 'rotate-page' }),
        createIconButton({ icon: 'expand', label: 'Open', action: 'preview' }),
        createIconButton({ icon: 'delete', label: 'Delete', className: 'icon-button icon-button--danger', action: 'delete-page' })
    );
    [...actions.children].forEach(button => {
        button.tabIndex = -1;
        button.title = button.getAttribute('aria-label');
    });
    media.append(thumb, actions);

    const label = document.createElement('div');
    label.className = 'page-tile__label';
    const order = document.createElement('span');
    order.className = 'page-tile__order';
    order.textContent = String(position + 1);
    const dragHandle = document.createElement('span');
    dragHandle.className = 'page-drag-handle';
    dragHandle.setAttribute('aria-hidden', 'true');
    dragHandle.title = 'Drag to reorder';
    dragHandle.textContent = '⠿';
    label.append(order, dragHandle);

    tile.append(media, label, createInsertButton(position, 'before'));
    if (isLastInRun) tile.appendChild(createInsertButton(position + 1, 'after'));
    return tile;
}

/** "pages 1–3, 5" from 1-based source page numbers, in the order they appear. */
export function describePageRange(pageNumbers) {
    const parts = [];
    let start = pageNumbers[0];
    let previous = start;
    for (let index = 1; index <= pageNumbers.length; index++) {
        const current = pageNumbers[index];
        if (current === previous + 1) {
            previous = current;
            continue;
        }
        parts.push(start === previous ? `${start}` : `${start}–${previous}`);
        start = previous = current;
    }
    return `${pageNumbers.length === 1 ? 'page' : 'pages'} ${parts.join(', ')}`;
}

/**
 * A run is a stretch of consecutive pages from one file. Its label names the file and the
 * source pages, and its menu acts on just those pages.
 */
export function createPageRun(file, pageNumbers, startIndex) {
    const run = document.createElement('section');
    run.className = 'page-run';
    run.setAttribute('role', 'group');
    run.dataset.sourceFileId = file.id;
    run.dataset.startIndex = String(startIndex);
    run.dataset.count = String(pageNumbers.length);
    applyFileColor(run, file);
    // Blank pages all come from one generated page, so a page range would be meaningless.
    const range = file.isBlank ? '' : describePageRange(pageNumbers);
    const displayName = file.isBlank ? (pageNumbers.length === 1 ? 'Blank page' : `${pageNumbers.length} blank pages`) : file.name;
    run.setAttribute('aria-label', range ? `${displayName}, ${range}` : displayName);

    const header = document.createElement('header');
    header.className = 'page-run__header';
    const dot = document.createElement('span');
    dot.className = 'page-run__dot';
    dot.setAttribute('aria-hidden', 'true');
    const name = document.createElement('span');
    name.className = 'page-run__name';
    name.textContent = displayName;
    name.title = displayName;
    const rangeLabel = document.createElement('span');
    rangeLabel.className = 'page-run__range';
    rangeLabel.textContent = range;
    const menuButton = createIconButton({
        icon: 'more',
        label: `Actions for ${range ? `${displayName}, ${range}` : displayName}`,
        className: 'icon-button page-run__menu',
        action: 'run-menu',
    });
    menuButton.setAttribute('aria-haspopup', 'menu');
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.title = 'Actions for these pages';
    header.append(dot, name, rangeLabel, menuButton);

    const pages = document.createElement('div');
    pages.className = 'page-run__pages';
    run.append(header, pages);
    return run;
}
