import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeOutputName } from '../web/js/utils/helpers.js';

test('output filenames are filesystem-safe', () => {
    assert.equal(sanitizeOutputName('  Report: Q4?.pdf '), 'Report- Q4-');
    assert.equal(sanitizeOutputName(''), 'merged');
});
