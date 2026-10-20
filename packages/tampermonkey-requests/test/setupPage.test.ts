// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { itadApiKeyKey, runSetupPage, setupPageUrl, tokenKey } from '../src';

let store: Record<string, unknown>;

beforeEach(() => {
    store = {};
    vi.stubGlobal('GM_getValue', (key: string, fallback: unknown) => (key in store ? store[key] : fallback));
    vi.stubGlobal('GM_setValue', (key: string, value: unknown) => {
        store[key] = value;
    });
    // As scripts/collect-pages.mjs writes it.
    document.body.innerHTML = `
        <input type="password" id="sheetApiToken">
        <input type="password" id="itadApiKey">
        <button type="button" id="save">儲存</button>
        <ul id="scripts"><li id="no-scripts">沒有偵測到腳本</li></ul>`;
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

const lines = () => Array.from(document.querySelectorAll('#scripts li'), line => line.textContent);
const input = (id: string) => document.getElementById(id) as HTMLInputElement;

describe('runSetupPage', () => {
    it('does nothing off the setup page', () => {
        expect(runSetupPage('Test Script', [tokenKey], 'https://store.steampowered.com/app/1/')).toBe(false);
        expect(lines()).toEqual(['沒有偵測到腳本']);
    });

    it('lists the script with what it has saved', () => {
        store[tokenKey] = 'saved';
        expect(runSetupPage('Test Script', [tokenKey, itadApiKeyKey], `${setupPageUrl}?x=1#top`)).toBe(true);
        expect(lines()).toEqual(['Test Script：Sheet token已存、ITAD key未存']);
    });

    it('saves what every script uses on 儲存, keeping a secret left blank, then clears the inputs', () => {
        vi.useFakeTimers();
        store[tokenKey] = 'old token';
        runSetupPage('Steam Script', [tokenKey, itadApiKeyKey], setupPageUrl);
        // A second script that only takes the token; the fake keeps one storage for both.
        runSetupPage('Mail Script', [tokenKey], setupPageUrl);
        input(itadApiKeyKey).value = ' new key ';

        document.getElementById('save')!.click();

        expect(store).toEqual({ [tokenKey]: 'old token', [itadApiKeyKey]: 'new key' });
        expect(lines()).toEqual([
            'Steam Script：已儲存（Sheet token已存、ITAD key已存）',
            'Mail Script：已儲存（Sheet token已存）',
        ]);
        expect(input(itadApiKeyKey).value).toBe(' new key ');
        vi.runAllTimers();
        expect(input(itadApiKeyKey).value).toBe('');
    });
});
