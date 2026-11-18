# バックエンド(NestJS)のコンテナイメージ。ビルドの場所は backend/ :
#   docker build -t tripdiary-backend backend
# 本番(ECS Fargate)は ARM64(Graviton)。ARM のマシン(GitHub の ARM ランナー)でビルドするか、
#   docker buildx build --platform linux/arm64 ... でビルドする。

# ---- ビルド: 依存をすべて入れて、Prisma のクライアントを生成し、TypeScript をビルドする ----
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
COPY prisma.config.ts tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
# prisma generate は、DB に接続しない。設定の読み込みで、接続先が要るため、ダミーを渡す
ENV DATABASE_URL=mysql://build:build@localhost:3306/build
RUN npm run build

# ---- 実行: 本番の依存 + Prisma CLI(マイグレーション用)+ ビルド結果だけ ----
FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
# 本番の依存だけを入れる。マイグレーション(prisma migrate deploy)のために、Prisma CLI も入れる(版は lock と同じ)
RUN npm ci --omit=dev \
 && npm install --no-save --no-package-lock "prisma@$(node -p "require('./package.json').devDependencies.prisma.replace(/^[^0-9]*/, '')")" \
 && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY prisma ./prisma
COPY prisma.config.ts ./
# prisma.config.ts が読み込む(接続先の組み立て)
COPY src/prisma/database-url.ts ./src/prisma/database-url.ts

# 非 root で実行する(node イメージの node ユーザー)
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
