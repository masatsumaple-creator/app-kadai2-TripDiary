import type { Prisma } from '../generated/prisma/client.js';

// 閲覧者が見られる投稿の条件(詳細の canView と同じ規則を、DB の検索条件にしたもの)。
// - public: 誰でも
// - 自分の投稿: 公開範囲によらず
// - followers: 投稿者をフォローしているログイン済みユーザー
// - private: 本人のみ(自分の投稿の条件に含まれる)
// 一覧とプロフィールの投稿数で共通に使い、規則がずれないようにする。
export function viewableSpotsWhere(viewerId?: number): Prisma.SpotWhereInput {
  const viewable: Prisma.SpotWhereInput[] = [{ visibility: 'public' }];
  if (viewerId !== undefined) {
    viewable.push(
      { userId: viewerId },
      {
        visibility: 'followers',
        user: { followers: { some: { followerId: viewerId } } },
      },
    );
  }
  return { OR: viewable };
}
