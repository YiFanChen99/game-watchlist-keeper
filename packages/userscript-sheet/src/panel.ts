const label = '↻';

/** How long a message stays unless it reports a failure, which stays until clicked (as in userscript-steam). */
const messageLifetimeMs = 60_000;

/**
 * The refresh button with a message box on its right, fixed at the page's bottom left, over the
 * row numbers and just above the worksheet tabs.
 */
export class Panel {
    private readonly button = document.createElement('button');
    private readonly message = document.createElement('div');
    private hideTimer: ReturnType<typeof setTimeout> | undefined;

    constructor(onClick: () => void) {
        const area = document.createElement('div');
        area.id = 'EkkoSheetRowRefresher';
        Object.assign(area.style, {
            position: 'fixed', left: '6px', bottom: '48px', zIndex: '1000',
            display: 'flex', alignItems: 'flex-end', gap: '6px',
        });
        Object.assign(this.button.style, {
            width: '32px', height: '32px', padding: '0', fontSize: '18px', cursor: 'pointer',
            border: '1px solid #dadce0', borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.3)',
        });
        Object.assign(this.message.style, {
            display: 'none', maxWidth: '360px', padding: '2px 6px', whiteSpace: 'pre-line',
            fontSize: '12px', lineHeight: '16px', color: '#fff', background: 'rgba(0, 0, 0, 0.7)', borderRadius: '3px',
            cursor: 'pointer',
        });
        this.button.type = 'button';
        this.button.textContent = label;
        this.button.title = '用 Steam 的資料刷新選取的那一列遊戲';
        this.message.title = '點一下關閉';
        this.button.addEventListener('click', onClick);
        this.message.addEventListener('click', () => {
            this.showMessage('', false);
        });
        area.append(this.button, this.message);
        document.body.append(area);
    }

    setBusy(busy: boolean): void {
        this.button.textContent = busy ? '…' : label;
        this.button.disabled = busy;
    }

    /**
     * @param message `''` hides the box.
     * @param persist Keep the message until clicked instead of hiding it after a minute.
     */
    showMessage(message: string, persist: boolean): void {
        clearTimeout(this.hideTimer);
        this.message.textContent = message;
        this.message.style.display = message ? 'block' : 'none';
        if (message && !persist) {
            this.hideTimer = setTimeout(() => {
                this.showMessage('', false);
            }, messageLifetimeMs);
        }
    }
}
