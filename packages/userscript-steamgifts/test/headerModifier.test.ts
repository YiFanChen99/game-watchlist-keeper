import { Column } from '@watchlist/game-record-writer';
import { SheetApiError, type SheetApi } from '@watchlist/sheet-api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HeaderModifier, type OnResync } from '../src/domModifier';
import { refreshRow } from '../src/refresh';
import type { OnRefreshed } from '../src/refreshButton';
import type { SheetData, SheetGame } from '../src/types';
import { annotationText, buttonOf, giveawayPage, listPage, shownMessages } from './pages';

const api = { readRow: vi.fn<SheetApi['readRow']>() };

vi.mock('../src/tampermonkey', () => ({
    withSheetApi: <T>(run: (sheetApi: SheetApi) => Promise<T>) => run(api as unknown as SheetApi),
    fetchText: vi.fn(),
}));

vi.mock('../src/refresh', () => ({ refreshRow: vi.fn() }));

const tacomaUrl = 'https://store.steampowered.com/app/343860/Tacoma/';
const bundleUrl = 'https://store.steampowered.com/sub/1234/';

const today = new Date().toDateString();
const longAgo = new Date(2019, 4, 1).toDateString();

const sheetData = (games: SheetGame[]): SheetData => ({ games, labelMap: {}, time: Date.now() });

let onRefreshed: ReturnType<typeof vi.fn<OnRefreshed>>;
let onResync: ReturnType<typeof vi.fn<OnResync>>;

/** A modifier for `games`, after its page was set up. */
function modifierFor(games: SheetGame[]): HeaderModifier {
    return new HeaderModifier(sheetData(games), onRefreshed, onResync);
}

beforeEach(() => {
    onRefreshed = vi.fn<OnRefreshed>();
    onResync = vi.fn<OnResync>().mockResolvedValue(undefined);
});

afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
});

describe('HeaderModifier matching', () => {
    it("matches the game whose name links the giveaway's app id before matching names", () => {
        document.body.innerHTML = listPage([{ name: 'Tacoma', steamUrl: tacomaUrl }]);
        const modifier = modifierFor([
            { B: '塔科馬', K: 3, G: today, appId: 343860 },
            { B: 'Tacoma', K: 1, G: today },
        ]);
        expect(modifier.modifyGiveaways()).toBe(1);
        expect(annotationText('Tacoma')).toBe(' (W3) ⟲');
    });

    it('falls back to the name for a bundle, and for an app id no name links', () => {
        document.body.innerHTML = listPage([
            { name: 'Emotional Impact Bundle', steamUrl: bundleUrl },
            { name: 'Tacoma', steamUrl: tacomaUrl },
        ]);
        modifierFor([
            { B: 'Emotional Impact Bundle', K: 2, G: today },
            { B: 'Tacoma / 塔科馬', K: 1, G: today },
        ]).modifyGiveaways();
        expect(annotationText('Emotional Impact Bundle')).toBe(' (W2) ⟲');
        expect(annotationText('Tacoma')).toBe(' (W1) ⟲');
    });

    it('joins the want levels of several matched games, and shows an owned mark', () => {
        document.body.innerHTML = listPage([{ name: 'LISA' }, { name: 'Gone Home' }]);
        modifierFor([
            { B: 'LISA: The Joyful', K: 3, G: today },
            { B: 'LISA: The Painful', K: 2, G: today },
            { B: 'Gone Home', K: '已有', G: today },
        ]).modifyGiveaways();
        expect(annotationText('LISA')).toBe(' (W3/2) ⟲');
        expect(annotationText('Gone Home')).toBe(' (W-已有) ⟲');
    });

    it('marks a giveaway no game matches, and does not count it', () => {
        document.body.innerHTML = listPage([{ name: 'Paratopic', steamUrl: tacomaUrl }]);
        expect(modifierFor([]).modifyGiveaways()).toBe(0);
        expect(annotationText('Paratopic')).toBe(' (無) ⟲');
    });

    it('annotates the giveaway page heading too', () => {
        document.body.innerHTML = giveawayPage({ name: 'Tacoma', steamUrl: tacomaUrl });
        expect(modifierFor([{ B: 'Tacoma', K: 3, G: today, appId: 343860 }]).modifyGiveaway()).toBe(true);
        expect(annotationText('Tacoma')).toBe(' (W3) ⟲');
    });

    it('replaces its annotation when run again', () => {
        document.body.innerHTML = listPage([{ name: 'Tacoma', steamUrl: tacomaUrl }]);
        const modifier = modifierFor([{ B: 'Tacoma', K: 3, G: today, appId: 343860 }]);
        modifier.modifyGiveaways();
        modifier.useSheetData(sheetData([{ B: 'Tacoma', K: 5, G: today, appId: 343860 }]));
        modifier.modifyGiveaways();
        expect(document.querySelectorAll('.ekko-annotation')).toHaveLength(1);
        expect(annotationText('Tacoma')).toBe(' (W5) ⟲');
    });
});

