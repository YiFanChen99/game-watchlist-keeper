import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Panel } from '../src/panel';

const messageLifetimeMs = 60_000;

let onClick: ReturnType<typeof vi.fn<() => void>>;
let onPlaytime: ReturnType<typeof vi.fn<() => void>>;
let panel: Panel;

const area = () => document.getElementById('EkkoSteamSheetWriter')!;
const sheetButton = () => area().querySelectorAll('button')[0]!;
const playtimeButton = () => area().querySelectorAll('button')[1]!;
const statusLine = (name: 'sheet' | 'playtime' = 'sheet') => area().querySelector<HTMLElement>(`[data-status="${name}"]`)!;

/** A status line's text; null while hidden. */
const status = (name: 'sheet' | 'playtime' = 'sheet') =>
    (statusLine(name).style.display === 'none' ? null : statusLine(name).textContent);

beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    onClick = vi.fn<() => void>();
    onPlaytime = vi.fn<() => void>();
    panel = new Panel(onClick, onPlaytime);
});

afterEach(() => {
    vi.useRealTimers();
});

describe('Panel', () => {
    it('starts checking the sheet, with the playtime button ready and no message', () => {
        expect(sheetButton().textContent).toBe('查詢 Sheet…');
        expect(sheetButton().disabled).toBe(true);
        expect(playtimeButton().textContent).toBe('時長');
        expect(playtimeButton().disabled).toBe(false);
        expect(status()).toBeNull();
        expect(status('playtime')).toBeNull();
    });

    it('labels the sheet button by state, disabled only while checking or busy', () => {
        const shown = (['add', 'update', 'error'] as const).map(kind => {
            panel.setState({ kind });
            return [sheetButton().textContent, sheetButton().disabled];
        });
        panel.setState({ kind: 'busy', label: '更新中…' });

        expect(shown).toEqual([['＋ 新增', false], ['↻ 更新', false], ['重試', false]]);
        expect(sheetButton().textContent).toBe('更新中…');
        expect(sheetButton().disabled).toBe(true);
    });

    it('calls each button its own handler', () => {
        panel.setState({ kind: 'add' });

        sheetButton().click();
        playtimeButton().click();

        expect(onClick).toHaveBeenCalledTimes(1);
        expect(onPlaytime).toHaveBeenCalledTimes(1);
    });

    it('shows … on the playtime button while it is busy', () => {
        panel.setPlaytimeBusy(true);
        expect(playtimeButton().textContent).toBe('…');
        expect(playtimeButton().disabled).toBe(true);

        panel.setPlaytimeBusy(false);
        expect(playtimeButton().textContent).toBe('時長');
        expect(playtimeButton().disabled).toBe(false);
    });

    it('hides a message after a minute, but keeps an error until clicked', () => {
        panel.setState({ kind: 'update' }, '已更新。');
        vi.advanceTimersByTime(messageLifetimeMs);
        expect(status()).toBeNull();

        panel.setState({ kind: 'error' }, 'Sheet API: internal');
        vi.advanceTimersByTime(10 * messageLifetimeMs);
        expect(status()).toBe('Sheet API: internal');

        statusLine().click();
        expect(status()).toBeNull();
    });

    it('keeps a message asked to persist outside the error state', () => {
        panel.setState({ kind: 'add' }, '商店頁讀不到「名稱」，沒有新增。', true);
        vi.advanceTimersByTime(10 * messageLifetimeMs);

        expect(status()).toBe('商店頁讀不到「名稱」，沒有新增。');
    });

    it('shows the playtime message on its own line, which hides and closes on its own', () => {
        panel.setState({ kind: 'error' }, 'Sheet API: internal');
        panel.showPlaytimeMessage('已複製：中位12H，PR84 30H。', false);
        expect(status()).toBe('Sheet API: internal');
        expect(status('playtime')).toBe('已複製：中位12H，PR84 30H。');

        vi.advanceTimersByTime(messageLifetimeMs);
        expect(status('playtime')).toBeNull();
        expect(status()).toBe('Sheet API: internal');

        panel.showPlaytimeMessage('Failed to GET reviews: 502', true);
        statusLine().click();
        expect(status()).toBeNull();
        expect(status('playtime')).toBe('Failed to GET reviews: 502');
        statusLine('playtime').click();
        expect(status('playtime')).toBeNull();
    });

    it("gives a new message its own minute, and an earlier message's timer does not hide a kept one", () => {
        panel.showMessage('已新增。', false);
        vi.advanceTimersByTime(messageLifetimeMs / 2);
        panel.showMessage('已更新。', false);
        vi.advanceTimersByTime(messageLifetimeMs / 2);
        expect(status()).toBe('已更新。');
        vi.advanceTimersByTime(messageLifetimeMs / 2);
        expect(status()).toBeNull();

        panel.showMessage('已新增。', false);
        panel.setState({ kind: 'error' }, 'offline');
        vi.advanceTimersByTime(messageLifetimeMs);
        expect(status()).toBe('offline');
    });

    it('keeps the message line on multiple lines', () => {
        panel.setState({ kind: 'update' }, '已更新。\n原價 459 → 499（+40）');

        expect(status()).toBe('已更新。\n原價 459 → 499（+40）');
        expect(statusLine().style.whiteSpace).toBe('pre-line');
    });
});
