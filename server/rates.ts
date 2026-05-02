import { getPair, PAIRS, type PairDef } from './pairs.ts';

async function fetchBinance(symbol: string): Promise<number> {
  const res = await fetch(`https://data-api.binance.vision/api/v3/ticker/price?symbol=${symbol}`);
  if (!res.ok) throw new Error(`Binance ${symbol}: ${res.status}`);
  const data = (await res.json()) as { price: string };
  return parseFloat(data.price);
}

async function fetchForex(base: string, target: string): Promise<number> {
  const symbol = `${base}${target}=X`;
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1m`,
    { headers: { 'User-Agent': 'Mozilla/5.0' } }
  );
  if (!res.ok) throw new Error(`Yahoo ${symbol}: ${res.status}`);
  const data = (await res.json()) as {
    chart: { result?: Array<{ meta: { regularMarketPrice?: number } }>; error?: { description?: string } | null };
  };
  const price = data.chart.result?.[0]?.meta?.regularMarketPrice;
  if (typeof price !== 'number') {
    throw new Error(`Yahoo ${symbol}: ${data.chart.error?.description ?? 'missing price'}`);
  }
  return price;
}

export async function fetchRate(pair: PairDef): Promise<number> {
  if (pair.source === 'binance' && pair.symbol) {
    return fetchBinance(pair.symbol);
  }
  if (pair.source === 'forex' && pair.base && pair.target) {
    return fetchForex(pair.base, pair.target);
  }
  throw new Error(`Unknown pair source for ${pair.id}`);
}

export async function fetchAllRates(): Promise<Record<string, { value: number | null; error: string | null }>> {
  const out: Record<string, { value: number | null; error: string | null }> = {};
  await Promise.all(
    PAIRS.map(async (p) => {
      try {
        out[p.id] = { value: await fetchRate(p), error: null };
      } catch (err) {
        out[p.id] = { value: null, error: err instanceof Error ? err.message : String(err) };
      }
    })
  );
  return out;
}

export async function fetchPair(pairId: string): Promise<number> {
  const def = getPair(pairId);
  if (!def) throw new Error(`Unknown pair: ${pairId}`);
  return fetchRate(def);
}