describe('HeaderModifier year mark and buttons', () => {
    const annotateTacoma = (game: Partial<SheetGame>, steamUrl: string = tacomaUrl) => {
        document.body.innerHTML = listPage([{ name: 'Tacoma', steamUrl }]);
        modifierFor([{ B: 'Tacoma', K: 3, appId: 343860, ...game }]).modifyGiveaways();
        return annotationText('Tacoma');
    };

    it('marks an update more than 3 years ago, or none, with a ↻ inside', () => {
        expect(annotateTacoma({ G: longAgo })).toBe(' (W3) (Y19↻) ⟲');
        expect(annotateTacoma({ G: '' })).toBe(' (W3) (Y-↻) ⟲');
        expect(annotateTacoma({ G: today })).toBe(' (W3) ⟲');
    });

    it('leaves the ↻ out for a bundle, which has no app id', () => {
        expect(annotateTacoma({ G: longAgo }, bundleUrl)).toBe(' (W3) (Y19) ⟲');
    });

    it('gives a want level of 4 or 5 a magnifier instead of a ↻', () => {
        expect(annotateTacoma({ K: 4, G: longAgo })).toBe(' (W4) (Y19) ⟲');
        expect(document.querySelector('.ekko-annotation button svg')).not.toBeNull();
        expect(annotateTacoma({ K: 3, G: longAgo })).toBe(' (W3) (Y19↻) ⟲');
        expect(document.querySelector('.ekko-annotation button svg')).toBeNull();
    });

    it('has no ↻ when any matched game has a want level of 4 or 5', () => {
        document.body.innerHTML = listPage([{ name: 'LISA', steamUrl: tacomaUrl }]);
        modifierFor([
            { B: 'LISA: The Joyful', K: 3, G: longAgo },
            { B: 'LISA: The Painful', K: 5, G: longAgo },
        ]).modifyGiveaways();
        expect(annotationText('LISA')).toBe(' (W3/5) (Y19) ⟲');
    });
});

describe('HeaderModifier ↻', () => {
    beforeEach(() => {
        document.body.innerHTML = listPage([{ name: 'Tacoma', steamUrl: tacomaUrl }]);
        modifierFor([{ B: 'Tacoma', K: 3, G: longAgo, appId: 343860 }]).modifyGiveaways();
    });

    it('refreshes the row, reports the changes and the written date', async () => {
        vi.mocked(refreshRow).mockResolvedValue({
            name: 'Tacoma',
            changes: [{ column: Column.originalPrice, oldValue: 459, newValue: 499, delta: 40 }],
        });
        buttonOf('Tacoma', '↻')?.click();
        await vi.waitFor(() => {
            expect(shownMessages()).toEqual([`已更新。\n${Column.originalPrice} 459 → 499（+40）`]);
        });
        expect(refreshRow).toHaveBeenCalledWith(343860, expect.any(Date));
        expect(onRefreshed).toHaveBeenCalledWith('Tacoma', expect.any(Date));
    });

    it('only tells when the sheet has no row for it', async () => {
        vi.mocked(refreshRow).mockRejectedValue(new SheetApiError('not-found', 'no row'));
        buttonOf('Tacoma', '↻')?.click();
        await vi.waitFor(() => {
            expect(shownMessages()).toEqual(['Sheet 沒有這個遊戲，要新增請到 Steam 商店頁。']);
        });
        expect(onRefreshed).not.toHaveBeenCalled();
    });
});

