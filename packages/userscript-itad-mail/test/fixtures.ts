import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Gmail showing one ITAD Specials mail from specials@isthereanydeal.com: 18 games, of which only
 * Smile For Me is `in Waitlist`.
 */
export function loadSpecialsMail(): string {
    return readFileSync(join(import.meta.dirname, 'fixtures', 'specials-mail.html'), 'utf8');
}
