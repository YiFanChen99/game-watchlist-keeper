import { formatHistoricalLow, formatPrice, type Prices } from '@watchlist/price-lookup';
import type { SheetDumpRow } from '@watchlist/sheet-api';

import type { GameInfo, GameLookup } from './sheet';

/** Set on a game link once it is annotated or skipped, so a rescan passes it by. */
const doneAttribute = 'data-ekko-itad';

/** Text of the span ITAD puts right after a game link that is in the Waitlist. */
const waitlistMark = 'in Waitlist';

/** The sender of the mails to annotate: ITAD sends from e.g. `specials@isthereanydeal.com`. */
const itadSender = /@isthereanydeal\.com$/i;

/** Gmail's sender name in a mail's heading; its `email` attribute holds the address. */
const senderSelector = '.gD[email]';

/** More matches than this are only counted, not read one row each. */
const maxReadMatches = 3;

/** A game in an ITAD mail: its ITAD link, and the `in Waitlist` span after it when it is in the Waitlist. */
export interface MailGame {
    link: HTMLAnchorElement;
    mark: HTMLElement | null;
}

/**
 * The sender address of the mail `link` is in: the sender of the nearest enclosing element that
 * holds one, which is the link's own mail even in a conversation of several mails.
 * null when no enclosing element has a sender, e.g. after Gmail changed its page.
 */
function senderOf(link: HTMLElement): string | null {
    for (let element = link.parentElement; element; element = element.parentElement) {
        const sender = element.querySelector(senderSelector);
        if (sender) {
            return sender.getAttribute('email');
        }
    }
    return null;
}

/**
 * The games under `root` not annotated yet, in mails ITAD sent. Links in other mails are marked
 * so a rescan skips them, as are links whose sender cannot be found, with one warning per scan.
 */
export function findGames(root: ParentNode): MailGame[] {
    const games: MailGame[] = [];
    let withoutSender = 0;
    for (const link of root.querySelectorAll<HTMLAnchorElement>(`a[href*="isthereanydeal.com/game/"]:not([${doneAttribute}])`)) {
        const sender = senderOf(link);
        if (sender === null || !itadSender.test(sender)) {
            link.setAttribute(doneAttribute, '');
            withoutSender += sender === null ? 1 : 0;
            continue;
        }
        const next = link.nextElementSibling;
        const mark = next instanceof HTMLElement && next.textContent?.trim() === waitlistMark ? next : null;
        games.push({ link, mark });
    }
    if (withoutSender) {
        console.warn(`ITAD Mail Annotator: no sender (${senderSelector}) found for ${withoutSender} ITAD links, skipped; has Gmail changed its page?`);
    }
    return games;
}

/**
 * e.g. `W4 $50, 史$90`: the want level with its wanted price (目標價), then the historical low (最低$).
 * A blank cell shows as `-`, prices that cannot be read as `?`, an outdated historical low as `史$!90`.
 */
function formatInfo({ want, prices }: GameInfo): string {
    const show = (format: (all: Prices) => string) => (prices ? format(prices) : '?');
    return `W${want || '-'} $${show(all => formatPrice(all.wanted))}, 史$${show(formatHistoricalLow)}`;
}

/** e.g. `W3`; a dump's owned mark in place of the want level as `W-已有`, as the SteamGifts annotation shows it. */
function formatWant(game: SheetDumpRow): string {
    const want = String(game.K);
    return `${/^(\d|$)/.test(want) ? 'W' : 'W-'}${want}`;
}

const sheetLinkStyle = { color: 'inherit', textDecoration: 'underline', cursor: 'pointer' };

/** One matched game: a link to its sheet row when there is one, else plain text. */
function renderInfo(info: GameInfo, sheetName: string): Node {
    if (!info.url) {
        const text = document.createElement('span');
        text.textContent = formatInfo(info);
        text.title = sheetName;
        return text;
    }
    const link = document.createElement('a');
    link.href = info.url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = formatInfo(info);
    link.title = `${sheetName}\n點一下開啟 Sheet 的這一列`;
    Object.assign(link.style, sheetLinkStyle);
    return link;
}

