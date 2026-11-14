// モック用のダミーデータ(API 実装後に置き換える)
export type Visibility = 'public' | 'followers' | 'private'

export interface MockComment {
  id: number
  author: string
  body: string
}

export interface MockSpot {
  id: number
  name: string
  note: string
  address: string
  lat: number
  lng: number
  areas: string[]
  visibility: Visibility
  author: string
  likes: number
  hue: number // 写真の代わりに表示する色
  photoCount: number
  comments: MockComment[]
}

export const prefectures = [
  '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県', '茨城県', '栃木県', '群馬県',
  '埼玉県', '千葉県', '東京都', '神奈川県', '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県',
  '岐阜県', '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県',
  '鳥取県', '島根県', '岡山県', '広島県', '山口県', '徳島県', '香川県', '愛媛県', '高知県', '福岡県',
  '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県',
]

export const visibilityLabels: Record<Visibility, string> = {
  public: '公開',
  followers: 'フォロワー限定',
  private: '非公開',
}

export const mockSpots: MockSpot[] = [
  {
    id: 1,
    name: '清水寺',
    note: '朝イチに行くと人が少なく、舞台からの景色がとてもきれいでした。',
    address: '京都府京都市東山区清水1-294',
    lat: 34.9949,
    lng: 135.785,
    areas: ['京都府'],
    visibility: 'public',
    author: 'はるか',
    likes: 24,
    hue: 20,
    photoCount: 4,
    comments: [
      { id: 1, author: 'けんた', body: '来月行く予定です。おすすめの時間帯はありますか?' },
      { id: 2, author: 'はるか', body: '開門直後の 6 時台がおすすめです。' },
    ],
  },
  {
    id: 2,
    name: '函館山ロープウェイ',
    note: '夜景は噂どおりの絶景。風が強いので上着が必須です。',
    address: '北海道函館市函館山',
    lat: 41.7595,
    lng: 140.7046,
    areas: ['北海道'],
    visibility: 'public',
    author: 'そうた',
    likes: 18,
    hue: 230,
    photoCount: 6,
    comments: [],
  },
  {
    id: 3,
    name: '首里城公園',
    note: '復元中の様子も見られて、それはそれで貴重な体験でした。',
    address: '沖縄県那覇市首里金城町1-2',
    lat: 26.217,
    lng: 127.7195,
    areas: ['沖縄県'],
    visibility: 'public',
    author: 'みお',
    likes: 9,
    hue: 0,
    photoCount: 3,
    comments: [{ id: 3, author: 'はるか', body: '写真きれいですね!' }],
  },
  {
    id: 4,
    name: '金沢 近江町市場',
    note: '海鮮丼が絶品。昼前に行くと並ばずに入れました。',
    address: '石川県金沢市上近江町50',
    lat: 36.5731,
    lng: 136.6588,
    areas: ['石川県'],
    visibility: 'followers',
    author: 'けんた',
    likes: 31,
    hue: 175,
    photoCount: 8,
    comments: [],
  },
  {
    id: 5,
    name: '阿蘇山 草千里ヶ浜',
    note: '馬がのんびり歩いていて癒やされました。天気が良ければ絶景です。',
    address: '熊本県阿蘇市黒川',
    lat: 32.8814,
    lng: 131.0856,
    areas: ['熊本県', '大分県'],
    visibility: 'public',
    author: 'みお',
    likes: 12,
    hue: 110,
    photoCount: 5,
    comments: [],
  },
  {
    id: 6,
    name: '江ノ島',
    note: '夕方の富士山のシルエットが忘れられません。',
    address: '神奈川県藤沢市江の島2丁目',
    lat: 35.2994,
    lng: 139.4806,
    areas: ['神奈川県'],
    visibility: 'private',
    author: 'あなた',
    likes: 0,
    hue: 195,
    photoCount: 2,
    comments: [],
  },
  {
    id: 7,
    name: '熊本城',
    note: '天守閣からの眺めが最高でした。復旧中の石垣も見学できます。',
    address: '熊本県熊本市中央区本丸1-1',
    lat: 32.8061,
    lng: 130.7058,
    areas: ['熊本県'],
    visibility: 'public',
    author: 'そうた',
    likes: 15,
    hue: 45,
    photoCount: 4,
    comments: [],
  },
  {
    id: 8,
    name: '黒川温泉',
    note: '入湯手形で温泉めぐり。川沿いの露天風呂が気持ちよかったです。',
    address: '熊本県阿蘇郡南小国町満願寺',
    lat: 33.0643,
    lng: 131.1431,
    areas: ['熊本県'],
    visibility: 'public',
    author: 'はるか',
    likes: 27,
    hue: 300,
    photoCount: 7,
    comments: [],
  },
  {
    id: 9,
    name: '嵐山 竹林の小径',
    note: '早朝は静かで、竹の間から光が差してとてもきれいでした。',
    address: '京都府京都市右京区嵯峨小倉山',
    lat: 35.0094,
    lng: 135.6673,
    areas: ['京都府'],
    visibility: 'public',
    author: 'みお',
    likes: 20,
    hue: 140,
    photoCount: 5,
    comments: [],
  },
]

export function findSpot(id: number) {
  return mockSpots.find((s) => s.id === id)
}

const NEARBY_LIMIT = 5

// 近くのスポット: 同じエリアタグを持つ他の公開投稿を新着順(モックでは ID の降順)で最大 5 件
export function findNearbySpots(spot: MockSpot) {
  return mockSpots
    .filter((s) => s.id !== spot.id && s.visibility === 'public' && s.areas.some((a) => spot.areas.includes(a)))
    .sort((a, b) => b.id - a.id)
    .slice(0, NEARBY_LIMIT)
}

export interface MockUser {
  id: number
  name: string
  followers: number
  following: number
}

export const mockUsers: MockUser[] = [
  { id: 1, name: 'はるか', followers: 120, following: 45 },
  { id: 2, name: 'そうた', followers: 34, following: 80 },
  { id: 3, name: 'みお', followers: 58, following: 22 },
  { id: 4, name: 'けんた', followers: 77, following: 60 },
  { id: 5, name: 'あなた', followers: 3, following: 4 },
]

export function findUser(id: number) {
  return mockUsers.find((u) => u.id === id)
}

export function userIdByName(name: string) {
  return mockUsers.find((u) => u.name === name)?.id
}
