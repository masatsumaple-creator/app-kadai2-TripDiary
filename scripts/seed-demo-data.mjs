// 作り直した環境に、デモ用のユーザーと投稿を、API で入れる(docs/22_インフラ設計.md の O2)。
//   node scripts/seed-demo-data.mjs https://xxxx.cloudfront.net
//   node scripts/seed-demo-data.mjs http://localhost:3000          (ローカルのバックエンドへ)
// 何度実行しても、重複しない(デモ用のユーザーがすでにいれば、何もしない。--force で、投稿などを追加する)。
//
// 入れるもの: ユーザー 3 人(下の DEMO_USERS)、投稿 10 件(公開・フォロワー限定・非公開)、
//             フォロー、いいね、コメント、マイリスト(行きたい / 訪問済み)
// デモ用のアカウント(公開してよい、デモ専用の値): 各ユーザーのメールと、共通のパスワード(DEMO_PASSWORD)

const DEMO_PASSWORD = 'DemoPass123!';
const DEMO_USERS = [
  { key: 'haruka', name: 'はるか', email: 'demo-haruka@example.com' },
  { key: 'kenta', name: 'けんた', email: 'demo-kenta@example.com' },
  { key: 'mika', name: 'みか', email: 'demo-mika@example.com' },
];

// 投稿(author は DEMO_USERS の key)。地図は準備中のため、緯度・経度も入れておく
const SPOTS = [
  { author: 'haruka', name: '清水寺', areas: ['京都府'], visibility: 'public', address: '京都府京都市東山区清水1-294', latitude: 34.9949, longitude: 135.785, review: '朝イチに行くと人が少なく、舞台からの景色がとてもきれいでした。' },
  { author: 'haruka', name: '嵐山の竹林の小径', areas: ['京都府'], visibility: 'public', address: '京都府京都市右京区嵯峨小倉山田淵山町', latitude: 35.0094, longitude: 135.6709, review: '早朝の竹林は静かで、散歩にぴったりです。' },
  { author: 'haruka', name: '伏見稲荷大社', areas: ['京都府', '大阪府'], visibility: 'followers', address: '京都府京都市伏見区深草藪之内町68', latitude: 34.9671, longitude: 135.7727, review: '(フォロワー限定)千本鳥居は夕方がおすすめ。' },
  { author: 'kenta', name: '熊本城', areas: ['熊本県'], visibility: 'public', address: '熊本県熊本市中央区本丸1-1', latitude: 32.8061, longitude: 130.7058, review: '復旧が進んだ天守閣と、石垣の迫力がすごいです。' },
  { author: 'kenta', name: '阿蘇の草千里ヶ浜', areas: ['熊本県'], visibility: 'public', address: '熊本県阿蘇市永草', latitude: 32.8821, longitude: 131.0848, review: '広い草原と火山のコントラストが見事でした。' },
  { author: 'kenta', name: '小樽運河', areas: ['北海道'], visibility: 'public', address: '北海道小樽市港町', latitude: 43.1996, longitude: 141.0027, review: '夕暮れのガス灯が雰囲気たっぷりです。' },
  { author: 'kenta', name: '下書きのメモ(非公開)', areas: ['東京都'], visibility: 'private', address: null, latitude: null, longitude: null, review: '自分だけが見られる投稿の例です。' },
  { author: 'mika', name: '浅草寺', areas: ['東京都'], visibility: 'public', address: '東京都台東区浅草2-3-1', latitude: 35.7148, longitude: 139.7967, review: '仲見世通りで食べ歩き。平日の朝が空いています。' },
  { author: 'mika', name: '美ら海水族館', areas: ['沖縄県'], visibility: 'public', address: '沖縄県国頭郡本部町石川424', latitude: 26.6943, longitude: 127.8779, review: '大水槽のジンベエザメは必見です。' },
  { author: 'mika', name: '首里城公園', areas: ['沖縄県'], visibility: 'followers', address: '沖縄県那覇市首里金城町1-2', latitude: 26.2172, longitude: 127.7195, review: '(フォロワー限定)再建が進む正殿を見てきました。' },
];

