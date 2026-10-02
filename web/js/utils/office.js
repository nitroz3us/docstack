/**
 * Converts PowerPoint and Word files (and their OpenDocument equivalents) to PDF on this device
 * with ZetaOffice, which is LibreOffice compiled to WebAssembly. The engine is about 50 MB, so it
 * is downloaded only when the first such file is added.
 *
 * Spreadsheets are left out on purpose: a sheet is not page-shaped, so an automatic conversion
 * either cuts columns off or shrinks them until they are unreadable. Excel's own PDF export lets
 * the author choose the print area and scaling.
 */

// The one third-party request docstack makes: the engine is too large to ship in this repository.
const ENGINE_URL = 'https://cdn.zetaoffice.net/zetaoffice_latest/';
// A slow connection is never cut off: while the engine's two files download, the only limit is
// on how long nothing at all arrives. Compiling and starting the engine report no progress, so
// those get a fixed allowance; starting normally takes a few seconds.
const DOWNLOAD_STALL_TIMEOUT_MS = 45000;
// For the progress display only: the engine file's size once decompressed, which the browser does
// not report in advance, and its share of the whole download (the data file is the rest). If a new
// engine build changes the size, the percentage is slightly off but still ends where it should.
const ENGINE_FILE_BYTES = 162e6;
const ENGINE_FILE_SHARE = 0.7;
const ENGINE_START_TIMEOUT_MS = 90000;
const CONVERT_TIMEOUT_MS = 180000;
// A half-started or stuck engine cannot be restarted inside the same page.
const RELOAD_HINT = 'Reload the page and try again.';

const KINDS = [
    { name: 'presentation', extensions: /\.(pptx?|odp)$/i, filter: 'impress_pdf_Export' },
    { name: 'document', extensions: /\.(docx?|odt|rtf)$/i, filter: 'writer_pdf_Export' },
];

let officePromise = null;
let engineFailed = false;
let nextId = 0;
const pending = new Map();
let queue = Promise.resolve();

function kindOf(file) {
    return KINDS.find(kind => kind.extensions.test(file.name));
}

export function looksLikeOfficeFile(file) {
    return Boolean(kindOf(file));
}

/** The engine needs SharedArrayBuffer, which browsers only allow on cross-origin isolated pages. */
export function canConvertOfficeFiles() {
    return globalThis.crossOriginIsolated === true && typeof SharedArrayBuffer !== 'undefined';
}

/**
 * Modern Office and OpenDocument files are zip archives, the older .ppt and .doc are OLE
 * compound files, and .rtf is text starting with "{\rtf". LibreOffice opens almost anything as
 * plain text, so a file that only has the right name must be rejected here.
 */
export async function hasOfficeSignature(file) {
    const bytes = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    const startsWith = (...expected) => expected.every((byte, index) => bytes[index] === byte);
    if (/\.rtf$/i.test(file.name)) return startsWith(0x7b, 0x5c, 0x72, 0x74, 0x66);
    if (/\.(ppt|doc)$/i.test(file.name)) return startsWith(0xd0, 0xcf, 0x11, 0xe0);
    return startsWith(0x50, 0x4b, 0x03, 0x04);
}

async function assertEngineReachable() {
    try {
        const response = await fetch(`${ENGINE_URL}soffice.js`, { method: 'HEAD' });
        if (!response.ok) throw new Error(String(response.status));
    } catch {
        throw new Error('The conversion tool could not be downloaded. Check your connection and try again.');
    }
}

