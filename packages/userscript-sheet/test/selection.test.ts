import { describe, expect, it } from 'vitest';

import { parseSelectedRow, parseSheetLocation, showsRefreshButton, watchlistSheetGid } from '../src/selection';

describe('parseSelectedRow', () => {
    it('reads the row of a cell, a range within one row, or a whole row', () => {
        expect(parseSelectedRow('B123')).toBe(123);
        expect(parseSelectedRow(' $C$7 ')).toBe(7);
        expect(parseSelectedRow('A5:K5')).toBe(5);
        expect(parseSelectedRow('5:5')).toBe(5);
    });

    it('refuses several rows, whole columns and named ranges', () => {
        expect(parseSelectedRow('A5:K6')).toBeNull();
        expect(parseSelectedRow('3:9')).toBeNull();
        expect(parseSelectedRow('B:B')).toBeNull();
        expect(parseSelectedRow('Prices')).toBeNull();
        expect(parseSelectedRow('')).toBeNull();
    });
});

describe('parseSheetLocation', () => {
    it('reads the spreadsheet id and the worksheet gid', () => {
        expect(parseSheetLocation('https://docs.google.com/spreadsheets/d/abc-D_1/edit#gid=42&range=12:12'))
            .toEqual({ spreadsheetId: 'abc-D_1', gid: '42' });
        expect(parseSheetLocation('https://docs.google.com/spreadsheets/d/abc/edit?gid=0#gid=0'))
            .toEqual({ spreadsheetId: 'abc', gid: '0' });
    });

    it('leaves gid null when the URL has none, and refuses other URLs', () => {
        expect(parseSheetLocation('https://docs.google.com/spreadsheets/d/abc/edit')).toEqual({ spreadsheetId: 'abc', gid: null });
        expect(parseSheetLocation('https://docs.google.com/document/d/abc/edit')).toBeNull();
    });
});

describe('showsRefreshButton', () => {
    const on = (spreadsheetId: string, gid: string | null) => ({ spreadsheetId, gid });

    it('shows on the game list worksheet of the known spreadsheet only', () => {
        expect(showsRefreshButton(on('abc', watchlistSheetGid), 'abc')).toBe(true);
        expect(showsRefreshButton(on('abc', '0'), 'abc')).toBe(false);
        expect(showsRefreshButton(on('other', watchlistSheetGid), 'abc')).toBe(false);
    });

    it('shows on that worksheet of any spreadsheet until a refresh learns which one', () => {
        expect(showsRefreshButton(on('abc', watchlistSheetGid), '')).toBe(true);
        expect(showsRefreshButton(on('abc', '0'), '')).toBe(false);
    });

    it('hides while the URL names no worksheet, and off spreadsheets', () => {
        expect(showsRefreshButton(on('abc', null), 'abc')).toBe(false);
        expect(showsRefreshButton(null, '')).toBe(false);
    });
});
