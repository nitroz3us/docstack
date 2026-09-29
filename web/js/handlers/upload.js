import * as state from '../state.js';
import { generateId } from '../utils/helpers.js';
import { getPageCount, hasPdfSignature, loadPdfDocument } from '../utils/pdf.js';
import { showPasswordModal } from '../ui/modals.js';

function looksLikePdf(file) {
    return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

/**
 * @param {FileList|File[]} fileList
 * @param {Object} [callbacks]
 * @param {{insertAt?: number}} [options] - insert the files at this page position, in order,
 *   instead of adding them after the current pages.
 */
export async function handleFiles(fileList, callbacks = {}, { insertAt } = {}) {
    const candidates = Array.from(fileList);
    const files = candidates.filter(looksLikePdf);
    const ignored = candidates.length - files.length;

    if (ignored > 0) {
        callbacks.onError?.(`${ignored} non-PDF file${ignored === 1 ? ' was' : 's were'} ignored.`);
    }
    if (files.length === 0) return { added: 0, ignored };

    callbacks.onBusy?.(true);
    let added = 0;
    let position = insertAt;

    try {
        for (let index = 0; index < files.length; index++) {
            const file = files[index];
            callbacks.onProgress?.(index, files.length, `Opening ${file.name}`);

            try {
                if (!await hasPdfSignature(file)) {
                    callbacks.onError?.(`${file.name} does not contain valid PDF data.`);
                    continue;
                }

                const arrayBuffer = await file.arrayBuffer();
                let pdfProxy = null;
                let password = null;
                let showError = false;

                while (!pdfProxy) {
                    try {
                        pdfProxy = await loadPdfDocument(arrayBuffer, password);
                    } catch (error) {
                        if (error.name !== 'PasswordException') throw error;
                        password = await showPasswordModal(file.name, showError);
                        if (password === null) break;
                        showError = true;
                    }
                }
                if (!pdfProxy) continue;

                const pageCount = getPageCount(pdfProxy);
                state.addFile({
                    id: generateId(),
                    name: file.name,
                    size: file.size,
                    arrayBuffer,
                    pdfProxy,
                    pageCount,
                    password,
                }, { insertAt: position });
                if (position !== undefined) position += pageCount;
                added++;
                callbacks.onFileAdded?.(file.name);
            } catch (error) {
                console.error(`Could not open ${file.name}`, error);
                callbacks.onError?.(`Could not open ${file.name}. ${error.message || 'The file may be damaged.'}`);
            }
        }
    } finally {
        callbacks.onProgress?.(files.length, files.length, 'Documents ready');
        callbacks.onBusy?.(false);
    }

    return { added, ignored };
}
