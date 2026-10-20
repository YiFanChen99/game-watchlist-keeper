import type { PostText } from '@watchlist/core';
import { describe, expect, it, vi } from 'vitest';

import { createSheetApi, SheetApiError, SheetApiUnauthorizedError } from '../src';

const webAppUrl = 'https://script.google.com/macros/s/xxx/exec';
const token = 'a b&c';

const respond = (body: string): PostText => () => Promise.resolve(body);

/** The JSON body of each POST, parsed. */
const sentBodies = (postText: ReturnType<typeof vi.fn<PostText>>) =>
    postText.mock.calls.map(([, body]) => JSON.parse(body) as unknown);

describe('createSheetApi().fetchDump', () => {
    it('POSTs the dump action with the token in the body and returns its games', async () => {
        const postText = vi.fn(respond('{"games":[{"B":"Hades","K":3}],"labelMap":{"K":"想要"}}'));

        const dump = await createSheetApi({ webAppUrl, token, postText }).fetchDump();

        expect(postText).toHaveBeenCalledWith(webAppUrl, JSON.stringify({ token, action: 'dump' }));
        expect(dump).toEqual({ games: [{ B: 'Hades', K: 3 }], labelMap: { K: '想要' } });
    });

    it('throws SheetApiUnauthorizedError when the web app rejects the token', async () => {
        const postText = respond('{"error":"unauthorized"}');

        await expect(createSheetApi({ webAppUrl, token, postText }).fetchDump())
            .rejects.toBeInstanceOf(SheetApiUnauthorizedError);
    });

    it('rejects any other response without games', async () => {
        const postText = respond('{}');

        await expect(createSheetApi({ webAppUrl, token, postText }).fetchDump()).rejects.toThrow('no games');
    });
});

describe('createSheetApi() single rows', () => {
    it('reads the requested columns of the row with the app id', async () => {
        const postText = vi.fn(respond('{"row":12,"values":{"原價":499}}'));

        const result = await createSheetApi({ webAppUrl, token, postText }).readRow(570, ['原價', '特']);

        expect(sentBodies(postText)).toEqual([{ token, action: 'row', appId: 570, columns: ['原價', '特'] }]);
        expect(result).toEqual({ row: 12, values: { 原價: 499 } });
    });

    it('reads a row by its number', async () => {
        const postText = vi.fn(respond('{"row":12,"appId":570,"values":{"名稱":"Dota 2"},"url":"https://sheet#gid=1&range=12:12"}'));

        const result = await createSheetApi({ webAppUrl, token, postText }).readRowByNumber(12, ['名稱']);

        expect(sentBodies(postText)).toEqual([{ token, action: 'row', row: 12, columns: ['名稱'] }]);
        expect(result).toEqual({ row: 12, appId: 570, values: { 名稱: 'Dota 2' }, url: 'https://sheet#gid=1&range=12:12' });
    });

    it('finds a row, or null when the sheet has no such app id', async () => {
        expect(await createSheetApi({ webAppUrl, token, postText: respond('{"row":7,"values":{}}') }).findRow(570)).toBe(7);
        expect(await createSheetApi({ webAppUrl, token, postText: respond('{"error":"not-found"}') }).findRow(570)).toBeNull();
    });

    it('still throws other errors from findRow', async () => {
        const postText = respond('{"error":"unauthorized"}');

        await expect(createSheetApi({ webAppUrl, token, postText }).findRow(570))
            .rejects.toBeInstanceOf(SheetApiUnauthorizedError);
    });

    it('POSTs updates and appends with the token in the body', async () => {
        const postText = vi.fn(respond('{"row":30}'));
        const api = createSheetApi({ webAppUrl, token, postText });

        expect(await api.updateRow(570, { 原價: 0 })).toEqual({ row: 30 });
        expect(await api.appendRow(570, { 特: '英' })).toEqual({ row: 30 });
        expect(await api.updateRowByNumber(12, 570, { '更新日': '2026/10/18' })).toEqual({ row: 30 });

        expect(postText.mock.calls.map(([url]) => url)).toEqual([webAppUrl, webAppUrl, webAppUrl]);
        expect(sentBodies(postText)).toEqual([
            { token, action: 'update', appId: 570, values: { 原價: 0 } },
            { token, action: 'append', appId: 570, values: { 特: '英' } },
            { token, action: 'update', appId: 570, values: { '更新日': '2026/10/18' }, row: 12 },
        ]);
    });

    it('turns refusals into SheetApiError with their code', async () => {
        const postText = respond('{"error":"duplicate","message":"row 30"}');
        const api = createSheetApi({ webAppUrl, token, postText });

        const error = await api.appendRow(570, {}).catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(SheetApiError);
        expect(error).toMatchObject({ code: 'duplicate', message: 'Sheet API: duplicate: row 30' });
    });
});
