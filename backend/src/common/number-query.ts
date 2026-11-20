// クエリ文字列の数値の変換。
// `@Type(() => Number)` だけだと、空文字('')や空白だけの文字列が 0 になり、
// 「指定がない」のに「0」として受け付けてしまう。空・空白だけは、未指定(undefined)として扱い、
// 必須の項目は、検証で 400 になるようにする。数値以外('abc'、'NaN'、'Infinity')は、そのまま NaN・Infinity にして、検証で弾く
export const toNumber = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string'
    ? value.trim() === ''
      ? undefined
      : Number(value)
    : value;