async function startOffice(onStatus) {
    await assertEngineReachable();
    const { ZetaHelperMain } = await import('../../lib/zetajs/zetaHelper.js');
    return new Promise((resolve, reject) => {
        let watchdog = 0;
        // The engine downloads its data file itself and, if that fails, only throws from an event
        // handler. Its script is cross-origin, so the browser reports such errors without a file
        // name; docstack's own scripts always have one.
        const onEngineError = event => {
            if (!event.filename || event.filename.startsWith(ENGINE_URL)) fail('The conversion tool could not be downloaded.');
        };
        window.addEventListener('error', onEngineError);
        const fail = message => {
            window.clearTimeout(watchdog);
            window.removeEventListener('error', onEngineError);
            engineFailed = true;
            const error = new Error(`${message} ${RELOAD_HINT}`);
            reject(error);
            // If the engine dies later, files being converted must not wait for their own limit.
            pending.forEach(request => request.reject(error));
            pending.clear();
        };
        const allow = milliseconds => {
            window.clearTimeout(watchdog);
            watchdog = window.setTimeout(() => fail('The conversion tool did not start.'), milliseconds);
        };
        allow(DOWNLOAD_STALL_TIMEOUT_MS);
        // The engine expects a canvas for its (unused) interface.
        if (!document.getElementById('qtcanvas')) {
            const canvas = document.createElement('canvas');
            canvas.id = 'qtcanvas';
            canvas.hidden = true;
            document.body.appendChild(canvas);
        }
        // Report whole percents only; the engine file arrives in thousands of small chunks.
        let reportedPercent = -1;
        const reportDownload = fraction => {
            const percent = Math.floor(Math.min(fraction, 1) * 100);
            if (percent === reportedPercent) return;
            reportedPercent = percent;
            onStatus?.({ stage: 'download', fraction: percent / 100 });
        };
        const helper = new ZetaHelperMain(new URL('../office/thread.js', import.meta.url).href, {
            threadJsType: 'module',
            wasmPkg: `url:${ENGINE_URL}`,
        });
        // The engine calls this if it crashes.
        helper.Module.onAbort = () => fail('The conversion tool stopped working.');
        // Download the engine file here instead of letting the engine fetch it: its own fetch
        // reports neither progress nor failure, so a slow download could not be told apart from a
        // dead one. Counting the bytes as they stream into the compiler keeps the stall limit
        // honest, and a failed download is reported at once.
        helper.Module.instantiateWasm = (imports, receiveInstance) => {
            (async () => {
                const response = await fetch(`${ENGINE_URL}soffice.wasm`);
                if (!response.ok || !response.body) throw new Error(`Unexpected response (${response.status})`);
                const reader = response.body.getReader();
                let received = 0;
                const counted = new ReadableStream({
                    async pull(controller) {
                        const { done, value } = await reader.read();
                        if (done) {
                            // Downloaded; what remains is compiling, then the data file.
                            allow(ENGINE_START_TIMEOUT_MS);
                            controller.close();
                            return;
                        }
                        allow(DOWNLOAD_STALL_TIMEOUT_MS);
                        received += value.byteLength;
                        reportDownload(ENGINE_FILE_SHARE * Math.min(received / ENGINE_FILE_BYTES, 1));
                        controller.enqueue(value);
                    },
                    cancel: reason => reader.cancel(reason),
                });
                const { instance, module } = await WebAssembly.instantiateStreaming(
                    new Response(counted, { headers: { 'Content-Type': 'application/wasm' } }),
                    imports
                );
                receiveInstance(instance, module);
            })().catch(() => fail('The conversion tool could not be downloaded.'));
            return {};
        };
        // Emscripten reports download progress as "Downloading data... (12345/67890)". Once the
        // download is complete the engine still takes a few seconds to start, so say so instead of
        // sitting at 100%.
        let starting = false;
        helper.Module.setStatus = text => {
            const match = /\((\d+)\/(\d+)\)/.exec(text || '');
            if (!match || starting) return;
            const loaded = Number(match[1]);
            const total = Number(match[2]);
            starting = loaded >= total;
            allow(starting ? ENGINE_START_TIMEOUT_MS : DOWNLOAD_STALL_TIMEOUT_MS);
            if (starting) onStatus?.({ stage: 'start' });
            else reportDownload(ENGINE_FILE_SHARE + (1 - ENGINE_FILE_SHARE) * (loaded / total));
        };
        helper.start(() => {
            helper.thrPort.onmessage = ({ data }) => {
                if (data.cmd === 'ready') {
                    window.clearTimeout(watchdog);
                    window.removeEventListener('error', onEngineError);
                    resolve(helper);
                    return;
                }
                const request = pending.get(data.id);
                if (!request) return;
                pending.delete(data.id);
                if (data.cmd === 'converted') request.resolve();
                else request.reject(new Error(data.message));
            };
        });
    });
}

function ensureOffice(onStatus) {
    if (engineFailed) return Promise.reject(new Error(`The conversion tool stopped working. ${RELOAD_HINT}`));
    if (!officePromise) {
        officePromise = startOffice(onStatus);
        officePromise.catch(() => { officePromise = null; });
    }
    return officePromise;
}

async function convert(file, { onStatus } = {}) {
    const kind = kindOf(file);
    if (!kind || !await hasOfficeSignature(file)) {
        throw new Error(`It is not a valid ${kind?.name || 'Office'} file, or it is password-protected.`);
    }
    const helper = await ensureOffice(onStatus);
    onStatus?.({ stage: 'convert' });

    const id = ++nextId;
    const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    const from = `/tmp/input-${id}${extension}`;
    const to = `/tmp/output-${id}.pdf`;
    const FS = helper.FS;
    FS.writeFile(from, new Uint8Array(await file.arrayBuffer()));
    try {
        await new Promise((resolve, reject) => {
            const timer = window.setTimeout(() => {
                pending.delete(id);
                // The engine is still busy with this file, so later files would only queue behind it.
                engineFailed = true;
                reject(new Error(`The conversion took too long. ${RELOAD_HINT}`));
            }, CONVERT_TIMEOUT_MS);
            pending.set(id, {
                resolve: () => { window.clearTimeout(timer); resolve(); },
                reject: error => { window.clearTimeout(timer); reject(error); },
            });
            helper.thrPort.postMessage({ cmd: 'convert', id, from, to, filter: kind.filter });
        });
        const bytes = FS.readFile(to);
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    } finally {
        [from, to].forEach(path => {
            try {
                FS.unlink(path);
            } catch {
                // Never written.
            }
        });
    }
}

/**
 * @param {File} file
 * @param {{onStatus?: (status: {stage: 'download'|'start'|'convert', fraction?: number}) => void}} [options]
 *   called as the work moves on: downloading the engine (with how much of it has arrived, 0 to 1),
 *   starting it, then converting the file.
 * @returns {Promise<ArrayBuffer>} the file as a PDF.
 */
export function officeToPdf(file, options) {
    // The engine handles one document at a time.
    const result = queue.then(() => convert(file, options));
    queue = result.catch(() => {});
    return result;
}
