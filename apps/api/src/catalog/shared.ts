import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PageQuery } from '../common/pagination.js';

export class ListQuery extends PageQuery {
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsString() archived?: string;
}

export const trimOrNull = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value));
export const toDate = () => Type(() => Date);

export function found<T>(v: T | null | undefined, what = 'Record'): T {
  if (!v) throw new NotFoundException(`${what} not found`);
  return v;
}

export function contains(q?: string) {
  const t = q?.trim().slice(0, 100);
  return t ? { contains: t, mode: 'insensitive' as const } : undefined;
}

/** Turn Prisma unique-constraint errors into a readable 400. */
export function uniqueGuard(e: unknown, message: string): never {
  if (e && typeof e === 'object' && (e as { code?: string }).code === 'P2002') throw new BadRequestException(message);
  throw e;
}

export const dec = (v: unknown) => (v == null ? 0 : Number(v));
