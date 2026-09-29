import test from 'node:test';
import assert from 'node:assert/strict';
import * as state from '../web/js/state.js';

function file(id, pageCount = 3) {
    return { id, name: `${id}.pdf`, pageCount, size: 100, arrayBuffer: new ArrayBuffer(0), pdfProxy: {} };
}

test.beforeEach(() => state.resetState());

test('one canonical composition plan preserves stable page identities', () => {
    state.addFile(file('a', 3));
    const originalIds = state.compositionPages.map(page => page.id);
    state.movePage(originalIds[2], -1);
    const plan = state.getMergePlan();

    assert.equal(plan.errors.length, 0);
    assert.deepEqual(plan.pages.map(page => page.id), [originalIds[0], originalIds[2], originalIds[1]]);
    assert.deepEqual(plan.pages.map(page => page.sourcePageIndex), [0, 2, 1]);
});

test('deleting a source document removes every dependent page transactionally', () => {
    state.addFile(file('a', 2));
    state.addFile(file('b', 2));
    state.removeFile('a');

    assert.equal(state.getFile('a'), undefined);
    assert.equal(state.compositionPages.length, 2);
    assert.ok(state.compositionPages.every(page => page.sourceFileId === 'b'));
    assert.equal(state.getMergePlan().errors.length, 0);
});

test('deletion cannot remain in the merge plan and is recoverable', () => {
    state.addFile(file('a', 3));
    const deletedId = state.compositionPages[1].id;
    state.deletePage(deletedId);
    assert.equal(state.getMergePlan().pages.some(page => page.id === deletedId), false);

    state.undo();
    assert.equal(state.getMergePlan().pages.some(page => page.id === deletedId), true);
    state.redo();
    assert.equal(state.getMergePlan().pages.some(page => page.id === deletedId), false);
});

test('redactions are normalized and clamped to the final page orientation', () => {
    state.addFile(file('a', 1));
    const pageId = state.compositionPages[0].id;
    state.addRedaction(pageId, { x: 0.9, y: 0.8, width: 0.5, height: 0.5 });
    const rect = state.getPage(pageId).redactions[0];
    assert.equal(rect.x, 0.9);
    assert.equal(rect.y, 0.8);
    assert.ok(Math.abs(rect.width - 0.1) < Number.EPSILON);
    assert.ok(Math.abs(rect.height - 0.2) < Number.EPSILON);
});

test('rotating a page keeps its redactions over the same content', () => {
    state.addFile(file('a', 1));
    const pageId = state.compositionPages[0].id;
    state.addRedaction(pageId, { x: 0.1, y: 0.2, width: 0.3, height: 0.1 });
    state.rotatePages([pageId]);

    const rect = state.getPage(pageId).redactions[0];
    assert.ok(Math.abs(rect.x - 0.7) < 1e-9);
    assert.ok(Math.abs(rect.y - 0.1) < 1e-9);
    assert.ok(Math.abs(rect.width - 0.1) < 1e-9);
    assert.ok(Math.abs(rect.height - 0.3) < 1e-9);

    state.rotatePages([pageId], 270);
    const restored = state.getPage(pageId).redactions[0];
    assert.ok(Math.abs(restored.x - 0.1) < 1e-9);
    assert.ok(Math.abs(restored.y - 0.2) < 1e-9);
});

test('each document gets a distinct color that is reused after removal', () => {
    state.addFile(file('a', 1));
    state.addFile(file('b', 1));
    assert.equal(state.getFile('a').colorIndex, 0);
    assert.equal(state.getFile('b').colorIndex, 1);
    state.removeFile('a');
    state.addFile(file('c', 1));
    assert.equal(state.getFile('c').colorIndex, 0);
});

test('moving a selection nudges each page past its unselected neighbour', () => {
    state.addFile(file('a', 5));
    const ids = state.compositionPages.map(page => page.id);
    assert.equal(state.movePages([ids[1], ids[3]], -1), true);
    assert.deepEqual(state.compositionPages.map(page => page.id), [ids[1], ids[0], ids[3], ids[2], ids[4]]);
    assert.equal(state.movePages([ids[1]], -1), false, 'already first');
    state.movePages([ids[1], ids[3]], 1);
    assert.deepEqual(state.compositionPages.map(page => page.id), ids);
});

