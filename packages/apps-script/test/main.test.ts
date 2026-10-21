import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { doGet, doPost, isAuthorized, onEdit, WantToOwned } from '../src/main';

describe('isAuthorized', () => {
    it('accepts only the exact token', () => {
        expect(isAuthorized('secret', 'secret')).toBe(true);
        expect(isAuthorized('Secret', 'secret')).toBe(false);
        expect(isAuthorized(undefined, 'secret')).toBe(false);
    });

    it('rejects everything while the token property is unset or empty', () => {
        expect(isAuthorized(undefined, null)).toBe(false);
        expect(isAuthorized('', '')).toBe(false);
    });
});

const token = 'secret';
const cachedDump = '{"games":[{"B":"Hades","K":3}],"labelMap":{}}';

/** Stubs of the Apps Script services `doGet` and `doPost` reach before they touch the sheet. */
beforeEach(() => {
    vi.stubGlobal('ContentService', {
        MimeType: { JSON: 'json' },
        createTextOutput: (text: string) => ({ setMimeType: () => ({ getContent: () => text }) }),
    });
    vi.stubGlobal('PropertiesService', {
        getScriptProperties: () => ({ getProperty: (name: string) => (name === 'API_TOKEN' ? token : null) }),
    });
    // A dump cache hit, stored as one chunk, through a codec that leaves text as it is.
    const stored: Record<string, string> = { 'dump:v2:n': '1', 'dump:v2:0': cachedDump };
    vi.stubGlobal('CacheService', {
        getScriptCache: () => ({
            get: (key: string) => stored[key] ?? null,
            getAll: (keys: string[]) => Object.fromEntries(keys.filter(key => key in stored).map(key => [key, stored[key]])),
        }),
    });
    vi.stubGlobal('Utilities', {
        base64Decode: (text: string) => text,
        newBlob: (text: string) => ({ getDataAsString: () => text }),
        ungzip: (blob: unknown) => blob,
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

function post(body: unknown, parameter: Record<string, string> = {}): unknown {
    const contents = typeof body === 'string' ? body : JSON.stringify(body);
    const event = { parameter, postData: { contents } } as unknown as GoogleAppsScript.Events.DoPost;
    return JSON.parse((doPost(event) as unknown as { getContent(): string }).getContent());
}

describe('doGet', () => {
    it('refuses every request as invalid, so an old userscript keeps its saved token', () => {
        const output = doGet() as unknown as { getContent(): string };

        expect(JSON.parse(output.getContent())).toMatchObject({ error: 'invalid' });
    });
});

describe('doPost', () => {
    it('dispatches on the action once the token in the body matches', () => {
        expect(post({ token, action: 'dump' })).toEqual(JSON.parse(cachedDump));
    });

    it('refuses a missing or wrong token in the body', () => {
        expect(post({ action: 'dump' })).toMatchObject({ error: 'unauthorized' });
        expect(post({ token: 'wrong', action: 'dump' })).toMatchObject({ error: 'unauthorized' });
    });

    it('ignores a token in the query', () => {
        expect(post({ action: 'dump' }, { token })).toMatchObject({ error: 'unauthorized' });
    });

    it('checks the token before the action', () => {
        expect(post({ action: 'nope' })).toMatchObject({ error: 'unauthorized' });
        expect(post({ token, action: 'nope' })).toMatchObject({ error: 'invalid' });
    });

    it('refuses a body that is not a JSON object', () => {
        expect(post('token=secret')).toMatchObject({ error: 'invalid' });
        expect(post([token])).toMatchObject({ error: 'invalid' });
    });

    it('refuses columns that are not an array of names', () => {
        expect(post({ token, action: 'row', appId: 570, columns: '名稱,特' })).toMatchObject({ error: 'invalid' });
    });
});

describe('find', () => {
    const tagRules = [['', '輸出', '目標欄'], ['', '多人', '模式']];
    let hasTagRuleSheet: boolean;
    const readTagRuleSheet = vi.fn(() => tagRules);

    /** A sheet whose only game, Dota 2, is in row 2, and a working cache. */
    beforeEach(() => {
        hasTagRuleSheet = true;
        const stored: Record<string, string> = {};
        vi.stubGlobal('CacheService', {
            getScriptCache: () => ({
                get: (key: string) => stored[key] ?? null,
                getAll: (keys: string[]) => Object.fromEntries(keys.filter(key => key in stored).map(key => [key, stored[key]])),
                putAll: (values: Record<string, string>) => Object.assign(stored, values),
                remove: (key: string) => delete stored[key],
            }),
        });
        vi.stubGlobal('Utilities', {
            base64Encode: (text: string) => text,
            base64Decode: (text: string) => text,
            gzip: (blob: unknown) => blob,
            ungzip: (blob: unknown) => blob,
            newBlob: (text: string) => ({ getDataAsString: () => text, getBytes: () => text }),
        });
        const steam = {
            getLastColumn: () => 1,
            getLastRow: () => 2,
            getRange: () => ({
                getValues: () => [['名稱']],
                getFormulas: () => [['=HYPERLINK("https://store.steampowered.com/app/570/","Dota 2")']],
            }),
        };
        const tagRuleSheet = { getSheetId: () => 143895865, getDataRange: () => ({ getDisplayValues: readTagRuleSheet }) };
        const otherSheet = { getSheetId: () => 7 };
        vi.stubGlobal('SpreadsheetApp', {
            getActiveSpreadsheet: () => ({
                getSheetByName: (name: string) => (name === 'STEAM' ? steam : null),
                getSheets: () => [otherSheet, ...hasTagRuleSheet ? [tagRuleSheet] : []],
            }),
        });
        readTagRuleSheet.mockClear();
    });

    it('answers the row alone when the sheet has the app id', () => {
        expect(post({ token, action: 'find', appId: 570 })).toEqual({ row: 2 });
        expect(readTagRuleSheet).not.toHaveBeenCalled();
    });

    it('sends the tag rules worksheet without a row, cached until a hand edit', () => {
        expect(post({ token, action: 'find', appId: 1 })).toEqual({ row: null, tagRules });
        expect(post({ token, action: 'find', appId: 2 })).toEqual({ row: null, tagRules });
        expect(readTagRuleSheet).toHaveBeenCalledTimes(1);

        onEdit();
        post({ token, action: 'find', appId: 1 });
        expect(readTagRuleSheet).toHaveBeenCalledTimes(2);
    });

    it('sends null rules without the worksheet', () => {
        hasTagRuleSheet = false;

        expect(post({ token, action: 'find', appId: 1 })).toEqual({ row: null, tagRules: null });
    });

    it('refuses a bad app id', () => {
        expect(post({ token, action: 'find', appId: 'x' })).toMatchObject({ error: 'invalid' });
    });
});

describe('WantToOwned', () => {
    it('keeps the original output layout', () => {
        const record = ['=HYPERLINK(...)', 1, 2, 3, '2020/1/2', 5, 6, 7, 8, 9, 10, 'AnyDeal', 'Spec', 'Note'];

        expect(WantToOwned([record])).toEqual([[
            '=HYPERLINK(...)', undefined, 'AnyDeal', undefined, undefined, undefined, 'O', '2020/1/2，Spec，Note',
        ]]);
    });
});