// [誰が, 誰を] フォロー
const FOLLOWS = [['kenta', 'haruka'], ['mika', 'haruka'], ['haruka', 'kenta'], ['haruka', 'mika']];
// [誰が, 投稿名] いいね(自分の投稿にはできない)
const LIKES = [['kenta', '清水寺'], ['mika', '清水寺'], ['mika', '嵐山の竹林の小径'], ['haruka', '熊本城'], ['mika', '熊本城'], ['haruka', '美ら海水族館'], ['kenta', '浅草寺']];
// [誰が, 投稿名, コメント]
const COMMENTS = [
  ['kenta', '清水寺', '来月行く予定です。おすすめの時間帯はありますか?'],
  ['haruka', '清水寺', '朝 8 時ごろが空いていました。ぜひ!'],
  ['mika', '熊本城', '去年行きました。夜のライトアップも素敵でした。'],
  ['haruka', '熊本城', '次の旅行の参考にします。'],
  ['kenta', '浅草寺', '人形焼がおいしかったです。'],
];
// [誰が, 投稿名, 状態] マイリスト(wishlist: 行きたい、visited: 訪問済み)
const LISTS = [['kenta', '清水寺', 'wishlist'], ['mika', '嵐山の竹林の小径', 'visited'], ['haruka', '熊本城', 'wishlist'], ['haruka', '浅草寺', 'visited'], ['mika', '小樽運河', 'wishlist']];

const base = process.argv[2];
const force = process.argv.includes('--force');
if (!base || !/^https?:\/\//.test(base)) {
  console.error('使い方: node scripts/seed-demo-data.mjs <ベースの URL> [--force]\n  例: node scripts/seed-demo-data.mjs https://xxxx.cloudfront.net');
  process.exit(2);
}
const origin = base.replace(/\/+$/, '');

async function call(method, path, { token, body, ok = [200, 201, 204] } = {}) {
  const res = await fetch(origin + path, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!ok.includes(res.status)) {
    throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 200)}`);
  }
  return { status: res.status, data };
}

// ---- ユーザー ----------------------------------------------------------
const users = {};
let existing = 0;
for (const u of DEMO_USERS) {
  const reg = await call('POST', '/api/auth/register', { body: { name: u.name, email: u.email, password: DEMO_PASSWORD }, ok: [201, 409] });
  let session = reg.data;
  if (reg.status === 409) {
    existing++;
    session = (await call('POST', '/api/auth/login', { body: { email: u.email, password: DEMO_PASSWORD } })).data;
  }
  users[u.key] = { ...u, id: session.user.id, token: session.accessToken };
  console.log(`${reg.status === 201 ? '作成' : '既存'}  ユーザー ${u.name} (${u.email})`);
}

if (existing > 0 && !force) {
  console.log('\nデモ用のユーザーがすでにいるため、投稿などは追加しません(追加するときは --force)。');
  process.exit(0);
}

// ---- 投稿 --------------------------------------------------------------
const spotIds = {};
for (const s of SPOTS) {
  const { author, ...input } = s;
  const res = await call('POST', '/api/spots', { token: users[author].token, body: input });
  spotIds[s.name] = res.data.id;
  console.log(`投稿  ${s.name} (${users[author].name}、${s.visibility})`);
}

// ---- フォロー・いいね・コメント・マイリスト ------------------------------------
// フォローを先に済ませる(フォロワー限定の投稿は、フォロワーだけが、いいね・コメントなどをできる)
for (const [who, target] of FOLLOWS) {
  await call('POST', `/api/users/${users[target].id}/follow`, { token: users[who].token });
}
console.log(`フォロー  ${FOLLOWS.length} 件`);
for (const [who, name] of LIKES) {
  await call('POST', `/api/spots/${spotIds[name]}/like`, { token: users[who].token });
}
console.log(`いいね  ${LIKES.length} 件`);
for (const [who, name, body] of COMMENTS) {
  await call('POST', `/api/spots/${spotIds[name]}/comments`, { token: users[who].token, body: { body } });
}
console.log(`コメント  ${COMMENTS.length} 件`);
for (const [who, name, status] of LISTS) {
  await call('PUT', `/api/spots/${spotIds[name]}/list`, { token: users[who].token, body: { status } });
}
console.log(`マイリスト  ${LISTS.length} 件`);

console.log(`\n完了。ログインできるデモ用のアカウント(パスワードは共通: ${DEMO_PASSWORD}):`);
for (const u of DEMO_USERS) console.log(`  ${u.name}: ${u.email}`);
