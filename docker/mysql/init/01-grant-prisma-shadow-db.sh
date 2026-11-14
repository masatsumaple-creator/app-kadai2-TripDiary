#!/bin/sh
# Prisma Migrate(migrate dev)は検証用の shadow DB(prisma_migrate_shadow_db_*)を作成・削除する。
# アプリ用ユーザーにそのための権限だけを付与する(他のデータベースには権限を与えない)。
# このスクリプトは DB を初めて作るときにだけ実行される。既存の DB には docs/20_設計書.md の手順で付与する。
set -eu

mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" <<SQL
GRANT ALL ON \`prisma\\_migrate\\_shadow\\_db%\`.* TO '${MYSQL_USER}'@'%';
SQL
