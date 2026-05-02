export type PairDef = {
  id: string;
  label: string;
  quote: string;
  decimals: number;
  source: 'binance' | 'forex';
  symbol?: string;
  base?: string;
  target?: string;
};

export const PAIRS: PairDef[] = [
  { id: 'BTC/USDT', label: 'Bitcoin', quote: 'USDT', decimals: 2, source: 'binance', symbol: 'BTCUSDT' },
  { id: 'ETH/USDT', label: 'Ethereum', quote: 'USDT', decimals: 2, source: 'binance', symbol: 'ETHUSDT' },
  { id: 'PAXG/USDT', label: 'PAX Gold', quote: 'USDT', decimals: 2, source: 'binance', symbol: 'PAXGUSDT' },
  { id: 'SOL/USDT', label: 'Solana', quote: 'USDT', decimals: 2, source: 'binance', symbol: 'SOLUSDT' },
  { id: 'BNB/USDT', label: 'BNB', quote: 'USDT', decimals: 2, source: 'binance', symbol: 'BNBUSDT' },
  { id: 'USD/IDR', label: 'US Dollar → Rupiah', quote: 'IDR', decimals: 0, source: 'forex', base: 'USD', target: 'IDR' },
  { id: 'EUR/USD', label: 'Euro → Dollar', quote: 'USD', decimals: 4, source: 'forex', base: 'EUR', target: 'USD' },
  { id: 'SGD/IDR', label: 'Singapore Dollar → Rupiah', quote: 'IDR', decimals: 0, source: 'forex', base: 'SGD', target: 'IDR' },
];

export function getPair(id: string): PairDef | undefined {
  return PAIRS.find((p) => p.id === id);
}

export function describeSource(pair: PairDef): { source: string; url: string } {
  if (pair.source === 'binance' && pair.symbol) {
    return {
      source: 'binance',
      url: `https://data-api.binance.vision/api/v3/ticker/price?symbol=${pair.symbol}`,
    };
  }
  if (pair.source === 'forex' && pair.base && pair.target) {
    return {
      source: 'yahoo-finance',
      url: `https://query1.finance.yahoo.com/v8/finance/chart/${pair.base}${pair.target}=X?interval=1m`,
    };
  }
  return { source: 'unknown', url: '' };
}

export function formatValue(pair: string, value: number): string {
  const def = getPair(pair);
  const decimals = def?.decimals ?? 2;
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
