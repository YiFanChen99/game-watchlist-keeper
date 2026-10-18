import { parseSteamDbPrices } from '@watchlist/steam-info-scraper';
import { expect, it } from 'vitest';

import { fixtureFetchText } from '../../steam-info-scraper/test/fixtures';
import {
    addGame,
    Column,
    refreshGame,
    type CellValue,
    type SheetRowStore,
    type SheetRowValues,
    type ValueChange,
} from '../src';

/**
 * What the Steam page buttons send to the web app for each saved fixture game,
 * written as a Markdown table per game to `__snapshots__/payloads.md`: the readable spec next
 * to COLUMNS.md. Review its diff whenever the rules change; `vitest -u` rewrites it.
 */
const games: readonly (readonly [appId: number, label: string])[] = [
    [1145360, 'Hades：已發售、只支援簡中'],
    [1562430, 'DREDGE：特價中（取原價）、支援繁中'],
    [2868840, 'Slay the Spire 2：搶先體驗'],
    [1966720, 'Lethal Company：搶先體驗、只支援英文'],
    [3669620, 'Warhammer Survivors：尚未發售、沒有價格、有 Demo、沒有評論'],
    [570, 'Dota 2：免費遊玩'],
];
const today = new Date(2026, 9, 17);
const steamDbText = 'Lowest recorded price: NT$ 99';
const steamDb = parseSteamDbPrices(steamDbText);

/**
 * Old row for the update case: placeholder price, a review score to mark when Steam has no reviews,
 * an English-only mark, and a hand-typed feature description to keep.
 */
const oldRow: SheetRowValues = {
    [Column.originalPrice]: 10000,
    [Column.releaseDate]: '2020/1/1',
    [Column.reviewScore]: 80,
    [Column.special]: '英',
    [Column.detail]: '手寫的遊戲特點。中位1H，3rd.高2H。',
};

/** Columns in sheet order; formula columns are copied by the web app, not sent. */
const columns = Object.values(Column).filter(column => column !== Column.lowestPrice);

function recordingStore() {
    const sent: SheetRowValues[] = [];
    const record = (_: number, values: SheetRowValues) => {
        sent.push(values);
        return Promise.resolve();
    };
    const store: SheetRowStore = { read: () => Promise.resolve(oldRow), write: record, append: record };
    return { store, sent };
}

const cell = (value: CellValue | undefined) => (value === undefined ? '—' : `\`${value}\``);

function formatChange({ column, oldValue, newValue, delta }: ValueChange): string {
    const unit = column === Column.releaseDate ? ' 天' : '';
    const signed = delta === null ? '' : `（${delta > 0 ? '+' : ''}${delta}${unit}）`;
    return `- ${column}：${oldValue === null ? '（無）' : cell(oldValue)} → ${cell(newValue)}${signed}`;
}

async function describeGame(appId: number, label: string): Promise<string> {
    const deps = { fetchText: fixtureFetchText, steamDb, now: () => today };
    const added = recordingStore();
    await addGame(appId, { ...deps, store: added.store });
    const updated = recordingStore();
    const { changes } = await refreshGame(appId, { ...deps, store: updated.store });

    const rows = columns.map(column =>
        `| ${column} | ${cell(added.sent[0]?.[column])} | ${cell(oldRow[column])} | ${cell(updated.sent[0]?.[column])} |`);
    return [
        `## ${appId} ${label}`,
        '',
        '| 欄 | ＋ 新增送出 | ↻ 更新前（Sheet） | ↻ 更新送出 |',
        '|---|---|---|---|',
        ...rows,
        '',
        '↻ 更新回報的變動：',
        '',
        ...(changes.length ? changes.map(formatChange) : ['（無）']),
    ].join('\n');
}

it('documents what each button sends for every fixture game', async () => {
    const sections = await Promise.all(games.map(([appId, label]) => describeGame(appId, label)));
    const markdown = [
        '# 送出資料一覽',
        '',
        '> 由 `test/payloads.test.ts` 產生，不要手動編輯。規則見 [COLUMNS.md](../../COLUMNS.md)。',
        '',
        `- 今天：${today.getFullYear()}/${today.getMonth() + 1}/${today.getDate()}；SteamDB 區塊：\`${steamDbText}\``,
        '- `—`：送出欄裡表示不送、Sheet 上保持原樣（新增時就是空白）；「更新前」欄裡表示這個例子沒有設定舊值。公式欄由 server 從上一列複製，不在表內。',
        '- 遊戲資料來自 `packages/steam-info-scraper/test/fixtures`（2026-10-17 抓取）。',
        '',
        ...sections.flatMap(section => [section, '']),
    ].join('\n');

    await expect(markdown).toMatchFileSnapshot('__snapshots__/payloads.md');
});
