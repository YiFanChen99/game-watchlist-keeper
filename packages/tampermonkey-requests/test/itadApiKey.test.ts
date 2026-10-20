import { HttpStatusError } from '@watchlist/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createItadApiKey, fetchText, itadApiKeyKey } from '../src';

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

describe('createItadApiKey', () => {
    it('uses the saved key without asking', () => {
        store[itadApiKeyKey] = 'saved';
        expect(createItadApiKey('Test Script').get()).toBe('saved');
        expect(prompt).not.toHaveBeenCalled();
    });

    it('asks for a key, named after the script, and saves it; nothing when cancelled', () => {
        prompt.mockReturnValueOnce(' entered ').mockReturnValueOnce(null);
        expect(createItadApiKey('Test Script').get()).toBe('entered');
        expect(prompt.mock.calls[0]?.[0]).toMatch(/^Test Script: .*IsThereAnyDeal/);
        expect(store[itadApiKeyKey]).toBe('entered');

        delete store[itadApiKeyKey];
        expect(createItadApiKey('Test Script').get()).toBeUndefined();
    });

    it('forgets a key ITAD refuses, and keeps it through other failures', () => {
        const key = createItadApiKey('Test Script');
        store[itadApiKeyKey] = 'saved';

        expect(key.forgetIfRefused(null)).toBe(false);
        expect(key.forgetIfRefused(new HttpStatusError('Failed: 429', 429))).toBe(false);
        expect(key.forgetIfRefused(new Error('offline'))).toBe(false);
        expect(store[itadApiKeyKey]).toBe('saved');

        expect(key.forgetIfRefused(new HttpStatusError('Failed: 403', 403))).toBe(true);
        expect(store).not.toHaveProperty(itadApiKeyKey);
    });
});

describe('fetchText', () => {
    it('sends the extra headers, and rejects a non-2xx status with HttpStatusError', async () => {
        const request = vi.fn((details: { headers?: Record<string, string>; onload: (response: { status: number; responseText: string }) => void }) => {
            details.onload({ status: 403, responseText: '' });
        });
        vi.stubGlobal('GM_xmlhttpRequest', request);

        const failed = fetchText('https://example.com/', { 'ITAD-API-Key': 'key' });

        await expect(failed).rejects.toBeInstanceOf(HttpStatusError);
        await expect(failed).rejects.toMatchObject({ status: 403 });
        expect(request.mock.calls[0]?.[0].headers).toEqual({ 'ITAD-API-Key': 'key' });
    });
});
