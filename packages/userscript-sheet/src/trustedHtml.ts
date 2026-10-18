/** Just enough of the Trusted Types API, which TypeScript's DOM types lack. */
interface TrustedHtmlPolicy {
    createHTML(input: string): unknown;
}

interface TrustedTypePolicyFactory {
    createPolicy(name: string, rules: { createHTML: (input: string) => string }): TrustedHtmlPolicy;
}

let policy: TrustedHtmlPolicy | undefined;

/**
 * `DOMParser` for fetched HTML. Google Sheets requires Trusted Types (`require-trusted-types-for
 * 'script'`), so `parseFromString` refuses a plain string there. Its CSP names no allowed
 * policies, so a policy of this script's own may pass the HTML through: the parsed document is
 * never put into the page, and `DOMParser` runs none of its scripts.
 */
export function parseHtml(html: string): Document {
    const factory = (window as { trustedTypes?: TrustedTypePolicyFactory }).trustedTypes;
    policy ??= factory?.createPolicy('ekko-sheet-row-refresher', { createHTML: input => input });
    // Typed as a string only because TypeScript's DOM types lack TrustedHTML.
    const trusted = (policy?.createHTML(html) ?? html) as string;
    return new DOMParser().parseFromString(trusted, 'text/html');
}
