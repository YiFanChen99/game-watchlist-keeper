import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StatusBubble } from '../src/widgets';

const isShown = (bubble: StatusBubble) => bubble.element.style.display !== 'none';

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe('StatusBubble', () => {
    it('hides a message after a minute', () => {
        const bubble = new StatusBubble();
        bubble.show('已更新。', false);
        expect(isShown(bubble)).toBe(true);
        vi.advanceTimersByTime(59_000);
        expect(isShown(bubble)).toBe(true);
        vi.advanceTimersByTime(1_000);
        expect(isShown(bubble)).toBe(false);
    });

    it('keeps a failure until clicked', () => {
        const bubble = new StatusBubble();
        bubble.show('timeout', true);
        vi.advanceTimersByTime(10 * 60_000);
        expect(isShown(bubble)).toBe(true);
        bubble.element.click();
        expect(isShown(bubble)).toBe(false);
    });

    it('gives a new message its own minute, and keeps it when an older one would have hidden', () => {
        const bubble = new StatusBubble();
        bubble.show('first', false);
        vi.advanceTimersByTime(30_000);
        bubble.show('failed', true);
        vi.advanceTimersByTime(60_000);
        expect(bubble.element.textContent).toBe('failed');
        expect(isShown(bubble)).toBe(true);
    });
});