describe('HeaderModifier 🔍', () => {
    it("shows the wanted price and historical low of the matched games with a want level of 4 or 5", async () => {
        document.body.innerHTML = listPage([{ name: 'LISA', steamUrl: tacomaUrl }]);
        modifierFor([
            { B: 'LISA: The Joyful', K: 4, G: today, appId: 1 },
            { B: 'LISA: The Painful', K: 3, G: today, appId: 2 },
            { B: 'LISA: The First', K: 5, G: today, appId: 3 },
        ]).modifyGiveaways();
        api.readRow.mockImplementation(appId => Promise.resolve({
            row: appId,
            values: { [Column.lowestPrice]: appId === 1 ? 90 : '!120', 目標價: 50 },
        }));
        document.querySelector<HTMLButtonElement>('.ekko-annotation button:has(svg)')?.click();
        await vi.waitFor(() => {
            expect(shownMessages()).toEqual(['$50, 史$90 / $50, 史$!120']);
        });
        expect(api.readRow.mock.calls.map(([appId]) => appId)).toEqual([1, 3]);
    });
});

describe('HeaderModifier ⟲', () => {
    const resync = async (name: string) => {
        buttonOf(name, '⟲')?.click();
        await vi.waitFor(() => {
            expect(shownMessages()).not.toEqual([]);
        });
        return shownMessages();
    };

    it("refetches the row of the giveaway's app id when a game links it", async () => {
        document.body.innerHTML = listPage([{ name: 'Tacoma', steamUrl: tacomaUrl }]);
        modifierFor([{ B: '塔科馬', K: 3, G: today, appId: 343860 }]).modifyGiveaways();
        expect(await resync('Tacoma')).toEqual(['已重新讀取。']);
        expect(onResync).toHaveBeenCalledWith(343860);
    });

    it('refetches the whole sheet for a game matched by name only, or a bundle', async () => {
        document.body.innerHTML = listPage([
            { name: 'Tacoma', steamUrl: tacomaUrl },
            { name: 'Emotional Impact Bundle', steamUrl: bundleUrl },
        ]);
        modifierFor([
            { B: 'Tacoma', K: 3, G: today },
            { B: 'Emotional Impact Bundle', K: 2, G: today },
        ]).modifyGiveaways();
        await resync('Tacoma');
        await resync('Emotional Impact Bundle');
        expect(onResync.mock.calls).toEqual([[null], [null]]);
    });

    it('reads the row of an app id nothing matches, and says why it still does not match', async () => {
        document.body.innerHTML = listPage([{ name: 'Tacoma', steamUrl: tacomaUrl }]);
        modifierFor([]).modifyGiveaways();
        expect(await resync('Tacoma')).toEqual(['Sheet 裡這款遊戲的期待度是空白或 0，不標註。']);
        expect(onResync).toHaveBeenCalledWith(343860);
    });

    it('says the sheet lacks the game on not-found', async () => {
        document.body.innerHTML = listPage([{ name: 'Tacoma', steamUrl: tacomaUrl }]);
        onResync.mockRejectedValue(new SheetApiError('not-found', 'no row'));
        modifierFor([]).modifyGiveaways();
        expect(await resync('Tacoma')).toEqual(['Sheet 沒有這個遊戲，要新增請到 Steam 商店頁。']);
    });
});
