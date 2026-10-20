import { extractAppId } from '@watchlist/core';
import { formatChange } from '@watchlist/game-record-writer';
import { SheetApiError } from '@watchlist/sheet-api';

import { refreshRow } from './refresh';
import { createGlyphButton, StatusBubble } from './widgets';

/** Called after a row was written, with its whole name cell and the date written as 更新日. */
export type OnRefreshed = (name: string, updatedOn: Date) => void;

/** A ↻ button plus its status bubble, for one giveaway heading; the caller places both. */
export class RefreshButton {
    readonly button = createGlyphButton('↻', '用 Steam 的資料刷新 Sheet 的這一列');
    private readonly bubble = new StatusBubble();
    readonly status = this.bubble.element;

    constructor(private readonly appId: number, private readonly onRefreshed: OnRefreshed) {
        this.button.addEventListener('click', () => {
            void this.refresh();
        });
    }

    private async refresh(): Promise<void> {
        this.button.disabled = true;
        this.button.textContent = '…';
        this.bubble.show('', false);
        try {
            const today = new Date();
            const { name, changes, notes } = await refreshRow(this.appId, today);
            this.onRefreshed(name, today);
            this.bubble.show(['已更新。', ...changes.map(formatChange), ...notes].join('\n'), false);
        } catch (error) {
            if (error instanceof SheetApiError && error.code === 'not-found') {
                // Nothing was written: keep it shown, like a failure.
                this.bubble.show('Sheet 沒有這個遊戲，要新增請到 Steam 商店頁。', true);
            } else {
                console.error('SteamGifts Annotator:', error);
                this.bubble.show(error instanceof Error ? error.message : String(error), true);
            }
        } finally {
            this.button.disabled = false;
            this.button.textContent = '↻';
        }
    }
}

/**
 * @param heading `.giveaway__heading` on the list page, `.featured__heading` on a giveaway page.
 * @returns The app id of the heading's Steam link; null for a bundle's `sub/` link or none.
 */
export function findAppId(heading: Element): number | null {
    for (const link of heading.querySelectorAll<HTMLAnchorElement>('a[href*="store.steampowered.com/"]')) {
        const appId = extractAppId(link.href);
        if (appId !== null) {
            return appId;
        }
    }
    return null;
}
