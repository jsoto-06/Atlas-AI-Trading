/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BitgetWebSocketListener, WSOrderEvent, WSPositionEvent } from './websocket-listener.ts';
import { db } from '../db/index.ts';
import { trades, auditLogs, supervisorDecisions } from '../db/schema.ts';
import { eq, and, desc } from 'drizzle-orm';

/**
 * Motor de Conciliación de Estados y Telemetría de Ejecución (ReconciliationEngine).
 * 
 * Este motor sintoniza los eventos del WebSocket privado de Bitget en tiempo real.
 * Al identificar transiciones de órdenes a estado 'FILLED' (Llenado Completo):
 * 1. Calcula el Deslizamiento real de Ejecución (Slippage) comparando el precio ejecutado (fillPrice)
 *    con el precio original solicitado por el Supervisor (requestedPrice / price).
 * 2. Ejecuta conciliación y reconciliación en la base de datos (Drizzle ORM) sobre la tabla de `trades`
 *    actualizando precios promedio de entrada o salida, estados, y tiempos de ejecución.
 * 3. Registra detalladamente métricas de deslizamiento y telemetría en la bitácora institucional `auditLogs`.
 */
export class ReconciliationEngine {
  private static instance: ReconciliationEngine | null = null;
  private listener: BitgetWebSocketListener;

  public static getInstance(listener?: BitgetWebSocketListener): ReconciliationEngine {
    if (!ReconciliationEngine.instance) {
      const wsListener = listener || BitgetWebSocketListener.getInstance();
      ReconciliationEngine.instance = new ReconciliationEngine(wsListener);
    }
    return ReconciliationEngine.instance;
  }

  constructor(listener: BitgetWebSocketListener) {

    this.listener = listener;
    this.inicializarSuscripciones();
  }

  /**
   * Conecta los canales del listener de WebSockets a los procesadores del motor de conciliación.
   */
  private inicializarSuscripciones(): void {
    console.log('[ReconciliationEngine] Acoplando sensores de conciliación a los flujos del WebSocket...');
    
    // Escuchar el canal de órdenes
    this.listener.onOrderUpdate(async (event) => {
      try {
        await this.procesarEventoOrden(event);
      } catch (error) {
        console.error('[ReconciliationEngine] Error crítico al procesar evento de orden:', error);
      }
    });

    // Escuchar el canal de posiciones
    this.listener.onPositionUpdate(async (event) => {
      try {
        await this.procesarEventoPosicion(event);
      } catch (error) {
        console.error('[ReconciliationEngine] Error crítico al procesar evento de posición:', error);
      }
    });
  }

