import type { StorePageInfo } from '@watchlist/steam-info-scraper';

import { Column } from './columns';

/**
 * The worksheet the tag rules are kept in, edited by hand: one rule per row under a header row,
 * so a rule changes without a new userscript version.
 */
export const tagRulesWorksheetName = '標籤規則';

/** Header names of the tag rules worksheet. */
export const TagRuleColumn = {
    /** What a matching rule writes. */
    output: '輸出',
    /** `模式` or `備註`. */
    target: '目標欄',
    /** Keywords, each equal to a whole user tag. */
    userTags: 'User Tags',
    /** Keywords, each found anywhere in a category, e.g. `分割螢幕` in `共享 / 分割螢幕合作`. */
    categories: 'Categories',
    /** Keywords, each equal to a whole genre. */
    genres: 'Genres',
} as const;

/** Keywords in a cell are separated by `、`: Steam's tags hold spaces (`動作類 Rogue`) but no `、`. */
const keywordSeparator = '、';

/** The columns a rule writes to. */
const targets = [Column.mode, Column.detail] as const;

export type TagRuleTarget = (typeof targets)[number];

export interface TagRule {
    /** 1-based worksheet row, for problems to point at. */
    row: number;
    output: string;
    target: TagRuleTarget;
    userTags: string[];
    categories: string[];
    genres: string[];
}

export interface TagRules {
    /** In worksheet order, which is the order outputs are written in. */
    rules: TagRule[];
    /** What is wrong with the worksheet, for the user to fix; the rules still apply without the bad rows. */
    problems: string[];
}

/** What the rules give one game: outputs in rule order, without repeats. */
export interface TagMatch {
    [Column.mode]: string[];
    [Column.detail]: string[];
}

function splitKeywords(cell: string | undefined): string[] {
    return (cell ?? '').split(keywordSeparator).map(keyword => keyword.trim()).filter(Boolean);
}

/**
 * Read the tag rules worksheet as the web app sends it.
 *
 * Blank rows are skipped. A row with a target other than 模式 / 備註, or without an output or
 * keywords, is left out and reported. An output repeated in one target column is reported too:
 * its place in the order would depend on which row matched first.
 *
 * @param cells Displayed values, header row first; `null` when the sheet has no such worksheet.
 */
export function parseTagRules(cells: readonly (readonly string[])[] | null): TagRules {
    if (cells === null) {
        return { rules: [], problems: [`Sheet 沒有「${tagRulesWorksheetName}」分頁`] };
    }
    const [header = [], ...rows] = cells;
    const index = new Map(header.map((name, column) => [name.trim(), column]));
    const missing = Object.values(TagRuleColumn).filter(name => !index.has(name));
    if (missing.length > 0) {
        return { rules: [], problems: [`「${tagRulesWorksheetName}」分頁沒有${missing.map(name => `「${name}」`).join('')}欄`] };
    }
    const cell = (row: readonly string[], name: string) => row[index.get(name)!]?.trim() ?? '';

    const rules: TagRule[] = [];
    const problems: string[] = [];
    const seen = new Set<string>();
    rows.forEach((cells, offset) => {
        if (cells.every(value => value.trim() === '')) {
            return;
        }
        const row = offset + 2;
        const where = `「${tagRulesWorksheetName}」第 ${row} 列`;
        const output = cell(cells, TagRuleColumn.output);
        const target = cell(cells, TagRuleColumn.target);
        const rule = {
            row,
            output,
            target: target as TagRuleTarget,
            userTags: splitKeywords(cell(cells, TagRuleColumn.userTags)),
            categories: splitKeywords(cell(cells, TagRuleColumn.categories)),
            genres: splitKeywords(cell(cells, TagRuleColumn.genres)),
        };
        if (!(targets as readonly string[]).includes(target)) {
            problems.push(`${where}的目標欄「${target}」不是${targets.map(name => `「${name}」`).join('或')}，略過`);
            return;
        }
        if (output === '') {
            problems.push(`${where}沒有輸出，略過`);
            return;
        }
        if (rule.userTags.length + rule.categories.length + rule.genres.length === 0) {
            problems.push(`${where}沒有關鍵字，略過`);
            return;
        }
        const key = `${target}\n${output}`;
        if (seen.has(key)) {
            problems.push(`${where}：${target}的「${output}」不只一列，順序看先對到的那列，建議合併成一列`);
        }
        seen.add(key);
        rules.push(rule);
    });
    return { rules, problems };
}

/** User tags and genres match whole; categories match anywhere in one. */
function matches(rule: TagRule, page: Pick<StorePageInfo, 'tags' | 'categories' | 'genres'>): boolean {
    return rule.userTags.some(keyword => page.tags.includes(keyword))
        || rule.genres.some(keyword => page.genres.includes(keyword))
        || rule.categories.some(keyword => page.categories.some(category => category.includes(keyword)));
}

/**
 * Each target column's outputs of the rules a store page matches, in rule order; an output
 * matched again is not repeated.
 */
export function matchTagRules(rules: readonly TagRule[], page: Pick<StorePageInfo, 'tags' | 'categories' | 'genres'>): TagMatch {
    const match: TagMatch = { [Column.mode]: [], [Column.detail]: [] };
    for (const rule of rules) {
        const outputs = match[rule.target];
        if (!outputs.includes(rule.output) && matches(rule, page)) {
            outputs.push(rule.output);
        }
    }
    return match;
}
