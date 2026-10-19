export type PanelState =
    | { kind: 'checking' }
    | { kind: 'add' }
    | { kind: 'update' }
    | { kind: 'busy'; label: string }
    | { kind: 'error' };

const labels: Record<PanelState['kind'], string> = {
    checking: '查詢 Sheet…',
    add: '＋ 新增',
    update: '↻ 更新',
    busy: '',
    error: '重試',
};

const playtimeLabel = '時長';

/** How long a message stays unless it reports a failure, which stays until clicked. */
const messageLifetimeMs = 60_000;

/** A message line under the buttons; clicking it closes it. */
class StatusLine {
    readonly element = document.createElement('div');
    private hideTimer: ReturnType<typeof setTimeout> | undefined;

    /** @param name Set as `data-status`, telling the lines apart. */
    constructor(name: string) {
        this.element.dataset.status = name;
        Object.assign(this.element.style, {
            maxWidth: '320px', padding: '2px 6px', whiteSpace: 'pre-line', textAlign: 'right',
            fontSize: '12px', color: '#fff', background: 'rgba(0, 0, 0, 0.7)', borderRadius: '3px',
            cursor: 'pointer',
        });
        this.element.title = '點一下關閉';
        this.element.addEventListener('click', () => {
            this.show('', false);
        });
        this.show('', false);
    }

    /**
     * @param message `''` hides the line.
     * @param persist Keep the message until clicked instead of hiding it after a minute.
     */
    show(message: string, persist: boolean): void {
        clearTimeout(this.hideTimer);
        this.element.textContent = message;
        this.element.style.display = message ? '' : 'none';
        if (message && !persist) {
            this.hideTimer = setTimeout(() => {
                this.show('', false);
            }, messageLifetimeMs);
        }
    }
}

/**
 * The sheet button with a narrower playtime button on its right, fixed at the page's top right.
 * Under them, each button has a status line of its own, so a playtime copy never hides a sheet
 * failure that waits to be read, nor the other way round.
 */
export class Panel {
    private readonly button = document.createElement('button');
    private readonly playtimeButton = document.createElement('button');
    private readonly status = new StatusLine('sheet');
    private readonly playtimeStatus = new StatusLine('playtime');

    /**
     * @param onClick The sheet button: add, update or retry.
     * @param onPlaytime The playtime button; works whatever the sheet button's state.
     */
    constructor(onClick: () => void, onPlaytime: () => void) {
        const area = document.createElement('div');
        area.id = 'EkkoSteamSheetWriter';
        Object.assign(area.style, {
            position: 'fixed', right: '25px', top: '20px', zIndex: '50',
            display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px',
        });
        const buttons = document.createElement('div');
        Object.assign(buttons.style, { display: 'flex', gap: '6px' });
        Object.assign(this.button.style, { height: '32px', minWidth: '86px', padding: '0 12px', cursor: 'pointer' });
        Object.assign(this.playtimeButton.style, { height: '32px', minWidth: '48px', padding: '0 6px', cursor: 'pointer' });
        this.playtimeButton.textContent = playtimeLabel;
        this.playtimeButton.title = '只抓遊戲時長，複製到剪貼簿';
        this.button.addEventListener('click', onClick);
        this.playtimeButton.addEventListener('click', onPlaytime);
        buttons.append(this.button, this.playtimeButton);
        area.append(buttons, this.status.element, this.playtimeStatus.element);
        document.body.append(area);
        this.setState({ kind: 'checking' });
    }

    /**
     * @param persist Keep the message until clicked instead of hiding it after a minute.
     *   Defaults to true in the error state, so a failure is not missed.
     */
    setState(state: PanelState, message = '', persist = state.kind === 'error'): void {
        this.button.textContent = state.kind === 'busy' ? state.label : labels[state.kind];
        this.button.disabled = state.kind === 'checking' || state.kind === 'busy';
        this.showMessage(message, persist);
    }

    /** Disable the playtime button while it fetches. */
    setPlaytimeBusy(busy: boolean): void {
        this.playtimeButton.textContent = busy ? '…' : playtimeLabel;
        this.playtimeButton.disabled = busy;
    }

    /** The sheet button's message. @param persist Keep it until clicked instead of hiding it after a minute. */
    showMessage(message: string, persist: boolean): void {
        this.status.show(message, persist);
    }

    /** The playtime button's message, on its own line. @param persist As `showMessage`. */
    showPlaytimeMessage(message: string, persist: boolean): void {
        this.playtimeStatus.show(message, persist);
    }
}
