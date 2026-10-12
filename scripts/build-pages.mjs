/**
 * Builds the landing pages (web/merge-pdf.html, web/redact-pdf.html, …) and web/sitemap.xml.
 *
 * Each landing page is web/index.html, the whole app, with a few parts replaced: the title and
 * description, the heading on the first screen, and the text below it. The words come from
 * pages.mjs. The site is served as plain files, so the output is committed, like the
 * stylesheet. Run `npm run build` after changing index.html or the pages.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PAGES } from './pages.mjs';

export const SITE = 'https://docstack.tools/';
const WEB = new URL('../web/', import.meta.url);
const GENERATED = '<!-- Generated from index.html by scripts/build-pages.mjs. Do not edit: change index.html or scripts/pages.mjs, then run npm run build. -->';

const escapeHtml = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Replace the one place the pattern matches, and fail loudly if index.html no longer has exactly one. */
function replaceOnce(html, pattern, replacement) {
    const matches = html.match(new RegExp(pattern.source, 'g')) || [];
    if (matches.length !== 1) throw new Error(`Expected one match for ${pattern} in index.html, found ${matches.length}.`);
    return html.replace(pattern, () => replacement);
}

function extractOnce(html, pattern) {
    const matches = html.match(new RegExp(pattern.source, 'g')) || [];
    if (matches.length !== 1) throw new Error(`Expected one match for ${pattern} in index.html, found ${matches.length}.`);
    return matches[0];
}

function renderSteps(steps, indent) {
    const items = steps.map(([title, text]) => `${indent}    <li>
${indent}        <h3>${escapeHtml(title)}</h3>
${indent}        <p>${escapeHtml(text)}</p>
${indent}    </li>`).join('\n');
    return `${indent}<ol class="about__steps">\n${items}\n${indent}</ol>`;
}

function renderComparison({ columns, rows, note }, indent) {
    const head = columns.map(name => `<th scope="col">${escapeHtml(name)}</th>`).join('');
    // Each cell carries its column's name, shown beside it on phones where the table is stacked.
    const body = rows.map(([label, ...cells]) => `${indent}        <tr><th scope="row">${escapeHtml(label)}</th>${
        cells.map((text, index) => `<td data-label="${escapeHtml(columns[index])}">${escapeHtml(text)}</td>`).join('')}</tr>`).join('\n');
    return `${indent}<table class="about__compare">
${indent}    <thead>
${indent}        <tr><td></td>${head}</tr>
${indent}    </thead>
${indent}    <tbody>
${body}
${indent}    </tbody>
${indent}</table>
${indent}<p class="about__note">${escapeHtml(note)}</p>`;
}

function renderAbout(page, { privacy, tasks }) {
    const indent = '                ';
    const facts = page.facts.map(([term, text]) =>
        `${indent}    <div><dt>${escapeHtml(term)}</dt><dd>${escapeHtml(text)}</dd></div>`).join('\n');
    const questions = page.questions.map(([question, answer]) => `${indent}    <div>
${indent}        <h3>${escapeHtml(question)}</h3>
${indent}        <p>${escapeHtml(answer)}</p>
${indent}    </div>`).join('\n');
    // The list of pages is the home page's own; here the current page is this one.
    const nav = tasks
        .replace(' aria-current="page"', '')
        .replace(`href="${page.slug}"`, `href="${page.slug}" aria-current="page"`);

    const intro = [
        `${indent}<h2 id="aboutTitle">${escapeHtml(page.aboutHeading)}</h2>`,
        `${indent}<p class="about__lede">${escapeHtml(page.aboutIntro)}</p>`,
        page.steps && renderSteps(page.steps, indent),
        page.comparison && renderComparison(page.comparison, indent),
    ].filter(Boolean).join('\n');

    return `<section id="about" class="about" aria-labelledby="aboutTitle">
            <div class="about__inner">
${intro}

${indent}<h2>${escapeHtml(page.factsHeading)}</h2>
${indent}<dl class="about__facts">
${facts}
${indent}</dl>

${indent}${privacy}

${indent}<h2>Common questions</h2>
${indent}<div class="about__faq">
${questions}
${indent}</div>

${indent}${nav}
            </div>
        </section>`;
}

/** @returns {string} index.html turned into one landing page. */
export function renderPage(template, page) {
    const url = SITE + page.slug;
    const title = escapeHtml(page.title);
    const description = escapeHtml(page.description);
    const shared = {
        privacy: extractOnce(template, /<div class="about__privacy">[\s\S]*?<\/div>/),
        tasks: extractOnce(template, /<nav class="about__tasks"[\s\S]*?<\/nav>/),
    };
    if (!shared.tasks.includes(`href="${page.slug}"`)) {
        throw new Error(`Link ${page.slug} from the list of pages in index.html.`);
    }

    const replacements = [
        [/<!DOCTYPE html>/, `<!DOCTYPE html>\n${GENERATED}`],
        [/<title>[^<]*<\/title>/, `<title>${title}</title>`],
        [/<meta name="description" content="[^"]*">/, `<meta name="description" content="${description}">`],
        [/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${url}">`],
        [/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${url}">`],
        [/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${title}">`],
        [/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${description}">`],
        [/<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${title}">`],
        [/<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="${description}">`],
        [/<h1 id="landingTitle">[^<]*<\/h1>/, `<h1 id="landingTitle">${escapeHtml(page.heading)}</h1>`],
        [/<p class="drop-zone__lede">[^<]*<\/p>/, `<p class="drop-zone__lede">${escapeHtml(page.lede)}</p>`],
        [/<section id="about"[\s\S]*?<\/section>/, renderAbout(page, shared)],
    ];
    return replacements.reduce((html, [pattern, replacement]) => replaceOnce(html, pattern, replacement), template);
}

export function renderSitemap(pages) {
    const urls = [SITE, ...pages.map(page => SITE + page.slug)];
    return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generated by scripts/build-pages.mjs. -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(url => `    <url>\n        <loc>${url}</loc>\n    </url>`).join('\n')}
</urlset>
`;
}

/** @returns {Promise<Map<string, string>>} every generated file in web/, by name. */
export async function build() {
    const template = await readFile(new URL('index.html', WEB), 'utf8');
    const files = new Map(PAGES.map(page => [`${page.slug}.html`, renderPage(template, page)]));
    files.set('sitemap.xml', renderSitemap(PAGES));
    return files;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const files = await build();
    await Promise.all([...files].map(([name, content]) => writeFile(new URL(name, WEB), content)));
    console.log(`Built ${[...files.keys()].join(', ')}`);
}
