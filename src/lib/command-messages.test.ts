import { describe, expect, it } from 'vitest';
import { describeResponse, plural } from './command-messages';
import type { CommandResponse } from './messages';

const ok = (groups: number, tabs: number, failed = 0): CommandResponse => ({
  ok: true,
  result: { groups, tabs, failed, closedGroupIds: [] },
});

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

  it('says where deleted things go', () => {
    expect(describeResponse('deleteGroup', ok(1, 4), 'Покупки')).toBe(
      'Группа «Покупки» удалена. Её можно вернуть из корзины в течение 30 дней.',
    );
    expect(describeResponse('deleteSpace', ok(2, 9), 'Работа')).toBe(
      'Пространство «Работа» удалено вместе с 2 группами. Его можно вернуть из корзины в течение 30 дней.',
    );
    expect(describeResponse('deleteSpace', ok(1, 9), 'Работа')).toContain('вместе с 1 группой');
    expect(describeResponse('deleteTab', ok(0, 1))).toBe(
      'Ссылка удалена. Её можно вернуть из корзины в течение 30 дней.',
    );
    expect(describeResponse('deleteTab', ok(1, 1), 'Покупки')).toContain('вместе с группой');
  });

  it('describes the quick actions', () => {
    const titled = (groups: number, tabs: number, groupTitle: string): CommandResponse => ({
      ok: true,
      result: { groups, tabs, failed: 0, closedGroupIds: [], groupTitle },
    });
    expect(describeResponse('stowCurrent', titled(1, 12, 'Учёба'))).toBe(
      '«Учёба» убрана в TabFlow. 12 вкладок сохранены.',
    );
    expect(describeResponse('stowCurrent', titled(0, 1, '17 окт · отложено'))).toBe(
      'Вкладка убрана в TabFlow — в группу «17 окт · отложено».',
    );
    expect(describeResponse('sleepCurrent', titled(1, 3, 'Учёба'))).toBe(
      'Группа «Учёба» уснула — 3 вкладки. Вкладки остались на месте.',
    );
    expect(describeResponse('sleepInactive', ok(2, 9))).toBe(
      'Уснули: 2 группы · 9 вкладок. Вкладки остались на месте.',
    );
    expect(describeResponse('sleepInactive', ok(0, 0))).toBe(
      'Усыплять нечего — других активных групп нет.',
    );
    expect(describeResponse('saveLink', titled(0, 0, 'Работа'))).toBe(
      'Ссылка уже есть в «Работа».',
    );
  });

  it('never blames and always says nothing is lost on errors', () => {
    const text = describeResponse('stowGroup', { ok: false, code: 'unexpected', message: 'x' });
    expect(text).toContain('остались на месте');
    expect(text).not.toMatch(/!|вы |ты /i);
  });
});
