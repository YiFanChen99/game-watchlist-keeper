import { expect, it } from 'vitest';

import { fixtureFetchText, fixtureItadApiKey } from '../../steam-info-scraper/test/fixtures';
import {
    addGame,
    Column,
    parseTagRules,
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
    [1562430, 'DREDGE：本體前面有豪華版的區塊（取本體）、支援繁中'],
    [2868840, 'Slay the Spire 2：搶先體驗'],
    [1966720, 'Lethal Company：搶先體驗、只支援英文'],
    [3669620, 'Warhammer Survivors：尚未發售、沒有價格、有 Demo、沒有評論'],
    [570, 'Dota 2：免費遊玩'],
    [900270, 'Reventure：史低之後漲價'],
];
const today = new Date(2026, 9, 17);

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

/** The user's sample 標籤規則 worksheet (2026-10-21), with `Rouge` spelled `Rogue`. */
const { rules: tagRules } = parseTagRules([
    ['', '輸出', '目標欄', 'User Tags', 'Categories', 'Genres'],
    ['', '多人', '模式', '合作、多人、玩家合作', '線上合作、分割螢幕、多人連線', ''],
    ['', '動作', '模式', '動作類 Rogue', '', '動作'],
    ['', '砍殺', '模式', '砍殺', '', ''],
    ['', 'RL', '模式', '輕度 Rogue、動作類 Rogue', '', ''],
    ['', '俯視角', '備註', '俯視視角', '', ''],
]);

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
    const deps = { fetchText: fixtureFetchText, itadApiKey: fixtureItadApiKey, now: () => today };
    const added = recordingStore();
    await addGame(appId, { ...deps, store: added.store, tagRules });
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
        `- 今天：${today.getFullYear()}/${today.getMonth() + 1}/${today.getDate()}；沒有 SteamDB 區塊（跟 SteamGifts、Sheet 上的 ↻ 一樣），最低off 只看 ITAD。`,
        '- `—`：送出欄裡表示不送、Sheet 上保持原樣（新增時就是空白）；「更新前」欄裡表示這個例子沒有設定舊值。公式欄由 server 從上一列複製，不在表內。',
        '- 模式與備註開頭的遊戲特點用使用者 2026-10-21 的範例「標籤規則」（`多人`、`動作`、`砍殺`、`RL` 寫模式，`俯視角` 寫備註），見 `test/payloads.test.ts`。',
        '- 遊戲資料來自 `packages/steam-info-scraper/test/fixtures`（Steam 2026-10-17 抓取，Reventure 與 ITAD 2026-10-20）。',
        '',
        ...sections.flatMap(section => [section, '']),
    ].join('\n');

    await expect(markdown).toMatchFileSnapshot('__snapshots__/payloads.md');
});
