import { isWriteConflict, retryOnWriteConflict } from './retry.js';

const conflict = () =>
  Object.assign(new Error('TransactionWriteConflict'), { code: 'P2034' });

describe('retryOnWriteConflict', () => {
  it('成功したら、そのまま結果を返す(再実行しない)', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    await expect(retryOnWriteConflict(fn)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('書き込みの競合(デッドロック)なら、再実行して、成功したらその結果を返す', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(conflict())
      .mockRejectedValueOnce(conflict())
      .mockResolvedValue('ok');
    await expect(retryOnWriteConflict(fn)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('再実行は 3 回まで。それでも競合なら、そのエラーを投げる(無限に再実行しない)', async () => {
    const error = conflict();
    const fn = vi.fn().mockRejectedValue(error);
    await expect(retryOnWriteConflict(fn)).rejects.toBe(error);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('競合以外のエラーは、再実行せず、すぐに投げる(入力エラーや一意制約違反などを、繰り返さない)', async () => {
    const error = Object.assign(new Error('Unique constraint failed'), {
      code: 'P2002',
    });
    const fn = vi.fn().mockRejectedValue(error);
    await expect(retryOnWriteConflict(fn)).rejects.toBe(error);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('回数を指定できる', async () => {
    const fn = vi.fn().mockRejectedValue(conflict());
    await expect(retryOnWriteConflict(fn, 5)).rejects.toBeDefined();
    expect(fn).toHaveBeenCalledTimes(5);
  });
});

describe('isWriteConflict', () => {
  it('Prisma のコード P2034、kind、メッセージのいずれでも、競合と判定する', () => {
    expect(isWriteConflict({ code: 'P2034' })).toBe(true);
    expect(isWriteConflict({ kind: 'TransactionWriteConflict' })).toBe(true);
    expect(
      isWriteConflict(
        new Error('driverAdapterError: TransactionWriteConflict'),
      ),
    ).toBe(true);
  });

  it('それ以外(null、文字列、別のエラー)は、競合ではない', () => {
    expect(isWriteConflict(null)).toBe(false);
    expect(isWriteConflict('TransactionWriteConflict')).toBe(false);
    expect(isWriteConflict({ code: 'P2002' })).toBe(false);
    expect(isWriteConflict(new Error('boom'))).toBe(false);
  });
});
