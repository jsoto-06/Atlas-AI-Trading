/**
 * Utility functions for Bitget API integration.
 */

/**
 * Traduce un símbolo común como "BTC/USDT" al formato adecuado de Bitget (SBTCSUSDT para Demo o BTCUSDT para Real).
 */
export function mapSymbol(symbol: string): string {
  const clean = symbol.replace('/', '').toUpperCase();
  const isReal = process.env.BITGET_MODO_REAL === 'true';
  if (isReal) {
    if (clean.startsWith('S-')) {
      return clean.substring(2);
    }
    if (clean.startsWith('S') && clean.endsWith('SUSDT') && clean.length > 6) {
      const base = clean.substring(1, clean.length - 5);
      return `${base}USDT`;
    }
    if (clean.startsWith('S') && clean.endsWith('SUSDC') && clean.length > 6) {
      const base = clean.substring(1, clean.length - 5);
      return `${base}USDC`;
    }
    return clean;
  } else {
    // Modo Demo (Simulado)
    // Bitget utiliza el formato SBTCSUSDT para simulado (S + base + S + quote)
    if (clean.endsWith('USDT')) {
      const base = clean.substring(0, clean.length - 4);
      if (clean.startsWith('S') && clean.endsWith('SUSDT') && clean.length > 6) {
        return clean;
      }
      let normalizedBase = base;
      if (base.startsWith('S-')) {
        normalizedBase = base.substring(2);
      } else if (base.startsWith('S') && base.length > 3) {
        normalizedBase = base.substring(1);
      }
      return `S${normalizedBase}SUSDT`;
    }
    if (clean.endsWith('USDC')) {
      const base = clean.substring(0, clean.length - 4);
      if (clean.startsWith('S') && clean.endsWith('SUSDC') && clean.length > 6) {
        return clean;
      }
      let normalizedBase = base;
      if (base.startsWith('S-')) {
        normalizedBase = base.substring(2);
      } else if (base.startsWith('S') && base.length > 3) {
        normalizedBase = base.substring(1);
      }
      return `S${normalizedBase}SUSDC`;
    }
    
    // Fallback
    if (!clean.startsWith('S-') && !clean.startsWith('S')) {
      return `S-${clean}`;
    }
    return clean;
  }
}

/**
 * Retorna el tipo de producto adecuado según el entorno operativo (Real vs Demo).
 */
export function getProductType(): string {
  return process.env.BITGET_MODO_REAL === 'true' ? 'USDT-FUTURES' : 'SUSDT-FUTURES';
}

/**
 * Mapea temporalidades comunes a granularidad de Bitget.
 */
export function mapTimeframeToGranularity(timeframe: string): string {
  const tf = timeframe.toLowerCase();
  switch (tf) {
    case '1m': return '1m';
    case '3m': return '3m';
    case '5m': return '5m';
    case '15m': return '15m';
    case '30m': return '30m';
    case '1h': return '1H';
    case '4h': return '4H';
    case '12h': return '12H';
    case '1d': return '1D';
    case '1w': return '1W';
    default: return '1H';
  }
}

