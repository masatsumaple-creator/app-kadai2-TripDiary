// TripDiary の Terraform の state 用 S3 バケット(tripdiary-tfstate-*)の、すべての版と削除マーカーを削除する。
// 対象は、名前が tripdiary-tfstate- で始まるバケットだけ(ほかのプロジェクトのバケットには触らない)。
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const aws = (args) => execFileSync('aws.exe', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const bucket = process.argv[2];
if (!bucket || !bucket.startsWith('tripdiary-tfstate-')) throw new Error('対象のバケット名が正しくありません: ' + bucket);

const listed = JSON.parse(aws(['s3api', 'list-object-versions', '--bucket', bucket, '--output', 'json']));
const targets = [...(listed.Versions ?? []), ...(listed.DeleteMarkers ?? [])].map((v) => ({ Key: v.Key, VersionId: v.VersionId }));
console.log(`削除する版・マーカー: ${targets.length} 件`);

for (let i = 0; i < targets.length; i += 500) {
  const batch = targets.slice(i, i + 500);
  const file = path.join(os.tmpdir(), `delete-batch-${i}.json`);
  fs.writeFileSync(file, JSON.stringify({ Objects: batch, Quiet: true }));
  const out = aws(['s3api', 'delete-objects', '--bucket', bucket, '--delete', 'file://' + file, '--output', 'json']);
  const errors = out.trim() ? JSON.parse(out).Errors ?? [] : [];
  console.log(`  ${i + batch.length} / ${targets.length} 件、エラー ${errors.length} 件`);
  if (errors.length) throw new Error(JSON.stringify(errors.slice(0, 3)));
}

const after = JSON.parse(aws(['s3api', 'list-object-versions', '--bucket', bucket, '--output', 'json']));
console.log(`残り: 版 ${(after.Versions ?? []).length} 件、削除マーカー ${(after.DeleteMarkers ?? []).length} 件`);
