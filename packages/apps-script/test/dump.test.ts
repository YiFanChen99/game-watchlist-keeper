import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

import { describe, expect, it } from 'vitest';

import { buildDump, type CellValue } from '../src/dump';

const header: CellValue[] = ['名稱', '原價', '最低off', '上市', '評價度', '更新日', '更新距離', '', '最低$', '購買/期待度1~5', 'AnyDeal'];

/** B through L; only B, G, K and L matter. */
function row(name: CellValue, updatedOn: CellValue, want: CellValue, anyDeal: CellValue = ''): CellValue[] {
    return [name, 590, 80, '2020/1/2', 95, updatedOn, 12, '', 118, want, anyDeal];
}

const rows: CellValue[][] = [
    row('Hades / 黑帝斯', new Date(2025, 2, 4), 3),
    row('', new Date(2025, 2, 4), 3),
    row('No want', '', ''),
    row('Zero want', '', 0),
    row('Zero string want', '', '0'),
    row('Unknown want', '', '?'),
    row('Owned', '2024/1/2', 2, '已有(Steam)'),
    row('Deal number', '', 4, 50),
];

/** Run the original web app's doGet against the same cells, through stubs of the services it calls. */
function legacyDump(): unknown {
    const source = readFileSync(new URL('../original/webApi.js', import.meta.url), 'utf8');
    const ranges: Record<string, CellValue[][]> = {};
    const sheet = { getRange: (a1: string) => ({ getValues: () => ranges[a1] }) };
    const context = {
        SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => sheet }) },
        ContentService: {
            MimeType: { JSON: 'json' },
            createTextOutput: (text: string) => ({ setMimeType: () => text }),
        },
    };
    // The original checks `instanceof Date`, so dates must come from the sandbox's realm.
    const SandboxDate = runInNewContext('Date', context) as DateConstructor;
    const toSandbox = (cells: CellValue[]) => cells.map(cell => cell instanceof Date ? new SandboxDate(cell.getTime()) : cell);
    ranges['B1:L1'] = [toSandbox(header)];
    ranges['B2:L'] = rows.map(toSandbox);

    const text = runInNewContext(`${source}\ndoGet()`, context) as string;
    return JSON.parse(text);
}

describe('buildDump', () => {
    it('matches the original web app on the same cells', () => {
        expect(JSON.parse(JSON.stringify(buildDump(header, rows)))).toEqual(legacyDump());
    });

    it('keeps named rows with a want level, and replaces it with the owned mark', () => {
        const { games, labelMap } = buildDump(header, rows);

        expect(labelMap).toEqual({ B: '名稱', G: '更新日', K: '購買/期待度1~5' });
        expect(games.map(game => game.B)).toEqual(['Hades / 黑帝斯', 'Unknown want', 'Owned', 'Deal number']);
        expect(games[0]).toEqual({ B: 'Hades / 黑帝斯', G: new Date(2025, 2, 4).toDateString(), K: 3 });
        expect(games[2]?.K).toBe('已有(Steam)');
    });

    it('adds the app id each name HYPERLINK links', () => {
        const formulas = rows.map(() => '');
        formulas[0] = '=HYPERLINK("https://store.steampowered.com/app/1145360/","Hades / 黑帝斯")';
        const { games } = buildDump(header, rows, formulas);

        expect(games[0]).toEqual({ B: 'Hades / 黑帝斯', G: new Date(2025, 2, 4).toDateString(), K: 3, appId: 1145360 });
        expect(games[1]).not.toHaveProperty('appId');
    });

    // The original returned a number here, which crashed the annotator's `B.split()`.
    it('turns a numeric name into a string', () => {
        expect(buildDump(header, [row(1979, '', 5)]).games[0]?.B).toBe('1979');
    });
});
