import { SheetApiError } from '@watchlist/sheet-api';

import { createGlyphButton, StatusBubble } from './widgets';

/**
 * Refetches the sheet and annotates the page again. Resolves to null when the heading matches
 * a game now, else to why not; rejects with a `SheetApiError` of code `not-found` when no row has the game.
 */
export type Rematch = () => Promise<string | null>;

const glyph = '⟲';

/** A ⟲ button plus its status bubble, for a giveaway heading no sheet game matched; the caller places both. */
export class RematchButton {
    readonly button = createGlyphButton(glyph, 'Sheet 裡對不到這款遊戲。補好 Sheet 後按這裡，重抓這款遊戲再比對一次');
    private readonly bubble = new StatusBubble();
    readonly status = this.bubble.element;

    constructor(private readonly rematch: Rematch) {
        this.button.addEventListener('click', () => {
            void this.run();
        });
    }

    private async run(): Promise<void> {
        this.button.disabled = true;
        this.button.textContent = '…';
        this.bubble.show('', false);
        try {
            const reason = await this.rematch();
            if (reason) {
                this.bubble.show(reason, false);
            }
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
