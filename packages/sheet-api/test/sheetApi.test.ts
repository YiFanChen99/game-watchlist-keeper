import { describe, expect, it, vi } from 'vitest';

import { createSheetApi, SheetApiError, SheetApiUnauthorizedError } from '../src';

const webAppUrl = 'https://script.google.com/macros/s/xxx/exec';
const token = 'a b&c';
const baseUrl = `${webAppUrl}?token=a%20b%26c`;

const respond = (body: string) => () => Promise.resolve(body);

describe('createSheetApi().fetchDump', () => {
    it('GETs the web app URL with the encoded token and returns its games', async () => {
        const fetchText = vi.fn(respond('{"games":[{"B":"Hades","K":3}],"labelMap":{"K":"想要"}}'));

        const dump = await createSheetApi({ webAppUrl, token, fetchText }).fetchDump();

        expect(fetchText).toHaveBeenCalledWith(baseUrl);
        expect(dump).toEqual({ games: [{ B: 'Hades', K: 3 }], labelMap: { K: '想要' } });
    });

    it('throws SheetApiUnauthorizedError when the web app rejects the token', async () => {
        const fetchText = respond('{"error":"unauthorized"}');

        await expect(createSheetApi({ webAppUrl, token, fetchText }).fetchDump())
            .rejects.toBeInstanceOf(SheetApiUnauthorizedError);
    });

    it('rejects any other response without games', async () => {
        const fetchText = respond('{}');

        await expect(createSheetApi({ webAppUrl, token, fetchText }).fetchDump()).rejects.toThrow('no games');
    });
});

describe('createSheetApi() single rows', () => {
    it('reads the requested columns of the row with the app id', async () => {
        const fetchText = vi.fn(respond('{"row":12,"values":{"原價":499}}'));

        const result = await createSheetApi({ webAppUrl, token, fetchText }).readRow(570, ['原價', '特']);

        expect(fetchText).toHaveBeenCalledWith(`${baseUrl}&action=row&appId=570&columns=${encodeURIComponent('原價,特')}`);
        expect(result).toEqual({ row: 12, values: { 原價: 499 } });
    });

    it('reads a row by its number', async () => {
        const fetchText = vi.fn(respond('{"row":12,"appId":570,"values":{"名稱":"Dota 2"},"url":"https://sheet#gid=1&range=12:12"}'));

        const result = await createSheetApi({ webAppUrl, token, fetchText }).readRowByNumber(12, ['名稱']);

        expect(fetchText).toHaveBeenCalledWith(`${baseUrl}&action=row&row=12&columns=${encodeURIComponent('名稱')}`);
        expect(result).toEqual({ row: 12, appId: 570, values: { 名稱: 'Dota 2' }, url: 'https://sheet#gid=1&range=12:12' });
    });

    it('finds a row, or null when the sheet has no such app id', async () => {
        expect(await createSheetApi({ webAppUrl, token, fetchText: respond('{"row":7,"values":{}}') }).findRow(570)).toBe(7);
        expect(await createSheetApi({ webAppUrl, token, fetchText: respond('{"error":"not-found"}') }).findRow(570)).toBeNull();
    });

    it('still throws other errors from findRow', async () => {
        const fetchText = respond('{"error":"unauthorized"}');

        await expect(createSheetApi({ webAppUrl, token, fetchText }).findRow(570))
            .rejects.toBeInstanceOf(SheetApiUnauthorizedError);
    });

    it('POSTs updates and appends as JSON to the token URL', async () => {
        const postText = vi.fn(respond('{"row":30}'));
        const api = createSheetApi({ webAppUrl, token, fetchText: respond(''), postText });

        expect(await api.updateRow(570, { 原價: 0 })).toEqual({ row: 30 });
        expect(await api.appendRow(570, { 特: '英' })).toEqual({ row: 30 });

        expect(postText.mock.calls).toEqual([
            [baseUrl, JSON.stringify({ action: 'update', appId: 570, values: { 原價: 0 } })],
            [baseUrl, JSON.stringify({ action: 'append', appId: 570, values: { 特: '英' } })],
        ]);
    });

    it('turns refusals into SheetApiError with their code', async () => {
        const postText = respond('{"error":"duplicate","message":"row 30"}');
        const api = createSheetApi({ webAppUrl, token, fetchText: respond(''), postText });

        const error = await api.appendRow(570, {}).catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(SheetApiError);
        expect(error).toMatchObject({ code: 'duplicate', message: 'Sheet API: duplicate: row 30' });
    });

    it('cannot write without postText', async () => {
        const api = createSheetApi({ webAppUrl, token, fetchText: respond('') });

        await expect(api.updateRow(570, {})).rejects.toThrow('postText');
    });
});
