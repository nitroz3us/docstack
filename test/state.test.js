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
