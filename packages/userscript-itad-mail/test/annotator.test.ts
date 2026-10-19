import type { SheetDumpRow } from '@watchlist/sheet-api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { annotate, findWaitlistGames } from '../src/annotator';
import type { GameInfo, GameLookup } from '../src/sheet';
import { loadSpecialsMail } from './fixtures';

const smileForMe: SheetDumpRow = { B: 'Smile For Me', K: 4, appId: 1006660 };

const info = (overrides: Partial<GameInfo> = {}): GameInfo => ({
    want: '4',
    prices: { historicalLow: 90, historicalLowIsOutdated: false, wanted: 50 },
    url: 'https://docs.google.com/spreadsheets/d/x/edit#gid=1&range=7:7',
    ...overrides,
});

/** Matches names exactly against `rows`, and answers `info` from `infos` by name. */
function fakeLookup(rows: SheetDumpRow[], infos: Record<string, GameInfo> = {}): GameLookup {
    return {
        match: name => Promise.resolve(rows.filter(row => row.B === name)),
        info: game => Promise.resolve(infos[game.B] ?? info()),
    };
}

/** The annotation `annotate` put after the game's mark, e.g. ` (W4 $50, 史$90)`. */
function annotationOf(name: string): HTMLElement | null {
    const link = [...document.querySelectorAll('a')].find(a => a.textContent === name);
    const next = link?.nextElementSibling?.nextElementSibling;
    return next instanceof HTMLElement ? next : null;
}

beforeEach(() => {
    document.body.innerHTML = loadSpecialsMail();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('findWaitlistGames', () => {
    it('finds only the games marked in Waitlist', () => {
        const games = findWaitlistGames(document);
        expect(games.map(game => game.link.textContent)).toEqual(['Smile For Me']);
        expect(games[0]?.mark.textContent?.trim()).toBe('in Waitlist');
    });

    it('skips a game once annotated', async () => {
        const [game] = findWaitlistGames(document);
        await annotate(game!, fakeLookup([smileForMe]));
        expect(findWaitlistGames(document)).toEqual([]);
    });
});

describe('annotate', () => {
    const annotateSmileForMe = async (lookup: GameLookup) => {
        const [game] = findWaitlistGames(document);
        await annotate(game!, lookup);
        return annotationOf('Smile For Me');
    };

    it('shows the want level and prices, linked to the sheet row', async () => {
        const annotation = await annotateSmileForMe(fakeLookup([smileForMe]));
        expect(annotation?.textContent).toBe(' (W4 $50, 史$90)');
        const link = annotation?.querySelector('a');
        expect(link?.href).toBe(info().url);
        expect(link?.target).toBe('_blank');
    });

    it('marks an outdated historical low and shows blank cells as -', async () => {
        const annotation = await annotateSmileForMe(fakeLookup([smileForMe], {
            'Smile For Me': info({ want: '', prices: { historicalLow: 90, historicalLowIsOutdated: true, wanted: null } }),
        }));
        expect(annotation?.textContent).toBe(' (W- $-, 史$!90)');
    });

    it('shows plain text without prices for a row without an app id', async () => {
        const annotation = await annotateSmileForMe(fakeLookup([smileForMe], {
            'Smile For Me': info({ prices: null, url: null }),
        }));
        expect(annotation?.textContent).toBe(' (W4 $?, 史$?)');
        expect(annotation?.querySelector('a')).toBeNull();
    });

    it('joins several matched rows with /', async () => {
        const deluxe: SheetDumpRow = { B: 'Smile For Me', K: 2, appId: 2 };
        const lookup: GameLookup = {
            match: () => Promise.resolve([smileForMe, deluxe]),
            info: game => Promise.resolve(info({ want: String(game.K) })),
        };
        expect((await annotateSmileForMe(lookup))?.textContent).toBe(' (W4 $50, 史$90 / W2 $50, 史$90)');
    });

    it('only counts more than 3 matched rows, without reading them', async () => {
        const rows = [1, 2, 3, 4].map(n => ({ B: `Smile For Me ${n}`, K: 1 }));
        const info = vi.fn<GameLookup['info']>();
        const annotation = await annotateSmileForMe({ match: () => Promise.resolve(rows), info });
        expect(annotation?.textContent).toBe(' (Sheet 對到 4 筆)');
        expect(annotation?.title).toBe(rows.map(row => row.B).join('\n'));
        expect(info).not.toHaveBeenCalled();
    });

    it('says so when no row matches', async () => {
        expect((await annotateSmileForMe(fakeLookup([])))?.textContent).toBe(' (Sheet 對不到)');
    });

    it('shows a failed read, with the error as its title', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const annotation = await annotateSmileForMe({
            match: () => Promise.reject(new Error('沒有輸入 Sheet API 的 token')),
            info: vi.fn(),
        });
        expect(annotation?.textContent).toBe(' (讀取失敗)');
        expect(annotation?.title).toBe('沒有輸入 Sheet API 的 token');
    });
});
