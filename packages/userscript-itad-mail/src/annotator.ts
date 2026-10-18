import { formatPrice, type Prices } from '@watchlist/price-lookup';

import type { GameInfo, SheetLookup } from './sheet';

/** Set on a game link once its annotation is added, so a rescan skips it. */
const doneAttribute = 'data-ekko-itad';

/** Text of the span ITAD puts right after a game link that is in the Waitlist. */
const waitlistMark = 'in Waitlist';

/** More matches than this are only counted, not read one row each. */
const maxReadMatches = 3;

/** A game in the Waitlist: its ITAD link and the `in Waitlist` span after it. */
export interface WaitlistGame {
    link: HTMLAnchorElement;
    mark: HTMLElement;
}

/** The Waitlist games under `root` not annotated yet. */
export function findWaitlistGames(root: ParentNode): WaitlistGame[] {
    const games: WaitlistGame[] = [];
    for (const link of root.querySelectorAll<HTMLAnchorElement>(`a[href*="isthereanydeal.com/game/"]:not([${doneAttribute}])`)) {
        const mark = link.nextElementSibling;
        if (mark instanceof HTMLElement && mark.textContent?.trim() === waitlistMark) {
            games.push({ link, mark });
        }
    }
    return games;
}

/**
 * e.g. `W4 $50, 史$90`: the want level with its wanted price (目標價), then the historical low (最低$).
 * A blank cell shows as `-`, prices that cannot be read as `?`.
 */
function formatInfo({ want, prices }: GameInfo): string {
    const price = (pick: (all: Prices) => number | null) => (prices ? formatPrice(pick(prices)) : '?');
    return `W${want || '-'} $${price(all => all.wanted)}, 史$${price(all => all.historicalLow)}`;
}

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
    Object.assign(link.style, { color: 'inherit', textDecoration: 'underline' });
    return link;
}

function createAnnotation(mark: HTMLElement): HTMLElement {
    const annotation = document.createElement('span');
    Object.assign(annotation.style, { fontSize: '12px', color: '#ffb000' });
    mark.after(annotation);
    return annotation;
}

/**
 * Put the sheet's 購買/期待度, 最低$ and 目標價 after the game's `in Waitlist`, e.g.
 * `in Waitlist (W4 $50, 史$90)`, linked to the game's sheet row; several matched rows are joined with ` / `.
 */
export async function annotate({ link, mark }: WaitlistGame, lookup: SheetLookup): Promise<void> {
    link.setAttribute(doneAttribute, '');
    const annotation = createAnnotation(mark);
    const show = (content: string | Node[], title = '') => {
        annotation.replaceChildren(' (', ...(typeof content === 'string' ? [content] : content), ')');
        annotation.title = title;
    };

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
