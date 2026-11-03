"use client";
export const cx = (...values: Array<string | false | undefined | null>) => values.filter(Boolean).join(" ");
export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return <span aria-label="Loading preview" role="status" className={cx("inline-block animate-spin rounded-full border-2 border-current border-t-transparent", className)} style={{ width: size, height: size }} />;
}