test('moving pages to the start or end keeps every other page in place', () => {
    state.addFile(file('a', 3));
    state.addFile(file('b', 2));
    const ids = state.compositionPages.map(page => page.id);
    // Interleave so a file-level regroup would be detectable.
    state.setPageOrder([ids[0], ids[3], ids[1], ids[2], ids[4]]);
    assert.equal(state.movePagesTo([ids[1], ids[2]], 'start'), true);
    assert.deepEqual(state.compositionPages.map(page => page.id), [ids[1], ids[2], ids[0], ids[3], ids[4]]);
    assert.equal(state.movePagesTo([ids[1], ids[2]], 'start'), false, 'already at the start');
    state.movePagesTo([ids[0]], 'end');
    assert.deepEqual(state.compositionPages.map(page => page.id), [ids[1], ids[2], ids[3], ids[4], ids[0]]);
});

test('deleting pages can carry a descriptive history label', () => {
    state.addFile(file('a', 2));
    state.deletePages(state.compositionPages.map(page => page.id), 'Removed a.pdf');
    assert.equal(state.compositionPages.length, 0);
    assert.equal(state.undo(), 'Removed a.pdf');
    assert.equal(state.compositionPages.length, 2);
});

test('a merge plan can be limited to selected pages in document order', () => {
    state.addFile(file('a', 4));
    const ids = state.compositionPages.map(page => page.id);
    const plan = state.getMergePlan([ids[3], ids[1]]);
    assert.deepEqual(plan.pages.map(page => page.id), [ids[1], ids[3]]);
    assert.equal(plan.name, 'merged-selected.pdf');
    assert.equal(state.getMergePlan().name, 'merged.pdf');
});

test('starting over clears everything in one undoable step', () => {
    state.addFile(file('a', 2));
    state.addFile(file('b', 1));
    assert.equal(state.clearAll(), true);
    assert.equal(state.hasFiles(), false);
    assert.equal(state.compositionPages.length, 0);
    state.undo();
    assert.equal(state.uploadedFiles.length, 2);
    assert.equal(state.compositionPages.length, 3);
});

test('a single redaction can be removed and restored', () => {
    state.addFile(file('a', 1));
    const pageId = state.compositionPages[0].id;
    state.addRedaction(pageId, { x: 0.1, y: 0.1, width: 0.2, height: 0.1 });
    state.addRedaction(pageId, { x: 0.5, y: 0.5, width: 0.2, height: 0.1 });
    assert.equal(state.removeRedaction(pageId, 0), true);
    assert.deepEqual(state.getPage(pageId).redactions.map(rect => rect.x), [0.5]);
    assert.equal(state.removeRedaction(pageId, 5), false);
    state.undo();
    assert.equal(state.getPage(pageId).redactions.length, 2);
});

test('files and extra pages can be inserted at a position', () => {
    state.addFile(file('a', 3));
    const [first, second, third] = state.compositionPages.map(page => page.id);
    const inserted = state.addFile(file('b', 2), { insertAt: 1 });
    assert.deepEqual(state.compositionPages.map(page => page.id), [first, inserted[0].id, inserted[1].id, second, third]);

    const blank = { ...file('blank', 1), isBlank: true };
    state.addFile(blank, { insertAt: 0, label: 'Inserted a blank page' });
    assert.equal(state.getFile('blank').colorIndex, null, 'blank pages do not take a file colour');
    const [extra] = state.insertSourcePages('blank', [0], 99, 'Inserted a blank page');
    assert.equal(state.compositionPages.at(-1).id, extra.id, 'positions past the end append');
    assert.equal(state.compositionPages.filter(page => page.sourceFileId === 'blank').length, 2);
    assert.deepEqual(state.insertSourcePages('blank', [3], 0), [], 'invalid source pages are rejected');
    assert.equal(state.undo(), 'Inserted a blank page');
});
