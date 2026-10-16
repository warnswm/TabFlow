import { describe, expect, it } from 'vitest';
import { describeResponse, plural } from './command-messages';

const ok = (groups: number, tabs: number, failed = 0) =>
  ({ ok: true, result: { groups, tabs, failed } }) as const;

describe('command messages', () => {
  it('picks the Russian plural form', () => {
    const forms = ['вкладка', 'вкладки', 'вкладок'] as const;
    expect([1, 2, 5, 11, 12, 21, 22, 25, 111].map((n) => plural(n, forms))).toEqual([
      'вкладка',
      'вкладки',
      'вкладок',
      'вкладок',
      'вкладок',
      'вкладка',
      'вкладки',
      'вкладок',
      'вкладок',
    ]);
  });

  it('describes results in the brand voice', () => {
    expect(describeResponse('collapseAll', ok(2, 14))).toBe(
      'Свёрнуто: 2 группы · 14 вкладок. Ссылки сохранены во «Входящих».',
    );
    expect(describeResponse('stowGroup', ok(1, 12), 'Учёба')).toBe(
      '«Учёба» убрана в TabFlow. 12 вкладок сохранены.',
    );
    expect(describeResponse('sleepGroup', ok(1, 1), 'Учёба')).toBe(
      'Группа «Учёба» уснула — 1 вкладка. Вкладки остались на месте.',
    );
    expect(describeResponse('restoreGroup', ok(1, 3, 2), 'Учёба')).toBe(
      'Группа «Учёба» восстановлена — 3 вкладки. Не удалось: 2 вкладки — ссылки сохранены.',
    );
  });

  it('never blames and always says nothing is lost on errors', () => {
    const text = describeResponse('stowGroup', { ok: false, code: 'unexpected', message: 'x' });
    expect(text).toContain('остались на месте');
    expect(text).not.toMatch(/!|вы |ты /i);
  });
});
