/**
 * GET `url` and resolve with the response body. Rejects on network errors, and with `HttpStatusError`
 * on non-2xx statuses.
 *
 * Libraries take this as a parameter instead of calling `GM_xmlhttpRequest` or `fetch`
 * themselves: each userscript injects its own, and tests inject fakes.
 *
 * @param headers Extra request headers, e.g. an API key, which would leak into error messages
 *   and logs as part of `url`.
 */
export type FetchText = (url: string, headers?: Record<string, string>) => Promise<string>;

/**
 * POST `body` as `text/plain` to `url` and resolve with the response body, following redirects.
 * Rejects like `FetchText`.
 */
export type PostText = (url: string, body: string) => Promise<string>;

/** How `FetchText` and `PostText` reject on a non-2xx status, for callers to tell e.g. a refused API key. */
export class HttpStatusError extends Error {
    constructor(message: string, readonly status: number) {
        super(message);
        this.name = 'HttpStatusError';
    }
}
