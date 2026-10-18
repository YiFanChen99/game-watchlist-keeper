import { formatPrice, lookupPrices, type Prices } from '@watchlist/price-lookup';
import { SheetApiError } from '@watchlist/sheet-api';

import { withSheetApi } from './tampermonkey';
import { createGlyphButton, StatusBubble } from './widgets';

/** The app ids of the games a heading matches, read on each click: a ⟲ or a refetch may change them. */
export type MatchedAppIds = () => number[];

const glyph = '$';

/**
 * e.g. `$50, 史$90`: the wanted price (Ceiling), then the historical low (最低$), as userscript-itad-mail
 * shows them after the want level, which is in the annotation already.
 */
function formatPrices({ historicalLow, wanted }: Prices): string {
    return `$${formatPrice(wanted)}, 史$${formatPrice(historicalLow)}`;
}

/** A $ button plus its status bubble, for a giveaway heading matching games with app ids; the caller places both. */
export class PriceButton {
    readonly button = createGlyphButton(glyph, '查 Sheet 裡這款遊戲的史低價（最低$）與想要的價格（Ceiling）');
    private readonly bubble = new StatusBubble();
    readonly status = this.bubble.element;

    constructor(private readonly appIds: MatchedAppIds) {
        this.button.addEventListener('click', () => {
            void this.run();
        });
    }

    /** Shows e.g. `$50, 史$90`, one per matched game joined with ` / `. */
    private async run(): Promise<void> {
        this.button.disabled = true;
        this.button.textContent = '…';
        this.bubble.show('', false);
        try {
            const appIds = this.appIds();
            const prices = await withSheetApi(api => Promise.all(appIds.map(appId => lookupPrices(api, appId))));
            this.bubble.show(prices.map(formatPrices).join(' / '), false);
        } catch (error) {
            if (error instanceof SheetApiError && error.code === 'not-found') {
                // The cached dump still has a game the sheet no longer links.
                this.bubble.show('Sheet 已經沒有這個遊戲了。', true);
            } else {
                console.error('SteamGifts Annotator:', error);
                this.bubble.show(error instanceof Error ? error.message : String(error), true);
            }
        } finally {
            this.button.disabled = false;
            this.button.textContent = glyph;
        }
    }
}