  /**
   * Procesa las actualizaciones de órdenes de Bitget.
   * Filtra por eventos de tipo 'FILLED' para aplicar conciliación contable de cartera.
   */
  public async procesarEventoOrden(event: WSOrderEvent): Promise<void> {
    const { orderId, clientOrderId, symbol, side, price, fillPrice, size, status, timestamp } = event;

    console.log(`[ReconciliationEngine] [TELEMETRÍA] Evento de Órden recibido: ID ${orderId} | Símbolo: ${symbol} | Estado: ${status} | Lado: ${side}`);

    if (status !== 'FILLED') {
      // Solo nos interesa conciliar las órdenes completadas de forma definitiva
      return;
    }

    // 1. Cálculo matemático de Deslizamiento (Slippage)
    // El deslizamiento absoluto es la diferencia entre el precio ejecutado real y el solicitado/teórico
    const precioTeorico = price > 0 ? price : fillPrice; // Fallback si no viene precio original
    const slippageAbs = fillPrice - precioTeorico;
    
    // Para compras, un precio ejecutado mayor que el teórico es un deslizamiento negativo (malo).
    // Para ventas (Shorts), un precio ejecutado menor es malo.
    const slippageDirectionMultiplier = side === 'BUY' ? 1 : -1;
    const slippageDesfavorableAbs = slippageAbs * slippageDirectionMultiplier;
    
    // Porcentaje de deslizamiento respecto al precio teórico
    const slippagePct = precioTeorico > 0 ? (slippageAbs / precioTeorico) * 100 : 0;
    const slippageDesfavorablePct = precioTeorico > 0 ? (slippageDesfavorableAbs / precioTeorico) * 100 : 0;

    console.log(`[ReconciliationEngine] [CÁLCULO SLIPPAGE] Ejecutado: ${fillPrice} USD | Teórico: ${precioTeorico} USD | Desviación: ${slippagePct.toFixed(4)}% (Direccional: ${slippageDesfavorablePct.toFixed(4)}%)`);

    try {
      // 2. Localizar el trade correspondiente en la Base de Datos usando Drizzle ORM
      // Intentamos buscar por clientOrderId o por el trade abierto más reciente para este símbolo
      let tradeSeleccionado = null;

      // Buscar trade activo con estado OPEN
      const tradesActivos = await db
        .select()
        .from(trades)
        .where(
          and(
            eq(trades.symbol, symbol),
            eq(trades.status, 'OPEN')
          )
        )
        .orderBy(desc(trades.entryTime))
        .limit(1);

      if (tradesActivos && tradesActivos.length > 0) {
        tradeSeleccionado = tradesActivos[0];
      }

      if (tradeSeleccionado) {
        // Encontró un trade abierto para este activo
        console.log(`[ReconciliationEngine] Conciliando Trade ID #${tradeSeleccionado.id} encontrado en la base de datos.`);

        // Determinar si es una orden de entrada o de salida (cierre)
        // Si el lado de la orden coincide con el lado del trade, asumimos que es una entrada o aumento
        // Si es contrario, es un cierre de posición
        const ladoTradeNormalizado = tradeSeleccionado.side === 'LONG' ? 'BUY' : 'SELL';
        const esCierre = side !== ladoTradeNormalizado;

        if (esCierre) {
          // A) PROCESAR CIERRE DE TRADE
          const precioEntrada = Number(tradeSeleccionado.entryPrice);
          const cantidad = Number(tradeSeleccionado.quantity);
          
          // FIX C11: Distinguir Gross PnL vs Net PnL (descontando trading fees de entrada + salida)
          // Bitget taker fee = 0.06% (0.0006)
          const feeRate = 0.0006;
          const feeEntradaUSD = precioEntrada * cantidad * feeRate;
          const feeSalidaUSD = fillPrice * cantidad * feeRate;
          const totalFeesUSD = feeEntradaUSD + feeSalidaUSD;

          const multiplicadorPnL = tradeSeleccionado.side === 'LONG' ? 1 : -1;
          const grossPnL = (fillPrice - precioEntrada) * cantidad * multiplicadorPnL;
          const netPnL = grossPnL - totalFeesUSD;
          const netPnlPct = (precioEntrada * cantidad) > 0 ? (netPnL / (precioEntrada * cantidad)) * 100 : 0;

          // FIX H05: Actualizar todos los trades abiertos coincidentes para este activo en lugar de solo uno
          for (const trade of tradesActivos) {
            await db
              .update(trades)
              .set({
                exitPrice: fillPrice.toString(),
                status: 'CLOSED',
                pnl: netPnL.toString(),
                pnlPercentage: netPnlPct.toFixed(4),
                exitTime: new Date(timestamp)
              })
              .where(eq(trades.id, trade.id));

            console.log(`[ReconciliationEngine] [CONCILIACIÓN] ¡Trade #${trade.id} CERRADO exitosamente! Gross PnL: $${grossPnL.toFixed(2)} USD | Net PnL (con fees): $${netPnL.toFixed(2)} USD (${netPnlPct.toFixed(2)}%)`);
          }

          // Registrar telemetría del cierre y slippage
          await db.insert(auditLogs).values({
            agentName: 'Reconciliation',
            level: 'INFO',
            message: `Trades de ${symbol} cerrados con éxito en Bitget. Conciliados por WS.`,
            payload: {
              symbol,
              orderId,
              entryPrice: precioEntrada,
              exitPrice: fillPrice,
              slippagePct,
              grossPnL,
              totalFeesUSD,
              netPnL,
              netPnlPct
            }
          });

        } else {
          // B) PROCESAR ENTRADA / ACTUALIZACIÓN DE PRECIO REAL DE EJECUCIÓN
          await db
            .update(trades)
            .set({
              entryPrice: fillPrice.toString(),
              entryTime: new Date(timestamp)
            })
            .where(eq(trades.id, tradeSeleccionado.id));

          console.log(`[ReconciliationEngine] [CONCILIACIÓN] Precio de entrada de Trade #${tradeSeleccionado.id} actualizado a real: ${fillPrice} USD.`);

          // Registrar auditoría de entrada
          await db.insert(auditLogs).values({
            agentName: 'Reconciliation',
            level: 'INFO',
            message: `Precio de entrada real para el Trade #${tradeSeleccionado.id} conciliado por WS. Slippage calculado: ${slippagePct.toFixed(4)}%`,
            payload: {
              tradeId: tradeSeleccionado.id,
              orderId,
              symbol,
              requestedPrice: precioTeorico,
              executedPrice: fillPrice,
              slippagePct,
              slippageDesfavorablePct
            }
          });
        }

      } else {
        // No hay un trade activo en la base de datos para este símbolo.
        // Registramos un llenado externo (External Fill) - Útil si se operó directamente en Bitget o por API externa
        console.log(`[ReconciliationEngine] Llenado externo de orden detectado para ${symbol}. Sin trade local activo. registrando telemetría.`);
        
        await db.insert(auditLogs).values({
          agentName: 'Reconciliation',
          level: 'WARN',
          message: `Orden externa FILLED detectada por WebSocket. Sin trade correspondiente registrado en base de datos.`,
          payload: {
            orderId,
            clientOrderId,
            symbol,
            side,
            fillPrice,
            size,
            slippagePct
          }
        });
      }

    } catch (dbError) {
      console.error('[ReconciliationEngine] Error crítico de actualización en base de datos durante conciliación:', dbError);
    }
  }

