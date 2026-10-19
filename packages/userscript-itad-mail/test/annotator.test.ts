import type { SheetDumpRow } from '@watchlist/sheet-api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { annotate, findGames, type MailGame } from '../src/annotator';
import type { GameInfo, GameLookup } from '../src/sheet';
import { loadSpecialsMail } from './fixtures';

const smileForMe: SheetDumpRow = { B: 'Smile For Me', K: 4, appId: 1006660 };

const info = (overrides: Partial<GameInfo> = {}): GameInfo => ({
    want: '4',
    prices: { historicalLow: 90, historicalLowIsOutdated: false, wanted: 50 },
    url: 'https://docs.google.com/spreadsheets/d/x/edit#gid=1&range=7:7',
    ...overrides,
});

/** Matches every name to all `rows`, and answers `info` from `infos` by name. */
function fakeLookup(rows: SheetDumpRow[], infos: Record<string, GameInfo> = {}): GameLookup {
    return {
        match: () => Promise.resolve(rows),
        info: game => Promise.resolve(infos[game.B] ?? info()),
    };
}

function linkOf(name: string): HTMLAnchorElement | undefined {
    return [...document.querySelectorAll('a')].find(a => a.textContent === name);
}

/** The annotation `annotate` put after a Waitlist game's mark, e.g. ` (W4 $50, 史$90)`. */
function annotationOf(name: string): HTMLElement | null {
    const next = linkOf(name)?.nextElementSibling?.nextElementSibling;
    return next instanceof HTMLElement ? next : null;
}

/** The annotation `annotate` put right after a game's link outside the Waitlist, e.g. ` (W3)`. */
function annotationAfterLink(name: string): HTMLElement | null {
    const next = linkOf(name)?.nextElementSibling;
    return next instanceof HTMLElement && next.tagName === 'SPAN' ? next : null;
}

beforeEach(() => {
    document.body.innerHTML = loadSpecialsMail();
});

afterEach(() => {
    vi.restoreAllMocks();
});

/** The game `findGames` finds for the link named `name`. */
function findGame(name: string): MailGame {
    const game = findGames(document).find(found => found.link.textContent === name);
    if (!game) {
        throw new Error(`no game ${name}`);
    }
    return game;
}

/** Another mail of the conversation, from `sender`, linking an ITAD game. */
function addMail(sender: string): void {
    document.body.insertAdjacentHTML('beforeend', `
        <div class="adn ads" role="listitem"><div class="gs">
            <h3 class="iw"><span class="qu"><span email="${sender}" name="Friend" class="gD">Friend</span></span></h3>
            <div class="a3s aiL"><a href="https://isthereanydeal.com/game/tacoma/info/">Tacoma</a><span> in Waitlist</span></div>
        </div></div>`);
}

describe('findGames', () => {
    it('finds every game of an ITAD mail, with the in Waitlist mark of those in the Waitlist', () => {
        const games = findGames(document);
        expect(games).toHaveLength(18);
        expect(games.filter(game => game.mark).map(game => game.link.textContent)).toEqual(['Smile For Me']);
        expect(findGame('Smile For Me').mark?.textContent?.trim()).toBe('in Waitlist');
        expect(games.map(game => game.link.textContent)).toContain('Tacoma');
    });

    it('skips a game once annotated', async () => {
        await annotate(findGame('Smile For Me'), fakeLookup([smileForMe]));
        expect(findGames(document).map(game => game.link.textContent)).not.toContain('Smile For Me');
    });

    it('skips the links of a mail from anyone else, also in the same conversation', () => {
        addMail('friend@example.com');
        const games = findGames(document);
        expect(games).toHaveLength(18);
        expect(games.every(game => game.link.closest('.a3s')?.textContent?.includes('Serenity Forge'))).toBe(true);
    });

    it('skips a mail from anyone else for good', () => {
        document.querySelector('.gD')?.setAttribute('email', 'friend@example.com');
        expect(findGames(document)).toEqual([]);
        document.querySelector('.gD')?.setAttribute('email', 'specials@isthereanydeal.com');
        expect(findGames(document)).toEqual([]);
    });

    it('skips links without a sender, with one warning per scan', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        document.querySelector('.gD')?.remove();
        expect(findGames(document)).toEqual([]);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0]?.[0]).toContain('18 ITAD links');
    });
});

describe('annotate a Waitlist game', () => {
    const annotateSmileForMe = async (lookup: GameLookup) => {
        await annotate(findGame('Smile For Me'), lookup);
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

describe('annotate a game outside the Waitlist', () => {
    const tacoma: SheetDumpRow = { B: 'Tacoma', K: 3, appId: 343860 };

    const annotateTacoma = async (lookup: GameLookup) => {
        await annotate(findGame('Tacoma'), lookup);
        return annotationAfterLink('Tacoma');
    };

    it("shows the dump's want level right after the link, without reading the row", async () => {
        const info = vi.fn<GameLookup['info']>();
        const annotation = await annotateTacoma({ match: () => Promise.resolve([tacoma]), info });
        expect(annotation?.textContent).toBe(' (W3)');
        expect(info).not.toHaveBeenCalled();
    });

    it("joins several matched rows with /, and shows an owned mark as SteamGifts does", async () => {
        const owned: SheetDumpRow = { B: 'Tacoma / 塔科馬', K: '已有' };
        expect((await annotateTacoma(fakeLookup([tacoma, owned])))?.textContent).toBe(' (W3 / W-已有)');
    });

    it('shows nothing for a game the sheet lacks', async () => {
        const annotation = await annotateTacoma(fakeLookup([]));
        expect(annotation?.textContent ?? '').toBe('');
    });

    it('shows nothing when the dump cannot be read', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const annotation = await annotateTacoma({ match: () => Promise.reject(new Error('timeout')), info: vi.fn() });
        expect(annotation?.textContent ?? '').toBe('');
    });

    it('only counts more than 3 matched rows', async () => {
        const rows = [1, 2, 3, 4].map(n => ({ B: `Tacoma ${n}`, K: 1 }));
        expect((await annotateTacoma(fakeLookup(rows)))?.textContent).toBe(' (Sheet 對到 4 筆)');
    });

    it("opens the row's sheet link on a click", async () => {
        const openInTab = vi.fn();
        vi.stubGlobal('GM_openInTab', openInTab);
        const lookup = fakeLookup([tacoma], { Tacoma: info({ url: 'https://docs.google.com/x#gid=1&range=9:9' }) });
        const want = (await annotateTacoma(lookup))?.querySelector<HTMLElement>('[role="link"]');
        expect(want?.title).toBe('Tacoma\n點一下開啟 Sheet 的這一列');

        want?.click();
        await vi.waitFor(() => {
            expect(openInTab).toHaveBeenCalledWith('https://docs.google.com/x#gid=1&range=9:9', { active: true });
        });
        vi.unstubAllGlobals();
    });

    it('shows plain text for a row without an app id', async () => {
        const annotation = await annotateTacoma(fakeLookup([{ B: 'Tacoma', K: 2 }]));
        expect(annotation?.textContent).toBe(' (W2)');
        expect(annotation?.querySelector('[role="link"]')).toBeNull();
    });
});
