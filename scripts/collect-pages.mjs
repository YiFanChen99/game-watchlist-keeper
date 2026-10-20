/**
 * Gather every built userscript into one GitHub Pages site.
 *
 * packages/userscript-<site>/dist/* → _site/<site>/*, plus an index page linking each
 * Script.user.js and the setup page. Run after `pnpm -r build`.
 */

import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const prefix = 'userscript-';
const packagesDir = new URL('../packages/', import.meta.url);
const siteDir = new URL('../_site/', import.meta.url);

await rm(siteDir, { recursive: true, force: true });
await mkdir(siteDir, { recursive: true });

const sites = [];
for (const entry of await readdir(packagesDir, { withFileTypes: true })) {
    const dist = new URL(`${entry.name}/dist/`, packagesDir);
    if (!entry.isDirectory() || !entry.name.startsWith(prefix) || !existsSync(dist)) {
        continue;
    }
    const site = entry.name.slice(prefix.length);
    await cp(dist, new URL(`${site}/`, siteDir), { recursive: true });
    sites.push(site);
}

if (!sites.length) {
    throw new Error('No built userscripts found; run `pnpm -r build` first.');
}

const links = sites
    .map(site => `    <li><a href="${site}/Script.user.js">${site}</a></li>`)
    .join('\n');
await writeFile(new URL('index.html', siteDir), `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <title>game-watchlist-keeper userscripts</title>
</head>
<body>
  <h1>game-watchlist-keeper userscripts</h1>
  <ul>
${links}
  </ul>
  <p><a href="setup.html">設定 token 與 API key</a>（一次存進每支已安裝的腳本）</p>
</body>
</html>
`);

// The installed userscripts @match this page and do the saving: the page itself has no script, loads
// nothing else and sends nothing anywhere. Ids are the storage keys; see setupPage.ts in
// packages/tampermonkey-requests, which this script cannot import. Keep them in sync.
await writeFile(new URL('setup.html', siteDir), `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>game-watchlist-keeper 設定</title>
</head>
<body>
  <h1>設定 token 與 API key</h1>
  <p>每支已安裝的 userscript 會把這裡輸入的值存進它自己的 Tampermonkey 儲存空間。值不會送到任何地方，這個頁面也沒有自己的程式。留白的欄位不會改動已存的值。</p>
  <p><label>Sheet API 的 token（Apps Script 的 <code>API_TOKEN</code>）<br>
    <input type="password" id="sheetApiToken" autocomplete="off" size="50"></label></p>
  <p><label>IsThereAnyDeal 的 API key（ITAD app 的 API Key，不是 OAuth 的 Client ID / Secret）<br>
    <input type="password" id="itadApiKey" autocomplete="off" size="50"></label></p>
  <p><button type="button" id="save">儲存</button></p>
  <h2>已安裝的腳本</h2>
  <ul id="scripts">
    <li id="no-scripts">沒有偵測到腳本：請先安裝 userscript，並在 Tampermonkey 允許它在這個頁面執行。</li>
  </ul>
</body>
</html>
`);

console.log(`Collected ${sites.join(', ')} -> _site/`);
