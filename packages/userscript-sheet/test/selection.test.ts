import { describe, expect, it } from 'vitest';

import { parseSelectedRow, parseSheetLocation } from '../src/selection';

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
