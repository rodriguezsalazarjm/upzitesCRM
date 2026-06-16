"use client";

import { useEffect, useRef } from "react";
import { trackViewContent } from "@/lib/meta-pixel";

type ViewContentOnLoadProps = {
  contentName: string;
  contentCategory: string;
  contentId?: string;
  value?: number;
  currency?: string;
};

export function ViewContentOnLoad({
  contentName,
  contentCategory,
  contentId,
  value,
  currency = "CLP",
}: ViewContentOnLoadProps) {
  const tracked = useRef(false);

  useEffect(() => {
    if (tracked.current) return;

    trackViewContent({
      content_name: contentName,
      content_category: contentCategory,
      content_ids: contentId ? [contentId] : undefined,
      value,
      currency,
    });
    tracked.current = true;
  }, [contentCategory, contentId, contentName, currency, value]);

  return null;
}
