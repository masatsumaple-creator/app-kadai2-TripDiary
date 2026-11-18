// MySQL は、デッドロックが起きると、片方のトランザクションを強制的に取り消す(巻き戻して、エラーにする)。
// 取り消されたトランザクションは、何も書き込んでいないので、そのまま再実行しても安全で、
// MySQL の公式にも「デッドロックで失敗したトランザクションは、再実行する前提で作る」とされている。
// Prisma では、このエラーが TransactionWriteConflict(コード P2034)として届く。
// 並行する書き込みが多いときに、500 にならないよう、少ない回数だけ再試行する。

const MAX_ATTEMPTS = 3;

export function isWriteConflict(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const e = error as { code?: unknown; message?: unknown; kind?: unknown };
  return (
    e.code === 'P2034' ||
    e.kind === 'TransactionWriteConflict' ||
    (typeof e.message === 'string' &&
      e.message.includes('TransactionWriteConflict'))
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// 書き込みの操作 fn を実行する。デッドロック(書き込みの競合)で失敗したときだけ、
// 少し待って(待ち時間は、毎回少しずつ長く、ばらつきを付ける)再実行する。他のエラーは、そのまま投げる
export async function retryOnWriteConflict<T>(
  fn: () => Promise<T>,
  attempts = MAX_ATTEMPTS,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= attempts || !isWriteConflict(error)) throw error;
      await sleep(attempt * 25 + Math.random() * 25);
    }
  }
}
