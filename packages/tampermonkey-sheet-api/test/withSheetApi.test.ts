import { SheetApiUnauthorizedError, type SheetApi } from '@watchlist/sheet-api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createWithSheetApi, tokenKey } from '../src';

let store: Record<string, unknown>;
let prompt: ReturnType<typeof vi.fn<(message: string) => string | null>>;

beforeEach(() => {
    store = {};
    prompt = vi.fn<(message: string) => string | null>();
    vi.stubGlobal('GM_getValue', (key: string, fallback: unknown) => (key in store ? store[key] : fallback));
    vi.stubGlobal('GM_setValue', (key: string, value: unknown) => {
        store[key] = value;
    });
    vi.stubGlobal('GM_deleteValue', (key: string) => {
        delete store[key];
    });
    vi.stubGlobal('window', { prompt });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

const withSheetApi = () => createWithSheetApi('Test Script');

describe('createWithSheetApi', () => {
    it('uses the saved token without asking', async () => {
        store[tokenKey] = 'saved';
        await expect(withSheetApi()(() => Promise.resolve('ok'))).resolves.toBe('ok');
        expect(prompt).not.toHaveBeenCalled();
    });

    it('asks for a token, named after the script, and saves it', async () => {
        prompt.mockReturnValue(' entered ');
        await withSheetApi()(() => Promise.resolve());
        expect(prompt.mock.calls[0]?.[0]).toMatch(/^Test Script: /);
        expect(store[tokenKey]).toBe('entered');
    });

    it('fails without running when the prompt is cancelled', async () => {
        prompt.mockReturnValue(null);
        const run = vi.fn<(api: SheetApi) => Promise<void>>();
        await expect(withSheetApi()(run)).rejects.toThrow('沒有輸入 Sheet API 的 token');
        expect(run).not.toHaveBeenCalled();
    });

    it('forgets a rejected token and asks once more', async () => {
        store[tokenKey] = 'wrong';
        prompt.mockReturnValue('right');
        const run = vi.fn<(api: SheetApi) => Promise<string>>()
            .mockRejectedValueOnce(new SheetApiUnauthorizedError())
            .mockResolvedValueOnce('ok');
        await expect(withSheetApi()(run)).resolves.toBe('ok');
        expect(prompt).toHaveBeenCalledTimes(1);
        expect(store[tokenKey]).toBe('right');
    });

    it('gives up after the second rejected token, forgetting it too', async () => {
        prompt.mockReturnValue('still wrong');
        const run = vi.fn<(api: SheetApi) => Promise<void>>().mockRejectedValue(new SheetApiUnauthorizedError());
        await expect(withSheetApi()(run)).rejects.toBeInstanceOf(SheetApiUnauthorizedError);
        expect(run).toHaveBeenCalledTimes(2);
        expect(store).not.toHaveProperty(tokenKey);
    });
});
