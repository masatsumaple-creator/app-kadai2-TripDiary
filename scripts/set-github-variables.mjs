// terraform output(github_actions_variables)の値を、GitHub のリポジトリの「変数」に設定する。
// 環境を作り直すと、ロールの ARN・CloudFront のドメインなどが変わるため、作成のたびに実行する。
//   node scripts/set-github-variables.mjs
// 前提: infra/ で terraform init 済み・環境が作成済み、gh(GitHub CLI)でログイン済み。
// 設定するのは秘密情報ではない値だけ(deploy.yml の vars.* で使う)。
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const infra = fileURLToPath(new URL('../infra', import.meta.url));
// Windows でも、シェルを経由せずに実行する(引数をそのまま渡すため)
const exe = (name) => (process.platform === 'win32' ? `${name}.exe` : name);

const variables = JSON.parse(
  execFileSync(exe('terraform'), ['output', '-json', 'github_actions_variables'], {
    cwd: infra,
    encoding: 'utf8',
  }),
);

for (const [name, value] of Object.entries(variables)) {
  execFileSync(exe('gh'), ['variable', 'set', name, '--body', String(value)], {
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  console.log(`set ${name}`);
}
