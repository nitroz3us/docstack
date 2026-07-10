import * as state from './state.js';
import { sanitizeOutputName } from './utils/helpers.js';
import { handleFiles } from './handlers/upload.js';
import { mergePDFs } from './handlers/merge.js';
import {
    initViews,
    renderStateOnly,
    setDensity,
    setMobileView,
    showPreviewProgress,
} from './ui/views.js';
import {
    hideExportProgress,
    initModals,
    showEncryptionWarningModal,
    showExportProgress,
    showHelpModal,
    showPageLightbox,
    updateExportProgress,
} from './ui/modals.js';

const elementIds = [
    'landingView', 'workspace', 'dropZone', 'fileInput', 'browseBtn', 'addFilesBtn', 'emptyAddFilesBtn',
    'renderProgress', 'renderProgressText', 'renderProgressPercent', 'renderProgressBar',
    'showDocumentsBtn', 'showPagesBtn', 'documentsPanel', 'pagesPanel', 'documentList', 'documentCount',
    'pageGrid', 'pageCount', 'pagesEmptyState', 'selectionToolbar', 'selectionCount', 'selectAllBtn',
    'rotateSelectedBtn', 'deleteSelectedBtn', 'clearSelectionBtn',
    'densitySelect', 'exportBar', 'undoBtn', 'redoBtn', 'outputNameInput', 'exportPageCount', 'exportBtn',
    'helpBtn', 'helpModal', 'helpTitle', 'closeHelpModal',
    'pageLightbox', 'lightboxCanvas', 'lightboxContent', 'lightboxTitle', 'lightboxPosition', 'redactionCanvas',
    'redactModeBtn', 'clearRedactionsBtn', 'closeLightbox', 'prevPageBtn', 'nextPageBtn',
    'passwordModal', 'passwordTitle', 'passwordInput', 'passwordError', 'passwordModalFileName',
    'showPasswordCheckbox', 'closePasswordModal', 'cancelPasswordBtn', 'submitPasswordBtn',
    'encryptionWarningModal', 'encryptionWarningTitle', 'warningFileList', 'cancelWarningBtn', 'proceedWarningBtn',
    'redactionWarningModal', 'redactionWarningTitle', 'cancelRedactionBtn', 'proceedRedactionBtn',
    'exportProgressModal', 'exportProgressTitle', 'exportProgressText', 'exportProgressIndicator', 'exportProgressBar', 'cancelExportBtn',
];

const elements = Object.fromEntries(elementIds.map(id => [id, document.getElementById(id)]));
let exportController = null;

function chooseFiles() {
    elements.fileInput.click();
}

async function processFiles(fileList) {
    elements.dropZone.dataset.state = 'loading';
    elements.browseBtn.disabled = true;
    await handleFiles(fileList, {
        onBusy: busy => {
            elements.browseBtn.disabled = busy;
            elements.dropZone.dataset.state = busy ? 'loading' : 'idle';
        },
        onProgress: (current, total, label) => showPreviewProgress(current, total, label),
        onError: message => console.error('PDF upload failed', message),
    });
    elements.fileInput.value = '';
}

function undoChange() {
    state.undo();
}

function redoChange() {
    state.redo();
}

async function exportDocument() {
    if (exportController) return;
    exportController = new AbortController();
    showExportProgress();
    try {
        const result = await mergePDFs({
            signal: exportController.signal,
            onProgress: updateExportProgress,
            onRestrictedFiles: showEncryptionWarningModal,
        });
        hideExportProgress();
        if (result?.cancelled) return;
    } catch (error) {
        hideExportProgress();
        if (error.name !== 'AbortError') console.error('Export failed', error);
    } finally {
        exportController = null;
    }
}

function initializeInteractions() {
    initModals(elements);
    initViews(elements, {
        onMoveFile: (fileId, delta) => state.moveFile(fileId, delta),
        onDeleteFile: fileId => {
            const file = state.getFile(fileId);
            if (file) state.removeFile(fileId);
        },
        onPreview: showPageLightbox,
        onRotatePage: pageId => state.rotatePages([pageId]),
        onMovePage: (pageId, delta) => state.movePage(pageId, delta),
        onDeletePage: state.deletePage,
        onToggleSelection: state.togglePageSelection,
        onReorderPages: state.setPageOrder,
        onRenderError: error => console.error('Page preview failed', error),
    });

    state.subscribe(event => renderStateOnly(event.type));

    elements.browseBtn.addEventListener('click', chooseFiles);
    elements.addFilesBtn.addEventListener('click', chooseFiles);
    elements.emptyAddFilesBtn.addEventListener('click', chooseFiles);
    elements.fileInput.addEventListener('change', event => processFiles(event.target.files));
    elements.dropZone.addEventListener('dragover', event => {
        event.preventDefault();
        elements.dropZone.dataset.state = 'dragover';
    });
    elements.dropZone.addEventListener('dragleave', event => {
        if (!elements.dropZone.contains(event.relatedTarget)) elements.dropZone.dataset.state = 'idle';
    });
    elements.dropZone.addEventListener('drop', event => {
        event.preventDefault();
        elements.dropZone.dataset.state = 'idle';
        processFiles(event.dataTransfer.files);
    });

    elements.helpBtn.addEventListener('click', event => showHelpModal(event.currentTarget));
    elements.showDocumentsBtn.addEventListener('click', () => setMobileView('documents'));
    elements.showPagesBtn.addEventListener('click', () => setMobileView('pages'));
    elements.densitySelect.addEventListener('change', event => setDensity(event.target.value));

    elements.selectAllBtn.addEventListener('click', () => {
        if (state.selectedPageIds.size === state.compositionPages.length) state.clearSelection();
        else state.setSelectedPageIds(state.compositionPages.map(page => page.id));
    });
    elements.clearSelectionBtn.addEventListener('click', state.clearSelection);
    elements.rotateSelectedBtn.addEventListener('click', () => state.rotatePages([...state.selectedPageIds]));
    elements.deleteSelectedBtn.addEventListener('click', () => {
        const ids = [...state.selectedPageIds];
        state.deletePages(ids);
    });
    elements.undoBtn.addEventListener('click', undoChange);
    elements.redoBtn.addEventListener('click', redoChange);
    elements.outputNameInput.addEventListener('input', event => state.setOutputName(event.target.value));
    elements.outputNameInput.addEventListener('blur', event => {
        const safeName = sanitizeOutputName(event.target.value);
        event.target.value = safeName;
        state.setOutputName(safeName);
    });
    elements.exportBtn.addEventListener('click', exportDocument);
    elements.cancelExportBtn.addEventListener('click', () => {
        elements.exportProgressText.textContent = 'Cancelling after the current page…';
        exportController?.abort();
    });

    window.addEventListener('beforeunload', event => {
        if (!state.hasFiles()) return;
        event.preventDefault();
        event.returnValue = '';
    });
}

initializeInteractions();
