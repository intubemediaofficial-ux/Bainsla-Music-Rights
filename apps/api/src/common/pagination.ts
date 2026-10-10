import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class PageQuery {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export interface Page<T> {
  data: T[];
  nextCursor: string | null;
}

/** Prisma args for id-cursor pagination; fetches one extra row to detect the next page. */
export function pageArgs(q: PageQuery, defaultLimit = 25) {
  const take = Math.min(q.limit ?? defaultLimit, 200);
  return {
    take: take + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
  };
}

export function toPage<T extends { id: string }>(rows: T[], q: PageQuery, defaultLimit = 25): Page<T> {
  const take = Math.min(q.limit ?? defaultLimit, 200);
  const hasMore = rows.length > take;
  const data = hasMore ? rows.slice(0, take) : rows;
  return { data, nextCursor: hasMore ? data[data.length - 1].id : null };
}
