import { describe, expect, it } from 'vitest';

import { Column, formatTagRuleNotes, matchTagRules, parseTagRules } from '../src';

/** The 標籤規則 worksheet as the web app sends it: column A blank, like the user's. */
const header = ['', '輸出', '目標欄', 'User Tags', 'Categories', 'Genres'];

/** Chained Beasts (3569420), trimmed. */
const page = {
    tags: ['動作類 Rogue', '合作', '多人', '砍殺', '俯視視角', '輕度 Rogue'],
    categories: ['單人', '線上合作', '共享 / 分割螢幕合作', '跨平台多人連線'],
    genres: ['動作'],
};

describe('parseTagRules', () => {
    it('splits keywords on 、 only, since tags hold spaces', () => {
        const { rules, problems } = parseTagRules([
            header,
            ['', ' 動作 ', '模式', '動作類 Rogue、 輕度 Rogue ', '', '動作'],
        ]);

        expect(problems).toEqual([]);
        expect(rules).toEqual([{
            row: 2,
            output: '動作',
            target: Column.mode,
            userTags: ['動作類 Rogue', '輕度 Rogue'],
            categories: [],
            genres: ['動作'],
        }]);
    });

    it('finds columns by header name', () => {
        const { rules } = parseTagRules([
            ['Genres', '目標欄', '輸出', 'Categories', 'User Tags'],
            ['', '備註', '俯視角', '', '俯視視角'],
        ]);

        expect(rules).toMatchObject([{ output: '俯視角', target: Column.detail, userTags: ['俯視視角'], genres: [] }]);
    });

    it('skips blank rows, and leaves out and reports rows it cannot use', () => {
        const { rules, problems } = parseTagRules([
            header,
            ['', '多人', '模式', '合作', '', ''],
            ['', '', '', '', '', ''],
            ['', '動作', '特', '動作', '', ''],
            ['', '', '模式', '砍殺', '', ''],
            ['', '砍殺', '模式', '', '', ''],
        ]);

        expect(rules.map(rule => rule.output)).toEqual(['多人']);
        expect(problems).toEqual([
            '「標籤規則」第 4 列的目標欄「特」不是「模式」或「備註」，略過',
            '「標籤規則」第 5 列沒有輸出，略過',
            '「標籤規則」第 6 列沒有關鍵字，略過',
        ]);
    });

    it('reports an output repeated in one target column, but keeps both rows', () => {
        const { rules, problems } = parseTagRules([
            header,
            ['', '動作', '模式', '動作', '', ''],
            ['', '動作', '備註', '動作', '', ''],
            ['', '動作', '模式', '砍殺', '', ''],
        ]);

        expect(rules).toHaveLength(3);
        expect(problems).toEqual(['「標籤規則」第 4 列：模式的「動作」不只一列，順序看先對到的那列，建議合併成一列']);
    });

    it('reports a missing worksheet or header, with no rules', () => {
        expect(parseTagRules(null)).toEqual({ rules: [], problems: ['Sheet 沒有「標籤規則」分頁'] });
        expect(parseTagRules([])).toEqual({
            rules: [],
            problems: ['「標籤規則」分頁沒有「輸出」「目標欄」「User Tags」「Categories」「Genres」欄'],
        });
        expect(parseTagRules([['輸出', '目標欄', 'User Tags', 'Genres']]).problems)
            .toEqual(['「標籤規則」分頁沒有「Categories」欄']);
    });
});

describe('matchTagRules', () => {
    const rules = (...rows: string[][]) => parseTagRules([header, ...rows.map(row => ['', ...row])]).rules;

    it('writes outputs in rule order per target column', () => {
        expect(matchTagRules(rules(
            ['多人', '模式', '合作、多人、玩家合作', '線上合作、分割螢幕、多人連線', ''],
            ['動作', '模式', '動作類 Rogue', '', '動作'],
            ['俯視角', '備註', '俯視視角', '', ''],
            ['砍殺', '模式', '砍殺', '', ''],
            ['RL', '模式', '輕度 Rogue、動作類 Rogue', '', ''],
            ['解謎', '模式', '解謎', '', ''],
        ), page)).toEqual({ [Column.mode]: ['多人', '動作', '砍殺', 'RL'], [Column.detail]: ['俯視角'] });
    });

    it('takes an output once, where it first matched', () => {
        expect(matchTagRules(rules(
            ['動作', '模式', '動作', '', ''],
            ['砍殺', '模式', '砍殺', '', ''],
            ['動作', '模式', '動作類 Rogue', '', ''],
        ), page)[Column.mode]).toEqual(['砍殺', '動作']);
    });

    it('matches user tags and genres whole, categories anywhere', () => {
        const only = (userTags: string, categories: string, genres: string) =>
            matchTagRules(rules(['x', '模式', userTags, categories, genres]), page)[Column.mode];

        expect(only('Rogue', '', '')).toEqual([]);
        expect(only('動作類 Rogue', '', '')).toEqual(['x']);
        expect(only('', '', '動')).toEqual([]);
        expect(only('', '', '動作')).toEqual(['x']);
        expect(only('', '分割螢幕', '')).toEqual(['x']);
        expect(only('', '本地合作', '')).toEqual([]);
    });
});

describe('formatTagRuleNotes', () => {
    it('tells what the rules wrote, TODO where they wrote nothing, then each problem', () => {
        expect(formatTagRuleNotes({ [Column.mode]: ['多人', '動作'], [Column.detail]: [] }, ['Sheet 沒有「標籤規則」分頁']))
            .toEqual(['模式：多人 動作；遊戲特點：TODO', 'Sheet 沒有「標籤規則」分頁。']);
    });
});
