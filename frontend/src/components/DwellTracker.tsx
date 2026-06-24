"use client";

import { useDwellTime } from "@/hooks/useDwellTime";

interface Props {
  productId: string;
  categoryId?: string;
  labelIds?: string[];
}

export function DwellTracker({ productId, categoryId, labelIds }: Props) {
  useDwellTime({ productId, categoryId, labelIds: labelIds ?? [] });
  return null;
}
