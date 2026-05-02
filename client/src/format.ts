import type { PairDef } from './api.ts';

export function formatValue(value: number | null, pair?: PairDef): string {
  if (value === null || Number.isNaN(value)) return '—';
  const decimals = pair?.decimals ?? 2;
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatRelative(unixSeconds: number | null): string {
  if (!unixSeconds) return 'never';
  const diff = Date.now() / 1000 - unixSeconds;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function formatFuture(unixSeconds: number | null): string {
  if (!unixSeconds) return 'unscheduled';
  const diff = unixSeconds - Date.now() / 1000;
  if (diff <= 0) return 'any moment';
  if (diff < 60) return `in <1m`;
  if (diff < 3600) return `in ${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `in ${Math.floor(diff / 3600)}h`;
  return `in ${Math.floor(diff / 86400)}d`;
}

export function formatDateTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
