import { SheetApiError } from '@watchlist/sheet-api';

import { createGlyphButton, StatusBubble } from './widgets';

/**
 * Refetches the sheet and annotates the page again. Resolves to null when the heading matches
 * a game now, else to why not; rejects with a `SheetApiError` of code `not-found` when no row has the game.
 */
export type Resync = () => Promise<string | null>;

const glyph = '⟲';

/** A ⟲ button plus its status bubble, for one giveaway heading; the caller places both. */
export class ResyncButton {
    readonly button = createGlyphButton(glyph, '重新讀 Sheet 裡這款遊戲，例如在 Sheet 改了期待度或補上這款遊戲之後');
    private readonly bubble = new StatusBubble();
    readonly status = this.bubble.element;

    constructor(private readonly resync: Resync) {
        // Spaced like the heading's own icons, not tucked in parentheses as the other buttons are.
        this.button.style.marginLeft = '8px';
        this.button.addEventListener('click', () => {
            void this.run();
        });
    }

    private async run(): Promise<void> {
        this.button.disabled = true;
        this.button.textContent = '…';
        this.bubble.show('', false);
        try {
            const reason = await this.resync();
            this.bubble.show(reason ?? '已重新讀取。', false);
        } catch (error) {
            if (error instanceof SheetApiError && error.code === 'not-found') {
                this.bubble.show('Sheet 沒有這個遊戲，要新增請到 Steam 商店頁。', false);
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
