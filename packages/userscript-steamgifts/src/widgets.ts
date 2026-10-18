/** How long a message stays unless it reports a failure, which stays until clicked (as in userscript-steam). */
const messageLifetimeMs = 60_000;

/** A bare glyph button inside an annotation's parentheses, e.g. `(Y19↻)`. */
export function createGlyphButton(glyph: string, title: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = glyph;
    button.title = title;
    Object.assign(button.style, {
        margin: '0 0 0 2px', padding: '0', border: 'none', background: 'none',
        font: 'inherit', color: 'inherit', cursor: 'pointer',
    });
    return button;
}

/** A message bubble for a heading's button; the caller places `element`. Clicking it closes it. */
export class StatusBubble {
    /** Kept apart from the button, so a message outlives a button the annotation took away. */
    readonly element = document.createElement('span');
    private hideTimer: ReturnType<typeof setTimeout> | undefined;

    constructor() {
        Object.assign(this.element.style, {
            display: 'none', marginLeft: '6px', padding: '2px 6px', whiteSpace: 'pre-line', verticalAlign: 'middle',
            fontSize: '12px', fontWeight: 'normal', lineHeight: '16px',
            color: '#fff', background: 'rgba(0, 0, 0, 0.7)', borderRadius: '3px', cursor: 'pointer',
        });
        this.element.title = '點一下關閉';
        this.element.addEventListener('click', () => {
            this.show('', false);
        });
    }

    /**
     * @param message `''` hides the bubble.
     * @param persist Keep the message until clicked instead of hiding it after a minute.
     */
    show(message: string, persist: boolean): void {
        clearTimeout(this.hideTimer);
        this.element.textContent = message;
        this.element.style.display = message ? 'inline-block' : 'none';
        if (message && !persist) {
            this.hideTimer = setTimeout(() => {
                this.show('', false);
            }, messageLifetimeMs);
        }
    }
}
