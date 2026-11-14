import { hashPassword, verifyPassword } from './password.js';

describe('password', () => {
  it('正しいパスワードを検証できる', async () => {
    const stored = await hashPassword('correct-horse');
    expect(await verifyPassword('correct-horse', stored)).toBe(true);
  });

  it('誤ったパスワードは拒否する', async () => {
    const stored = await hashPassword('correct-horse');
    expect(await verifyPassword('wrong-horse', stored)).toBe(false);
  });

  it('平文は保存せず、同じパスワードでも毎回異なる値になる', async () => {
    const a = await hashPassword('same-password');
    const b = await hashPassword('same-password');
    expect(a).not.toContain('same-password');
    expect(a).not.toBe(b);
  });

  it('壊れた保存値は拒否する', async () => {
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false);
  });
});
