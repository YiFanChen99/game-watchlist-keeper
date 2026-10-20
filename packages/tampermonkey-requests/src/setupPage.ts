import { itadApiKeyKey, tokenKey } from './storageKeys';

/**
 * The page where the user enters the secrets once for every installed userscript: each keeps its
 * own Tampermonkey storage, so each saves them for itself. Every userscript `@match`es it.
 */
export const setupPageUrl = 'https://yifanchen99.github.io/game-watchlist-keeper/setup.html';

/** A secret the setup page takes: its Tampermonkey storage key is also its input's id. */
export type SetupSecret = typeof tokenKey | typeof itadApiKeyKey;

/** What the page calls each secret, in a script's status line. */
const secretLabels: Record<SetupSecret, string> = {
    [tokenKey]: 'Sheet token',
    [itadApiKeyKey]: 'ITAD key',
};

/** Element ids of the setup page (scripts/collect-pages.mjs writes it). */
export const setupPageIds = {
    save: 'save',
    /** The list each installed script adds its status line to. */
    scripts: 'scripts',
    /** Shown until a script adds its line. */
    noScripts: 'no-scripts',
} as const;

function statusOf(secrets: readonly SetupSecret[]): string {
    return secrets.map(secret => `${secretLabels[secret]}${GM_getValue<string>(secret, '') ? '已存' : '未存'}`).join('、');
}

/**
 * On the setup page, list this script and save what the user enters into its storage when they
 * press 儲存; a blank input leaves that secret as it is.
 *
 * Needs `@grant` GM_getValue and GM_setValue, and `@match` `setupPageUrl`.
 *
 * @param scriptName The script's name in its status line, e.g. `Steam Sheet Writer`.
 * @param secrets The secrets this script uses.
 * @returns Whether this is the setup page, where the script should do nothing else.
 */
export function runSetupPage(scriptName: string, secrets: readonly SetupSecret[], pageUrl: string = location.href): boolean {
    const url = new URL(pageUrl);
    if (`${url.origin}${url.pathname}` !== setupPageUrl) {
        return false;
    }
    const list = document.getElementById(setupPageIds.scripts);
    const save = document.getElementById(setupPageIds.save);
    if (!list || !save) {
        console.warn(`${scriptName}: the setup page has no #${setupPageIds.scripts} or #${setupPageIds.save}`);
        return true;
    }

    document.getElementById(setupPageIds.noScripts)?.remove();
    const line = document.createElement('li');
    line.textContent = `${scriptName}：${statusOf(secrets)}`;
    list.append(line);

    save.addEventListener('click', () => {
        const inputs = secrets.flatMap((secret) => {
            const input = document.getElementById(secret);
            return input instanceof HTMLInputElement ? [{ secret, input }] : [];
        });
        for (const { secret, input } of inputs) {
            const value = input.value.trim();
            if (value) {
                GM_setValue(secret, value);
            }
        }
        line.textContent = `${scriptName}：已儲存（${statusOf(secrets)}）`;
        // Every installed script reads the inputs in this same click; clear them after all have.
        setTimeout(() => {
            for (const { input } of inputs) {
                input.value = '';
            }
        });
    });
    return true;
}
