#!/usr/bin/env node
/**
 * Captures the README screenshots (docs/screenshot-workspace.png, docs/screenshot-preview.png)
 * from the real app, using made-up sample PDFs.
 *
 *   node design/capture-screenshots.mjs
 *
 * Needs Node 22+ and Google Chrome. Set CHROME_PATH if Chrome is not in the default macOS location.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const WEB = join(ROOT, 'web');
const OUT = join(ROOT, 'docs');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
// 1440×900 layout captured at 1920×1200: sharp on high-density screens, small enough for a README.
const VIEWPORT = { width: 1440, height: 900, deviceScaleFactor: 4 / 3 };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const sleep = ms => new Promise(done => setTimeout(done, ms));

function serveWeb() {
    const server = createServer(async (request, response) => {
        const path = normalize(decodeURIComponent(new URL(request.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
        try {
            const body = await readFile(join(WEB, path || 'index.html'));
            response.writeHead(200, { 'Content-Type': TYPES[extname(path || 'index.html')] || 'application/octet-stream' });
            response.end(body);
        } catch {
            response.writeHead(404).end();
        }
    });
    return new Promise(done => server.listen(0, '127.0.0.1', () => done(server)));
}

async function launchChrome() {
    const profile = await mkdtemp(join(tmpdir(), 'docstack-shots-'));
    const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--hide-scrollbars', '--no-first-run', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
    const endpoint = await new Promise((done, fail) => {
        chrome.stderr.on('data', chunk => {
            const match = String(chunk).match(/ws:\/\/[^\s]+/);
            if (match) done(match[0]);
        });
        chrome.on('exit', code => fail(new Error(`Chrome exited (${code})`)));
    });
    return { chrome, profile, endpoint };
}

/** A minimal Chrome DevTools Protocol client over the built-in WebSocket. */
async function connect(endpoint) {
    const socket = new WebSocket(endpoint);
    await new Promise((done, fail) => { socket.onopen = done; socket.onerror = fail; });
    let id = 0;
    const pending = new Map();
    const listeners = [];
    socket.onmessage = ({ data }) => {
        const message = JSON.parse(data);
        if (message.id && pending.has(message.id)) {
            const { done, fail } = pending.get(message.id);
            pending.delete(message.id);
            message.error ? fail(new Error(message.error.message)) : done(message.result);
        } else if (message.method) {
            listeners.forEach(listener => listener(message));
        }
    };
    const send = (method, params = {}, sessionId) => new Promise((done, fail) => {
        pending.set(++id, { done, fail });
        socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
    return { send, listeners, close: () => socket.close() };
}

// Runs inside the page: builds realistic sample documents with the app's own pdf-lib and loads them.
const LOAD_SAMPLES = String(async function loadSamples() {
    while (!window.PDFLib) await new Promise(done => setTimeout(done, 100));
    const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
    const ink = rgb(0.11, 0.12, 0.14);
    const muted = rgb(0.42, 0.44, 0.48);
    const prose = 'Revenue grew across every region this quarter, led by the northern corridor where new contracts with two national retailers came into effect. Operating costs rose more slowly than volume, which lifted margin by two points. Fuel remains the largest single cost, and the hedging programme agreed in July has now covered most of next quarter at a fixed rate.';

    function wrap(text, font, size, width) {
        const lines = [];
        let line = '';
        text.split(' ').forEach(word => {
            const next = line ? `${line} ${word}` : word;
            if (font.widthOfTextAtSize(next, size) > width) { lines.push(line); line = word; } else line = next;
        });
        if (line) lines.push(line);
        return lines;
    }
    function paragraph(page, font, text, x, y, width, size = 10.5) {
        wrap(text, font, size, width).forEach((line, index) => page.drawText(line, { x, y: y - index * size * 1.55, size, font, color: ink }));
        return y - wrap(text, font, size, width).length * size * 1.55;
    }
    async function build(name, pages) {
        const document = await PDFDocument.create();
        const regular = await document.embedFont(StandardFonts.Helvetica);
        const bold = await document.embedFont(StandardFonts.HelveticaBold);
        pages.forEach(draw => draw(document, regular, bold));
        return new File([await document.save()], name, { type: 'application/pdf' });
    }
    const portrait = (document) => document.addPage([612, 792]);

    const report = await build('Q3-board-report.pdf', [
        (d, r, b) => { const p = portrait(d); p.drawRectangle({ x: 0, y: 560, width: 612, height: 232, color: rgb(0.09, 0.19, 0.31) }); p.drawRectangle({ x: 0, y: 552, width: 612, height: 8, color: rgb(0.85, 0.64, 0.25) }); p.drawText('NORTHWIND FREIGHT', { x: 56, y: 600, size: 13, font: b, color: rgb(0.9, 0.93, 0.96) }); p.drawText('Q3 2026 Board Report', { x: 56, y: 480, size: 32, font: b, color: ink }); p.drawText('Prepared for the board · 14 October 2026', { x: 56, y: 452, size: 12, font: r, color: muted }); },
        (d, r, b) => { const p = portrait(d); p.drawText('1. Summary', { x: 56, y: 720, size: 20, font: b, color: ink }); let y = paragraph(p, r, prose, 56, 690, 500); y = paragraph(p, r, prose, 56, y - 14, 500); paragraph(p, r, prose, 56, y - 14, 500); },
        (d, r, b) => { const p = portrait(d); p.drawText('2. Revenue by region', { x: 56, y: 720, size: 20, font: b, color: ink }); [150, 205, 120, 240, 180].forEach((h, i) => p.drawRectangle({ x: 76 + i * 96, y: 420, width: 62, height: h, color: i === 3 ? rgb(0.85, 0.64, 0.25) : rgb(0.29, 0.44, 0.65) })); p.drawLine({ start: { x: 60, y: 420 }, end: { x: 552, y: 420 }, thickness: 1, color: muted }); p.drawText('Figure 1. Revenue in $m by region, Q3 2026', { x: 56, y: 396, size: 9.5, font: r, color: muted }); paragraph(p, r, prose, 56, 360, 500); },
        (d, r, b) => { const p = portrait(d); p.drawText('3. Operating costs', { x: 56, y: 720, size: 20, font: b, color: ink }); [['Fuel', '4.2'], ['Maintenance', '1.8'], ['Wages', '6.9'], ['Leases', '2.3'], ['Insurance', '0.9'], ['Tolls', '0.6']].forEach(([label, value], i) => { const y = 680 - i * 28; p.drawText(label, { x: 56, y, size: 11, font: r, color: ink }); p.drawText(value, { x: 520, y, size: 11, font: r, color: ink }); p.drawLine({ start: { x: 56, y: y - 9 }, end: { x: 556, y: y - 9 }, thickness: 0.5, color: rgb(0.85, 0.86, 0.88) }); }); paragraph(p, r, prose, 56, 480, 500); },
        (d, r, b) => { const p = d.addPage([792, 612]); p.drawRectangle({ x: 0, y: 0, width: 792, height: 612, color: rgb(0.06, 0.14, 0.24) }); p.drawText('Board session · Item 4', { x: 56, y: 540, size: 12, font: r, color: rgb(0.62, 0.7, 0.81) }); p.drawText('Fleet expansion plan', { x: 56, y: 500, size: 30, font: b, color: rgb(0.96, 0.97, 0.98) }); [['+24', 'trucks by Q2 2027'], ['$3.1m', 'capital cost'], ['18 mo', 'payback period']].forEach(([big, small], i) => { p.drawRectangle({ x: 56 + i * 232, y: 90, width: 212, height: 120, color: rgb(0.13, 0.21, 0.31) }); p.drawText(big, { x: 76 + i * 232, y: 158, size: 28, font: b, color: rgb(0.96, 0.97, 0.98) }); p.drawText(small, { x: 76 + i * 232, y: 124, size: 12, font: r, color: rgb(0.72, 0.78, 0.85) }); }); },
    ]);
    const invoice = await build('Invoice-2291.pdf', [
        (d, r, b) => { const p = portrait(d); p.drawText('Invoice', { x: 56, y: 716, size: 28, font: b, color: ink }); p.drawText('#2291', { x: 490, y: 720, size: 14, font: r, color: muted }); p.drawLine({ start: { x: 56, y: 700 }, end: { x: 556, y: 700 }, thickness: 1.5, color: ink }); [['Linehaul, September', '14,200.00'], ['Fuel surcharge', '2,640.00'], ['Detention', '980.00'], ['Handling', '600.00']].forEach(([label, value], i) => { const y = 600 - i * 28; p.drawText(label, { x: 56, y, size: 11, font: r, color: ink }); p.drawText(value, { x: 490, y, size: 11, font: r, color: ink }); }); p.drawText('Total due   $18,420.00', { x: 380, y: 470, size: 14, font: b, color: ink }); p.drawText('Pay to account', { x: 56, y: 110, size: 9, font: r, color: muted }); p.drawText('NL91 ABNA 0417 1643 00', { x: 56, y: 92, size: 13, font: r, color: ink }); },
        (d, r, b) => { const p = portrait(d); p.drawText('Payment terms', { x: 56, y: 720, size: 20, font: b, color: ink }); paragraph(p, r, 'Payment is due within 30 days of the invoice date. Late payments accrue interest at the statutory rate. Please quote the invoice number with every payment so it can be matched to your account.', 56, 690, 500); },
    ]);
    const nda = await build('Signed-NDA.pdf', [
        (d, r, b) => { const p = portrait(d); p.drawText('Mutual Non-Disclosure Agreement', { x: 56, y: 720, size: 20, font: b, color: ink }); let y = 680; ['1. Definitions', '2. Obligations', '3. Exclusions'].forEach(title => { p.drawText(title, { x: 56, y, size: 12, font: b, color: ink }); y = paragraph(p, r, 'Each party agrees to keep the other party’s confidential information secret, to use it only for evaluating the proposed partnership, and to share it only with staff who need to know it for that purpose.', 56, y - 20, 500) - 18; }); },
        (d, r, b) => { const p = portrait(d); let y = 720; ['4. Term', '5. Return of materials', '6. Governing law'].forEach(title => { p.drawText(title, { x: 56, y, size: 12, font: b, color: ink }); y = paragraph(p, r, 'These obligations continue for three years after the last disclosure. On request, each party will return or destroy the other party’s materials and confirm this in writing.', 56, y - 20, 500) - 18; }); },
        (d, r, b) => { const p = portrait(d); p.drawText('Signatures', { x: 56, y: 720, size: 20, font: b, color: ink }); [56, 330].forEach((x, i) => { p.drawLine({ start: { x, y: 560 }, end: { x: x + 220, y: 560 }, thickness: 1, color: ink }); p.drawText(i ? 'Harbor Logistics · 2 Sep 2026' : 'Northwind Freight · 2 Sep 2026', { x, y: 542, size: 10, font: r, color: muted }); }); },
    ]);

    const input = document.getElementById('fileInput');
    const transfer = new DataTransfer();
    [report, invoice, nda].forEach(file => transfer.items.add(file));
    input.files = transfer.files;
    input.dispatchEvent(new Event('change'));
    const expected = 10;
    while (document.querySelectorAll('.page-canvas[data-rendered="true"]').length < expected) await new Promise(done => setTimeout(done, 100));
    return document.querySelectorAll('.page-tile').length;
});

const SCENE_WORKSPACE = String(async function sceneWorkspace() {
    const state = await import('/js/state.js');
    const ids = state.compositionPages.map(page => page.id);
    state.setSelectedPageIds([ids[1], ids[2]]);
    document.querySelectorAll('.toast').forEach(toast => toast.remove());
    window.scrollTo(0, 0);
    await new Promise(done => setTimeout(done, 400));
});

const SCENE_PREVIEW = String(async function scenePreview() {
    const state = await import('/js/state.js');
    state.clearSelection();
    const invoicePage = state.compositionPages[5];
    state.addRedaction(invoicePage.id, { x: 0.085, y: 0.868, width: 0.4, height: 0.04 });
    document.querySelectorAll('.page-tile')[5].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await new Promise(done => setTimeout(done, 1200));
    document.getElementById('redactModeBtn').click();
    await new Promise(done => setTimeout(done, 200));
    document.getElementById('proceedRedactionBtn')?.click();
    await new Promise(done => setTimeout(done, 400));
    document.querySelectorAll('.toast').forEach(toast => toast.remove());
    while (document.getElementById('lightboxSpinner') && !document.getElementById('lightboxSpinner').classList.contains('hidden')) await new Promise(done => setTimeout(done, 100));
    while (document.querySelectorAll('.filmstrip canvas[data-rendered="true"]').length < 8) await new Promise(done => setTimeout(done, 100));
    // Tidy the frame: no leftover focus ring, and the current page centred in the thumbnail strip.
    document.activeElement?.blur();
    document.querySelector('.filmstrip__item[aria-current="page"]').scrollIntoView({ block: 'center' });
    await new Promise(done => setTimeout(done, 400));
});

async function main() {
    await mkdir(OUT, { recursive: true });
    const server = await serveWeb();
    const { chrome, profile, endpoint } = await launchChrome();
    const cdp = await connect(endpoint);
    try {
        const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
        const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
        const page = (method, params) => cdp.send(method, params, sessionId);
        await page('Page.enable');
        await page('Emulation.setDeviceMetricsOverride', { ...VIEWPORT, mobile: false });
        const loaded = new Promise(done => cdp.listeners.push(message => { if (message.method === 'Page.loadEventFired') done(); }));
        await page('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
        await loaded;
        const run = async source => {
            const { exceptionDetails, result } = await page('Runtime.evaluate', { expression: `(${source})()`, awaitPromise: true, returnByValue: true });
            if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
            return result.value;
        };
        const shoot = async file => {
            const { data } = await page('Page.captureScreenshot', { format: 'png' });
            await writeFile(join(OUT, file), Buffer.from(data, 'base64'));
            console.log(`Saved docs/${file}`);
        };

        console.log(`Loaded ${await run(LOAD_SAMPLES)} sample pages`);
        await run(SCENE_WORKSPACE);
        await shoot('screenshot-workspace.png');
        await run(SCENE_PREVIEW);
        await shoot('screenshot-preview.png');
    } finally {
        cdp.close();
        chrome.kill();
        server.close();
        await sleep(300);
        await rm(profile, { recursive: true, force: true });
    }
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
