/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface PnLBreakdown {
  grossPnL: number;
  entryFee: number;
  exitFee: number;
  fundingFees: number;
  slippageCost: number;
  netRealizedPnL: number;
  pnlPercentage: number;
  isEstimatedFee: boolean;
}

export class PnLCalculator {
  /**
   * Calcula el desglose unificado de PnL para una posición cerrada.
   */
  public static calculateRealizedPnL(params: {
    side: 'BUY' | 'SELL' | 'LONG' | 'SHORT';
    entryPrice: number;
    exitPrice: number;
    quantity: number;
    triggerPrice?: number;
    entryFee?: number;
    exitFee?: number;
    feeRate?: number; // Por defecto 0.0006 (0.06%)
    fundingFees?: number;
  }): PnLBreakdown {
    const { side, entryPrice, exitPrice, quantity, triggerPrice, fundingFees = 0 } = params;
    const defaultFeeRate = params.feeRate || 0.0006;
    const isLong = side === 'BUY' || side === 'LONG';

    // 1. Gross PnL
    const direction = isLong ? 1 : -1;
    const grossPnL = (exitPrice - entryPrice) * quantity * direction;

    // 2. Fees (Reales o Estimados)
    const isEstimatedFee = params.entryFee === undefined || params.exitFee === undefined;
    const entryFee = params.entryFee !== undefined ? params.entryFee : (entryPrice * quantity * defaultFeeRate);
    const exitFee = params.exitFee !== undefined ? params.exitFee : (exitPrice * quantity * defaultFeeRate);

    // 3. Slippage
    let slippageCost = 0;
    if (triggerPrice && triggerPrice > 0) {
      if (isLong) {
        slippageCost = Math.max(0, (exitPrice - triggerPrice) * quantity);
      } else {
        slippageCost = Math.max(0, (triggerPrice - exitPrice) * quantity);
      }
    }

    // 4. Net Realized PnL
    const totalFees = entryFee + exitFee + fundingFees;
    const netRealizedPnL = grossPnL - totalFees - slippageCost;

    // 5. PnL % sobre el margen expuesto
    const capitalExposed = entryPrice * quantity;
    const pnlPercentage = capitalExposed > 0 ? (netRealizedPnL / capitalExposed) * 100 : 0;

    return {
      grossPnL: Number(grossPnL.toFixed(4)),
      entryFee: Number(entryFee.toFixed(4)),
      exitFee: Number(exitFee.toFixed(4)),
      fundingFees: Number(fundingFees.toFixed(4)),
      slippageCost: Number(slippageCost.toFixed(4)),
      netRealizedPnL: Number(netRealizedPnL.toFixed(4)),
      pnlPercentage: Number(pnlPercentage.toFixed(4)),
      isEstimatedFee
    };
  }

  /**
   * Calcula el PnL no realizado (Unrealized PnL) para una posición activa.
   */
  public static calculateUnrealizedPnL(params: {
    side: 'BUY' | 'SELL' | 'LONG' | 'SHORT';
    entryPrice: number;
    currentPrice: number;
    quantity: number;
  }): { unrealizedPnL: number; pnlPercentage: number } {
    const { side, entryPrice, currentPrice, quantity } = params;
    const isLong = side === 'BUY' || side === 'LONG';
    const direction = isLong ? 1 : -1;

    const unrealizedPnL = (currentPrice - entryPrice) * quantity * direction;
    const capitalExposed = entryPrice * quantity;
    const pnlPercentage = capitalExposed > 0 ? (unrealizedPnL / capitalExposed) * 100 : 0;

    return {
      unrealizedPnL: Number(unrealizedPnL.toFixed(4)),
      pnlPercentage: Number(pnlPercentage.toFixed(4))
    };
  }
}
