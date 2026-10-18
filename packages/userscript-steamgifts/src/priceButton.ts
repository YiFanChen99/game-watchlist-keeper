import { formatPrice, lookupPrices, type Prices } from '@watchlist/price-lookup';
import { SheetApiError } from '@watchlist/sheet-api';

import { withSheetApi } from './tampermonkey';
import { createGlyphButton, StatusBubble } from './widgets';

/** The app ids to look up, read on each click: a ⟲ or a refetch may change the heading's games. */
export type MatchedAppIds = () => number[];

const svgNamespace = 'http://www.w3.org/2000/svg';

/**
 * A line magnifier in the text colour, about a letter high. Drawn as SVG because the 🔍 character
 * renders as a colour emoji on Windows, even with a text presentation selector.
 */
function createMagnifierIcon(): SVGSVGElement {
    const svg = document.createElementNS(svgNamespace, 'svg');
    const attributes = {
        viewBox: '0 0 16 16', width: '0.85em', height: '0.85em', fill: 'none',
        stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round',
    };
    for (const [name, value] of Object.entries(attributes)) {
        svg.setAttribute(name, value);
    }
    svg.style.verticalAlign = '-0.08em';
    const lens = document.createElementNS(svgNamespace, 'circle');
    lens.setAttribute('cx', '6.5');
    lens.setAttribute('cy', '6.5');
    lens.setAttribute('r', '4.5');
    const handle = document.createElementNS(svgNamespace, 'path');
    handle.setAttribute('d', 'M10 10l4.5 4.5');
    svg.append(lens, handle);
    return svg;
}

/**
 * e.g. `$50, 史$90`: the wanted price (Ceiling), then the historical low (最低$), as userscript-itad-mail
 * shows them after the want level, which is in the annotation already.
 */
function formatPrices({ historicalLow, wanted }: Prices): string {
    return `$${formatPrice(wanted)}, 史$${formatPrice(historicalLow)}`;
}

/** A magnifier button plus its status bubble, for a giveaway heading worth a price check; the caller places both. */
export class PriceButton {
    readonly button = createGlyphButton('', '查 Sheet 裡這款遊戲想要的價格（Ceiling）與史低價（最低$）');
    private readonly bubble = new StatusBubble();
    readonly status = this.bubble.element;

    constructor(private readonly appIds: MatchedAppIds) {
        this.button.replaceChildren(createMagnifierIcon());
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
            this.button.replaceChildren(createMagnifierIcon());
        }
    }
}
