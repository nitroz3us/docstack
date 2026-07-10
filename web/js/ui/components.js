import { formatFileSize } from '../utils/helpers.js';

const ICONS = {
    rotate: '<path d="M20 11a8 8 0 10-2.3 5.7"/><path d="M20 4v7h-7"/>',
    left: '<path d="M15 5l-7 7 7 7"/>',
    right: '<path d="M9 5l7 7-7 7"/>',
    up: '<path d="M5 15l7-7 7 7"/>',
    down: '<path d="M5 9l7 7 7-7"/>',
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

export function createLoadingDocumentCard(fileName) {
    const card = document.createElement('div');
    card.className = 'document-item document-item--loading';
    card.setAttribute('aria-label', `Loading ${fileName}`);
    card.innerHTML = '<div class="skeleton skeleton--preview"></div><div class="flex-1"><div class="skeleton skeleton--line"></div><div class="skeleton skeleton--line skeleton--short"></div></div>';
    return card;
}

export function createDocumentItem(file, index, totalFiles) {
    const item = document.createElement('article');
    item.className = 'document-item';
    item.dataset.fileId = file.id;

    const preview = document.createElement('div');
    preview.className = 'document-preview';
    const canvas = document.createElement('canvas');
    canvas.className = 'document-preview__canvas';
    canvas.setAttribute('aria-hidden', 'true');
    const spinner = document.createElement('span');
    spinner.className = 'thumbnail-spinner';
    spinner.setAttribute('aria-hidden', 'true');
    preview.append(canvas, spinner);

    const content = document.createElement('div');
    content.className = 'document-item__content';
    const name = document.createElement('h3');
    name.className = 'document-item__name';
    name.textContent = file.name;
    name.title = file.name;
    const meta = document.createElement('p');
    meta.className = 'document-item__meta';
    meta.textContent = `${file.pageCount} page${file.pageCount === 1 ? '' : 's'} · ${formatFileSize(file.size)}`;
    const actions = document.createElement('div');
    actions.className = 'document-item__actions';
    actions.append(
        createIconButton({ icon: 'up', label: `Move ${file.name} earlier`, action: 'move-file-up' }),
        createIconButton({ icon: 'down', label: `Move ${file.name} later`, action: 'move-file-down' }),
        createIconButton({ icon: 'delete', label: `Remove ${file.name}`, className: 'icon-button icon-button--danger', action: 'delete-file' })
    );
    actions.children[0].disabled = index === 0;
    actions.children[1].disabled = index === totalFiles - 1;

    content.append(name, meta, actions);
    item.append(preview, content);
    return item;
}

export function createPageTile(page, file, position, totalPages, selected) {
    const tile = document.createElement('article');
    tile.className = `page-tile${selected ? ' page-tile--selected' : ''}`;
    tile.dataset.pageId = page.id;
    tile.dataset.sourceFileId = page.sourceFileId;
    const dragHandle = document.createElement('span');
    dragHandle.className = 'page-drag-handle';
    dragHandle.setAttribute('aria-hidden', 'true');
    dragHandle.title = 'Drag to reorder';
    dragHandle.textContent = '⠿';

    const selection = document.createElement('label');
    selection.className = 'page-select';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = selected;
    checkbox.dataset.action = 'select-page';
    checkbox.setAttribute('aria-label', `Select page ${position + 1}, ${file.name} page ${page.sourcePageIndex + 1}`);
    const mark = document.createElement('span');
    mark.setAttribute('aria-hidden', 'true');
    selection.append(checkbox, mark);

    const canvasWrap = document.createElement('button');
    canvasWrap.type = 'button';
    canvasWrap.className = 'page-canvas-wrap';
    canvasWrap.dataset.action = 'preview';
    canvasWrap.setAttribute('aria-label', `Preview page ${position + 1}, ${file.name} page ${page.sourcePageIndex + 1}`);
    const canvas = document.createElement('canvas');
    canvas.className = 'page-canvas';
    canvas.dataset.rendered = 'false';
    const spinner = document.createElement('span');
    spinner.className = 'thumbnail-spinner';
    spinner.setAttribute('aria-hidden', 'true');
    canvasWrap.append(canvas, spinner);

    const info = document.createElement('div');
    info.className = 'page-tile__info';
    const order = document.createElement('strong');
    order.textContent = String(position + 1);
    const source = document.createElement('span');
    source.textContent = `${file.name} · p.${page.sourcePageIndex + 1}`;
    source.title = `${file.name}, source page ${page.sourcePageIndex + 1}`;
    const status = document.createElement('span');
    status.className = 'page-tile__status';
    const statusParts = [];
    if (page.rotation) statusParts.push(`${page.rotation}°`);
    if (page.redactions.length) statusParts.push(`${page.redactions.length} redaction${page.redactions.length === 1 ? '' : 's'}`);
    status.textContent = statusParts.join(' · ');
    info.append(order, source, status);

    const actions = document.createElement('div');
    actions.className = 'page-tile__actions';
    actions.append(
        createIconButton({ icon: 'rotate', label: `Rotate page ${position + 1}`, action: 'rotate-page' }),
        createIconButton({ icon: 'left', label: `Move page ${position + 1} earlier`, action: 'move-page-left' }),
        createIconButton({ icon: 'right', label: `Move page ${position + 1} later`, action: 'move-page-right' }),
        createIconButton({ icon: 'delete', label: `Delete page ${position + 1}`, className: 'icon-button icon-button--danger', action: 'delete-page' })
    );
    actions.children[1].disabled = position === 0;
    actions.children[2].disabled = position === totalPages - 1;

    tile.append(selection, dragHandle, canvasWrap, info, actions);
    return tile;
}
