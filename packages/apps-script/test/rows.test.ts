import { Column } from '@watchlist/game-record-writer';
import { describe, expect, it } from 'vitest';

import {
    indexAppIds,
    indexHeader,
    pickValues,
    planAppend,
    planUpdate,
    RequestError,
    rowUrl,
    shiftAppIds,
} from '../src/rows';

/** A, then B through H as in the sheet; H computes 最低$. */
const columns = indexHeader(['', '名稱', '原價', '最低off', '上市', '評價度', '更新日', '最低$', ' 特 ']);

function refusal(run: () => unknown): RequestError {
    try {
        run();
    } catch (error) {
        if (error instanceof RequestError) {
            return error;
        }
        throw error;
    }
    throw new Error('expected a RequestError');
}

describe('indexHeader', () => {
    it('maps trimmed header names to 0-based columns and skips blanks', () => {
        expect(columns.get('名稱')).toBe(1);
        expect(columns.get('特')).toBe(8);
        expect(columns.has('')).toBe(false);
    });
});

describe('indexAppIds', () => {
    it('maps each linked app id to its first 1-based row', () => {
        const links = [
            '=HYPERLINK("https://store.steampowered.com/app/570/","Dota 2")',
            '',
            '=HYPERLINK("https://store.steampowered.com/app/5700/","Not Dota")',
            '=HYPERLINK("https://store.steampowered.com/app/570/","Dota 2 again")',
        ];
        expect(indexAppIds(links)).toEqual({ 570: 2, 5700: 4 });
    });
});

describe('shiftAppIds', () => {
    it('moves the rows from the inserted one down by one', () => {
        expect(shiftAppIds({ 10: 2, 20: 3, 30: 4, 40: 9 }, 4)).toEqual({ 10: 2, 20: 3, 30: 5, 40: 10 });
    });
});

describe('planUpdate', () => {
    it('writes the given cells by header name', () => {
        expect(planUpdate(columns, { [Column.originalPrice]: 499, [Column.special]: '繁' }, [])).toEqual([
            { column: 2, value: 499 },
            { column: 8, value: '繁' },
        ]);
    });

    it('refuses the name, computed and unknown columns', () => {
        expect(refusal(() => planUpdate(columns, { [Column.name]: 'x' }, [])).code).toBe('invalid');
        expect(refusal(() => planUpdate(columns, { [Column.lowestPrice]: 1 }, [])).code).toBe('invalid');
        expect(refusal(() => planUpdate(columns, { [Column.detail]: 'x' }, [])).message).toContain('no column');
    });

    it('refuses formulas and cells that hold one', () => {
        expect(refusal(() => planUpdate(columns, { [Column.special]: '=1+1' }, [])).code).toBe('invalid');
        const formulas = ['', '', '=1', '', '', '', '', '', ''];
        expect(refusal(() => planUpdate(columns, { [Column.originalPrice]: 499 }, formulas)).message).toContain('formula');
    });
});

describe('planAppend', () => {
    const template = ['', '=HYPERLINK("u","old")', '', '', '', '', '', '=round(R[0]C[-5])', ''];
    const name = '=HYPERLINK("https://store.steampowered.com/app/570/","Dota 2")';

    it('copies the formulas above except the name, then writes the given cells', () => {
        expect(planAppend(columns, { [Column.name]: name, [Column.originalPrice]: 0 }, template)).toEqual([
            { column: 7, formulaR1C1: '=round(R[0]C[-5])' },
            { column: 1, value: name },
            { column: 2, value: 0 },
        ]);
    });

    it('needs a name and refuses columns outside the allowed set', () => {
        expect(refusal(() => planAppend(columns, { [Column.originalPrice]: 0 }, template)).code).toBe('invalid');
        expect(refusal(() => planAppend(columns, { [Column.name]: name, [Column.lowestPrice]: 1 }, template)).code)
            .toBe('invalid');
    });

    it('keeps a formula above over a given value in the same column', () => {
        const computedPrice = ['', '', '=1', '', '', '', '', '', ''];
        expect(planAppend(columns, { [Column.name]: name, [Column.originalPrice]: 499 }, computedPrice)).toEqual([
            { column: 2, formulaR1C1: '=1' },
            { column: 1, value: name },
        ]);
    });
});

describe('pickValues', () => {
    it('returns the named cells, with dates formatted', () => {
        const row = ['', 'Dota 2', 0, '', new Date(2013, 6, 9), 82, '', '-', '英'];
        const formatDate = (date: Date) => `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;

        expect(pickValues(columns, [Column.originalPrice, Column.releaseDate, Column.special], row, formatDate)).toEqual({
            [Column.originalPrice]: 0,
            [Column.releaseDate]: '2013/7/9',
            [Column.special]: '英',
        });
    });
});

describe('rowUrl', () => {
    it('selects the whole row of the worksheet', () => {
        expect(rowUrl('https://docs.google.com/spreadsheets/d/abc/edit', 123, 45))
            .toBe('https://docs.google.com/spreadsheets/d/abc/edit#gid=123&range=45:45');
    });
});
