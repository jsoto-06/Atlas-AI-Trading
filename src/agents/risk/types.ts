/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface RiskManagerAnalystOutput {
  simbolo: string;
  temporalidad: string;
  timestamp: number;
  
  // Contratos y tipos estrictos de TypeScript para la salida del Risk Manager
  safe_to_operate: boolean; // Si pasa todos los filtros de seguridad deterministas
  max_position_size: number; // Tamaño máximo de la posición calculada en unidades del activo o USD
  calculated_stop_loss: number; // Nivel de precio exacto para el Stop Loss
  calculated_take_profit: number; // Nivel de precio exacto para el Take Profit
  trailing_stop_activation: number; // Nivel de activación del Trailing Stop
  kelly_fraction: number; // Fracción de Kelly recomendada (e.g. Half-Kelly)
  risk_reward_ratio: number; // Ratio riesgo/beneficio (mínimo 1:2)
  rejection_reason: string | null; // Razón de rechazo exacta si safe_to_operate es false
  justificacionConsolidada: string; // Explicación de las operaciones y cálculos en castellano
}
