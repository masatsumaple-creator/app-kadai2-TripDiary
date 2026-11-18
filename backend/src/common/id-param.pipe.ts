import { Injectable, PipeTransform } from '@nestjs/common';
import { ApiError } from './api-error.js';

const MAX_INT = 2_147_483_647; // DB の INT の上限

// パスの :id を整数にする。不正な値は「見つからない」として 404 にする
// (大きすぎる数字を DB に渡して 500 になるのを防ぐ)
export function parseId(value: string, notFoundMessage: string): number {
  const id = /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(id) || id < 1 || id > MAX_INT) {
    throw new ApiError(404, 'NOT_FOUND', notFoundMessage);
  }
  return id;
}

// 投稿の ID 用
@Injectable()
export class IdParamPipe implements PipeTransform<string, number> {
  transform(value: string): number {
    return parseId(value, '投稿が見つかりません。');
  }
}

// ユーザーの ID 用
@Injectable()
export class UserIdParamPipe implements PipeTransform<string, number> {
  transform(value: string): number {
    return parseId(value, 'ユーザーが見つかりません。');
  }
}
