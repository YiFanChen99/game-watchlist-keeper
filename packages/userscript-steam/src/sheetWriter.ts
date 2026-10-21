import { extractAppId } from '@watchlist/core';
import {
    addGame,
    fetchPlaytime,
    formatChange,
    formatLowestOffNotes,
    formatTagRuleNotes,
    MissingValueError,
    parseTagRules,
    refreshGame,
    sheetApiRowStore,
    type LowestOffOutcome,
    type TagRules,
} from '@watchlist/game-record-writer';
import { SheetApiError } from '@watchlist/sheet-api';
import { readSteamDbPrices, type SteamDbPrices } from '@watchlist/steam-info-scraper';

import { copyText, fetchText, itadApiKey, withApi } from './tampermonkey';
import { Panel } from './panel';

type Action = 'check' | 'add' | 'update';

const isSheetError = (error: unknown, code: SheetApiError['code']) =>
    error instanceof SheetApiError && error.code === code;

/** Where 最低off takes its lowest price from. */
interface LowestOffSources {
    steamDb: SteamDbPrices | null;
    itadApiKey: string | undefined;
}

/**
 * Put the sheet and playtime buttons on the store page of `window.location`; does nothing off an
 * app page.
 */
export function startSheetWriter(): void {
    const appId = extractAppId(window.location.pathname);
    if (appId === null) {
        console.warn(`Steam Sheet Writer: no app id in ${window.location.pathname}`);
        return;
    }

    /** What the button does now; after an error, the action that failed. */
    let action: Action = 'check';
    const panel = new Panel(() => {
        void run(action);
    }, () => {
        void copyPlaytime();
    });

    /** Only the playtime part of 備註, to the clipboard; the sheet is not touched. */
    async function copyPlaytime(): Promise<void> {
        panel.setPlaytimeBusy(true);
        try {
            const playtime = await fetchPlaytime(appId!, fetchText);
            copyText(playtime);
            panel.showPlaytimeMessage(`已複製：${playtime}`, false);
        } catch (error) {
            console.error('Steam Sheet Writer:', error);
            panel.showPlaytimeMessage(error instanceof Error ? error.message : String(error), true);
        } finally {
            panel.setPlaytimeBusy(false);
        }
    }

    /** The rules ＋ 新增 fills 模式 and 備註 with; the check brings them when the sheet lacks the game. */
    let tagRules: TagRules | null = null;

    async function check(): Promise<void> {
        const found = await withApi(api => api.findRow(appId!));
        tagRules = found.row === null ? parseTagRules(found.tagRules) : null;
        action = found.row === null ? 'add' : 'update';
        panel.setState({ kind: action });
    }

    /**
     * 最低off's sources, read on click: the SteamDB extension fills its block in after the page
     * loads. Asks for the ITAD API key the first time.
     */
    function readLowestOffSources(): LowestOffSources {
        return { steamDb: readSteamDbPrices(document), itadApiKey: itadApiKey.get() };
    }

    /** The notes on what 最低off went by when ITAD gave nothing, and why it has `!`; forgets a refused key. */
    function lowestOffNotes(action: 'add' | 'refresh', sources: LowestOffSources, outcome: LowestOffOutcome): string[] {
        return formatLowestOffNotes(outcome, {
            action,
            hasItadApiKey: sources.itadApiKey !== undefined,
            isItadApiKeyRefused: itadApiKey.forgetIfRefused(outcome.itadError),
            hasSteamDb: sources.steamDb !== null,
        });
    }

    async function add(): Promise<void> {
        const sources = readLowestOffSources();
        panel.setState({ kind: 'busy', label: '新增中…' });
        let notes: string[];
        try {
            const outcome = await withApi(api => addGame(appId!, {
                fetchText,
                store: sheetApiRowStore(api),
                ...sources,
                openStorePage: document,
                tagRules: tagRules?.rules ?? [],
            }));
            notes = [
                ...formatTagRuleNotes(outcome.tagMatch, tagRules?.problems ?? []),
                ...lowestOffNotes('add', sources, outcome),
            ];
        } catch (error) {
            if (error instanceof MissingValueError) {
                // Retrying will not help; the page lacks the value. Keep it shown: nothing was added.
                panel.setState({ kind: 'add' }, error.message, true);
                return;
            }
            if (!isSheetError(error, 'duplicate')) {
                throw error;
            }
            action = 'update';
            panel.setState({ kind: 'update' }, 'Sheet 已經有這個遊戲，請改用更新。');
            return;
        }
        action = 'update';
        panel.setState({ kind: 'update' }, ['已新增。', ...notes].join('\n'));
    }

    async function update(): Promise<void> {
        const sources = readLowestOffSources();
        panel.setState({ kind: 'busy', label: '更新中…' });
        try {
            const result = await withApi(api =>
                refreshGame(appId!, { fetchText, store: sheetApiRowStore(api), ...sources, openStorePage: document }));
            const lines = ['已更新。', ...result.changes.map(formatChange), ...lowestOffNotes('refresh', sources, result)];
            panel.setState({ kind: 'update' }, lines.join('\n'));
        } catch (error) {
            if (!isSheetError(error, 'not-found')) {
                throw error;
            }
            // Check again for the tag rules, which only come without a row.
            await check();
            if (action === 'add') {
                panel.setState({ kind: 'add' }, 'Sheet 找不到這個遊戲了，可以重新新增。');
            }
        }
    }

    async function run(current: Action): Promise<void> {
        try {
            await { check, add, update }[current]();
        } catch (error) {
            console.error('Steam Sheet Writer:', error);
            action = current;
            panel.setState({ kind: 'error' }, error instanceof Error ? error.message : String(error));
        }
    }

    void run('check');
}
