import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SITE, build } from '../scripts/build-pages.mjs';
import { TASK_PAGES } from '../scripts/task-pages.mjs';

const read = name => readFile(new URL(`../web/${name}`, import.meta.url), 'utf8');
const pick = (html, pattern) => html.match(pattern)?.[1];
const TITLE = /<title>([^<]*)<\/title>/;
const DESCRIPTION = /<meta name="description" content="([^"]*)">/;
const HEADING = /<h1 id="landingTitle">([^<]*)<\/h1>/;
const CANONICAL = /<link rel="canonical" href="([^"]*)">/;

test('the task pages and sitemap in web/ are up to date', async () => {
    for (const [name, expected] of await build()) {
        assert.equal(await read(name), expected, `${name} is out of date: run npm run build`);
    }
});

test('each task page has its own title, description, heading and address', async () => {
    const pages = [await read('index.html'), ...await Promise.all(TASK_PAGES.map(page => read(`${page.slug}.html`)))];
    for (const pattern of [TITLE, DESCRIPTION, HEADING, CANONICAL]) {
        const values = pages.map(html => pick(html, pattern));
        assert.equal(values.every(Boolean), true, `every page has ${pattern}`);
        assert.equal(new Set(values).size, pages.length, `no two pages share ${pattern}`);
    }
    TASK_PAGES.forEach((page, index) => assert.equal(pick(pages[index + 1], CANONICAL), SITE + page.slug));
});

test('each task page is linked from every page and listed in the sitemap', async () => {
    const sitemap = await read('sitemap.xml');
    const pages = [await read('index.html'), ...await Promise.all(TASK_PAGES.map(page => read(`${page.slug}.html`)))];
    for (const { slug } of TASK_PAGES) {
        assert.equal(sitemap.includes(`<loc>${SITE}${slug}</loc>`), true, `${slug} is in the sitemap`);
        pages.forEach(html => assert.equal(html.includes(`<a href="${slug}"`), true, `${slug} is linked`));
    }
});
