#!/bin/sh
# E2E テスト(e2e/)専用のデータベースを作り、アプリ用ユーザーに権限を付与する。
# 開発用のデータベース(tripdiary)と分けることで、E2E が開発中のデータに触れないようにする。
# このスクリプトは DB を初めて作るときにだけ実行される。既存の DB には docs/20_設計書.md の手順で作成する。
set -eu

mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" <<SQL
CREATE DATABASE IF NOT EXISTS tripdiary_e2e CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL ON tripdiary_e2e.* TO '${MYSQL_USER}'@'%';
SQL
