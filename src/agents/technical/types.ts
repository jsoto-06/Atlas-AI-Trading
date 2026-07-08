/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// ============================================================================
// Tipos de Indicadores Cuantitativos (Fast-Loop)
// ============================================================================

export interface IndicadoresCuantitativos {
  rsi: number;
  macd: {
    linea: number;
    senal: number;
    histograma: number;
    crossover: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  };
  ema: {
    rapida: number; // e.g. 9 EMA
    lenta: number;  // e.g. 21 EMA
    tendencia: 'ALCISTA' | 'BAJISTA' | 'NEUTRAL';
  };
  sma: {
    sma200: number;
    precioPorEncima: boolean;
  };
  vwap: {
    valor: number;
    precioRelativo: 'POR_ENCIMA' | 'POR_DEBAJO' | 'CRUZANDO';
  };
  atr: number; // Average True Range para volatilidad y Stops
  adx: {
    valor: number; // Fuerza de tendencia
    tendenciaFuerte: boolean;
    direccionalidad: 'ALCISTA' | 'BAJISTA' | 'NEUTRAL'; // DI+ vs DI-
  };
  bollinger: {
    bandaSuperior: number;
    bandaMedia: number;
    bandaInferior: number;
    posicionPrecio: 'SOBRECOMPRA' | 'SOBREVENTA' | 'RANGO_MEDIO';
  };
}

// ============================================================================
// Tipos de Smart Money Concepts / ICT (Slow-Loop / Gemini Visual)
// ============================================================================

export interface FairValueGap {
  tipo: 'ALCISTA' | 'BAJISTA';
  precioInicio: number;
  precioFin: number;
  mitigado: boolean;
}

export interface LiquiditySweep {
  tipo: 'COMPRA' | 'VENTA'; // Barrido de máximos o mínimos
  nivelPrecio: number;
  completado: boolean;
}

export interface OrderBlock {
  tipo: 'ALCISTA' | 'BAJISTA'; // Bloques de órdenes institucionales
  rangoPrecio: {
    alto: number;
    bajo: number;
  };
  volumenAsociado: string; // 'ALTO' | 'MEDIO' | 'BAJO'
  mitigado: boolean;
}

export interface MarketStructureShift {
  tipo: 'BOS' | 'CHOCH' | 'NINGUNO'; // Break of Structure o Change of Character
  nivelPrecio: number;
  direccion: 'ALCISTA' | 'BAJISTA';
  confirmado: boolean;
}

export interface AnalisisCognitivoVisual {
  estructuraMercado: 'ALCISTA' | 'BAJISTA' | 'CONSOLIDACION_LATERAL';
  faseWyckoff: 'ACUMULACION' | 'PARTICIPACION_ALCISTA' | 'DISTRIBUCION' | 'PARTICIPACION_BAJISTA' | 'NINGUNO';
  patronElliott: string; // e.g. "Onda 3 de Impulso", "Corrección ABC"
  fairValueGaps: FairValueGap[];
  liquiditySweeps: LiquiditySweep[];
  orderBlocks: OrderBlock[];
  cambiosEstructura: MarketStructureShift[];
  resumenVisual: string; // Justificación cualitativa observada por Gemini
}

// ============================================================================
// Output Consolidado del Agente Técnico para el Blackboard
// ============================================================================

export interface TechnicalAnalystOutput {
  simbolo: string;
  temporalidad: string;
  timestamp: number;
  indicadores: IndicadoresCuantitativos;
  analisisVisual?: AnalisisCognitivoVisual; // Opcional si solo se ejecuta Fast-Loop
  scoreConsolidado: number; // -100 a +100
  confianza: number; // 0.0 a 1.0
  justificacionConsolidada: string;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
