/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Mapea un símbolo estándar (ej. "BTC/USDT", "BTC/USD") al símbolo correspondiente
 * de contratos perpetuos en Kraken Futures (ej. "PF_XBTUSD", "PF_ETHUSD", "PF_SOLUSD").
 */
export function mapKrakenSymbol(symbol: string): string {
  const clean = symbol.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

  if (clean.includes('BTC') || clean.includes('XBT')) {
    return 'PF_XBTUSD';
  }
  if (clean.includes('ETH')) {
    return 'PF_ETHUSD';
  }
  if (clean.includes('SOL')) {
    return 'PF_SOLUSD';
  }

  // Si ya viene con prefijo PF_ o PI_
  if (clean.startsWith('PF') || clean.startsWith('PI')) {
    return clean;
  }

  return `PF_${clean}USD`;
}

/**
 * Retorna la URL base de la API REST v3 de Kraken Futures según el modo (Real vs Demo/Sandbox).
 */
export function getKrakenBaseUrl(isReal: boolean = false): string {
  if (process.env.KRAKEN_API_URL) {
    return process.env.KRAKEN_API_URL;
  }
  return isReal ? 'https://futures.kraken.com/derivatives/api/v3' : 'https://demo-futures.kraken.com/derivatives/api/v3';
}

/**
 * Retorna la URL oficial para tickers y precios de mercado en tiempo real de Kraken Futures.
 */
export function getKrakenPublicMarketUrl(): string {
  return 'https://futures.kraken.com/derivatives/api/v3';
}

/**
 * Retorna la URL del WebSocket de Kraken Futures según el modo.
 */
export function getKrakenWsUrl(isReal: boolean = false): string {
  return isReal
    ? 'wss://futures.kraken.com/ws/v1'
    : 'wss://demo-futures.kraken.com/ws/v1';
}

/**
 * En Kraken Futures (PF_XBTUSD, PF_ETHUSD, PF_SOLUSD), 1 contrato típicamente equivale a 1 USD
 * de valor nocional (Inverse/Linear contract specs de Kraken Futures).
 * 
 * Esta función calcula el número entero de contratos a enviar según el tamaño de orden en USD.
 */
export function formatKrakenContracts(symbol: string, usdAmount: number, price: number): number {
  if (usdAmount <= 0) return 1;

  const krakenSym = mapKrakenSymbol(symbol);

  // Para contratos estándar PF_XBTUSD / PF_ETHUSD / PF_SOLUSD, el tamaño es nocional en USD (1 contrato = $1 USD)
  if (krakenSym.startsWith('PF_')) {
    return Math.max(1, Math.round(usdAmount));
  }

  // Si fuese contrato fraccionario en moneda base (fallback)
  const rawCoinSize = usdAmount / (price || 1);
  return Math.max(0.001, Number(rawCoinSize.toFixed(4)));
}