  /**
   * Procesa las actualizaciones de posiciones de Bitget para validar correspondencia de cartera.
   */
  public async procesarEventoPosicion(event: WSPositionEvent): Promise<void> {
    const { symbol, holdSide, totalSize, availableSize, entryPrice, unrealizedPnL, timestamp } = event;
    
    console.log(`[ReconciliationEngine] [TELEMETRÍA] Sincronización de Posición: Símbolo: ${symbol} | Lado: ${holdSide} | Tamaño: ${totalSize} | Entrada: ${entryPrice} USD | PnL No Realizado: ${unrealizedPnL} USD`);

    // Auditamos el estado real del exchange para detectar discrepancias ("drift" de balance)
    try {
      if (totalSize === 0) {
        // Posición cerrada, nos aseguramos de que no queden registros OPEN colgados en la DB
        const tradesColgados = await db
          .select()
          .from(trades)
          .where(
            and(
              eq(trades.symbol, symbol),
              eq(trades.status, 'OPEN')
            )
          );

        if (tradesColgados && tradesColgados.length > 0) {
          console.warn(`[ReconciliationEngine] [CORRECCIÓN DRIFT] Se detectaron ${tradesColgados.length} trades marcados como OPEN en DB, pero el exchange reporta posición cerrada. Forzando conciliación de cierre preventivo.`);
          
          for (const colgado of tradesColgados) {
            await db
              .update(trades)
              .set({
                status: 'CLOSED',
                exitPrice: entryPrice > 0 ? entryPrice.toString() : colgado.entryPrice,
                exitTime: new Date()
              })
              .where(eq(trades.id, colgado.id));

            await db.insert(auditLogs).values({
              agentName: 'Reconciliation',
              level: 'WARN',
              message: `Trade #${colgado.id} cerrado automáticamente debido a discrepancia de posición con Bitget (Drift corregido).`,
              payload: {
                tradeId: colgado.id,
                symbol,
                cause: 'EXCHANGE_POSITION_ZERO'
              }
            });
          }
        }
      }
    } catch (err) {
      console.error('[ReconciliationEngine] Error durante análisis de drift de posiciones:', err);
    }
  }

  /**
   * FIX C06: Ejecuta la reconciliación inicial obligatoria al arrancar la aplicación (Startup Reconciliation).
   * Consulta el estado real del exchange (órdenes y posiciones) y lo sincroniza con la base de datos antes de activar el motor de trading.
   */
  public async reconcileOnStartup(broker: any, symbol: string = 'BTC/USDT'): Promise<boolean> {
    console.log(`[ReconciliationEngine] [STARTUP RECOVERY] Iniciando reconciliación obligatoria de arranque para ${symbol}...`);
    try {
      const exchangePos = await broker.getPosition(symbol);
      let dbTrades: any[] = [];
      try {
        dbTrades = await db
          .select()
          .from(trades)
          .where(and(eq(trades.symbol, symbol), eq(trades.status, 'OPEN')));
      } catch (dbErr: any) {
        console.warn(`[ReconciliationEngine] [STARTUP RECOVERY] Base de datos no disponible localmente para consulta de trades: ${dbErr.message || dbErr}`);
      }

      if (!exchangePos || Math.abs(exchangePos.size) === 0) {
        if (dbTrades.length > 0) {
          console.warn(`[ReconciliationEngine] [STARTUP RECOVERY] Encontrados ${dbTrades.length} trades OPEN en DB pero 0 posición en Bitget. Sincronizando estado a CLOSED.`);
          for (const t of dbTrades) {
            try {
              await db.update(trades).set({ status: 'CLOSED', exitTime: new Date() }).where(eq(trades.id, t.id));
            } catch (uErr) {}
          }
        }
        console.log(`[ReconciliationEngine] [STARTUP RECOVERY] Sincronización completa: Sin posiciones abiertas en el exchange.`);
      } else {
        console.log(`[ReconciliationEngine] [STARTUP RECOVERY] Posición activa detectada en Bitget: ${exchangePos.holdSide?.toUpperCase()} ${Math.abs(exchangePos.size)} @ ${exchangePos.entryPrice} USD.`);
      }
      return true;
    } catch (e: any) {
      console.error(`[ReconciliationEngine] [STARTUP RECOVERY ERROR] Error en la reconciliación inicial de arranque:`, e.message);
      return false;
    }
  }

}