/**
 * One matched game outside the Waitlist: its want level from the dump. With an app id, a click reads
 * the row's link and opens it, so annotating reads no row.
 */
function renderWant(game: SheetDumpRow, lookup: GameLookup): Node {
    const want = document.createElement('span');
    want.textContent = formatWant(game);
    want.title = game.B;
    if (game.appId === undefined) {
        return want;
    }
    want.title = `${game.B}\n點一下開啟 Sheet 的這一列`;
    want.setAttribute('role', 'link');
    Object.assign(want.style, sheetLinkStyle);
    want.addEventListener('click', () => {
        lookup.info(game).then(({ url }) => {
            if (url) {
                GM_openInTab(url, { active: true });
            }
        }).catch((error: unknown) => {
            console.error('ITAD Mail Annotator:', error);
            want.title = `${game.B}\n讀取失敗：${error instanceof Error ? error.message : String(error)}`;
        });
    });
    return want;
}

function createAnnotation(after: HTMLElement): HTMLElement {
    const annotation = document.createElement('span');
    Object.assign(annotation.style, { fontSize: '12px', color: '#ffb000' });
    after.after(annotation);
    return annotation;
}

type Show = (content: string | Node[], title?: string) => void;

/**
 * A Waitlist game: put the sheet's 購買/期待度, 最低$ and 目標價 after its `in Waitlist`, e.g.
 * `in Waitlist (W4 $50, 史$90)`, linked to the game's sheet row; several matched rows are joined with ` / `.
 */
async function annotateWaitlistGame(link: HTMLAnchorElement, show: Show, lookup: GameLookup): Promise<void> {
    show('讀取 Sheet…');
    try {
        const games = await lookup.match(link.textContent ?? '');
        if (!games.length) {
            show('Sheet 對不到', 'Sheet 沒有這個名稱，或它的購買/期待度是空白或 0');
            return;
        }
        if (games.length > maxReadMatches) {
            show(`Sheet 對到 ${games.length} 筆`, games.map(game => game.B).join('\n'));
            return;
        }
        const infos = await Promise.all(games.map(game => lookup.info(game)));
        show(infos.flatMap((info, index) => [
            ...(index ? [document.createTextNode(' / ')] : []),
            renderInfo(info, games[index]?.B ?? ''),
        ]));
    } catch (error) {
        console.error('ITAD Mail Annotator:', error);
        show('讀取失敗', error instanceof Error ? error.message : String(error));
    }
}

/**
 * A game outside the Waitlist: only when the sheet has it, put its want level from the dump after
 * the link, e.g. `Tacoma (W3)`; several matched rows as `(W3 / W1)`. A mail may list dozens of such
 * games, so nothing shows while loading, for a game the sheet lacks, or when the dump cannot be read.
 */
async function annotateOtherGame(link: HTMLAnchorElement, show: Show, lookup: GameLookup): Promise<void> {
    try {
        const games = await lookup.match(link.textContent ?? '');
        if (games.length > maxReadMatches) {
            show(`Sheet 對到 ${games.length} 筆`, games.map(game => game.B).join('\n'));
        } else if (games.length) {
            show(games.flatMap((game, index) => [
                ...(index ? [document.createTextNode(' / ')] : []),
                renderWant(game, lookup),
            ]));
        }
    } catch (error) {
        console.error('ITAD Mail Annotator:', error);
    }
}

/** Annotate a game found by `findGames`: a Waitlist game after its mark, any other after its link. */
export async function annotate({ link, mark }: MailGame, lookup: GameLookup): Promise<void> {
    link.setAttribute(doneAttribute, '');
    const annotation = createAnnotation(mark ?? link);
    const show: Show = (content, title = '') => {
        annotation.replaceChildren(' (', ...(typeof content === 'string' ? [content] : content), ')');
        annotation.title = title;
    };
    await (mark ? annotateWaitlistGame(link, show, lookup) : annotateOtherGame(link, show, lookup));
}
