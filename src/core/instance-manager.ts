/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { db } from '../db/index.ts';
import { settings, auditLogs } from '../db/schema.ts';
import { eq } from 'drizzle-orm';
import { Blackboard } from './blackboard.ts';
import { InstanceConfig } from './types/instances.ts';
import { AgentAssessment } from '../types.ts';

/**
 * Gestor de Multi-Instancias y Bucles de Ejecución (InstanceManager).
 * 
 * Implementado bajo patrón Singleton, coordina el ciclo de vida del escalamiento horizontal.
 * Lee las configuraciones de pares y exchanges desde la base de datos y lanza o detiene 
 * hilos lógicos de ejecución Fast-Loop concurrentes aislados de forma inmutable.
 */
export class InstanceManager {
  private static instance: InstanceManager | null = null;
  private blackboard: Blackboard;
  
  // Tabla de hilos lógicos (intervals) activos por id de instancia
  private activeLoops: Map<string, NodeJS.Timeout> = new Map();
  // Configuraciones de instancias cargadas actualmente
  private instances: Map<string, InstanceConfig> = new Map();

  private constructor() {
    this.blackboard = Blackboard.getInstance();
  }

  /**
   * Retorna la instancia única del Gestor.
   */
  public static getInstance(): InstanceManager {
    if (!InstanceManager.instance) {
      InstanceManager.instance = new InstanceManager();
    }
    return InstanceManager.instance;
  }

  /**
   * Sincroniza las instancias activas desde la base de datos de forma asíncrona.
   * Crea nuevos bucles de ejecución para nuevas configuraciones y suspende las inactivas.
   */
  public async synchronizeInstances(): Promise<void> {
    console.log('[InstanceManager] Sincronizando topología multi-instancia desde la base de datos...');
    
    try {
      // 1. Consultar de la tabla de configuraciones
      const instanceSetting = await db
        .select()
        .from(settings)
        .where(eq(settings.key, 'multi_instance_configs'))
        .limit(1);

      let configList: InstanceConfig[] = [];

      if (instanceSetting && instanceSetting.length > 0) {
        configList = instanceSetting[0].value as InstanceConfig[];
      } else {
        // Inicializar configuración semilla de producción si no existiera registro
        configList = [
          {
            instance_id: 'bitget_btc_usdt_1m',
            exchange: 'bitget',
            symbol: 'BTC/USDT',
            leverage: 10,
            allocated_capital: 50000,
            timeframe: '1m'
          },
          {
            instance_id: 'bitget_eth_usdt_5m',
            exchange: 'bitget',
            symbol: 'ETH/USDT',
            leverage: 5,
            allocated_capital: 30000,
            timeframe: '5m'
          },
          {
            instance_id: 'binance_sol_usdt_15m',
            exchange: 'binance',
            symbol: 'SOL/USDT',
            leverage: 3,
            allocated_capital: 20000,
            timeframe: '15m'
          }
        ];

        // Obtener el primer usuario existente para vincular la configuración semilla de forma segura
        const firstUserSetting = await db.select().from(settings).limit(1);
        const userId = firstUserSetting && firstUserSetting.length > 0 ? firstUserSetting[0].userId : 1;

        await db.insert(settings).values({
          userId,
          key: 'multi_instance_configs',
          value: configList,
          updatedAt: new Date()
        });

        console.log('[InstanceManager] Semilla de configuraciones multi-instancia creada en la base de datos.');
      }

      const currentIds = new Set(configList.map(c => c.instance_id));

      // 2. Apagar hilos que ya no estén presentes en la configuración activa
      for (const existingId of this.activeLoops.keys()) {
        if (!currentIds.has(existingId)) {
          this.stopFastLoop(existingId);
        }
      }

      // 3. Iniciar o actualizar las instancias configuradas
      for (const config of configList) {
        this.instances.set(config.instance_id, config);
        
        // Inyectar inmutablemente en el Blackboard de memoria la especificación
        this.propagateConfigToBlackboard(config);

        if (!this.activeLoops.has(config.instance_id)) {
          this.startFastLoop(config);
        } else {
          console.log(`[InstanceManager] Instancia ${config.instance_id} ya se encuentra operativa.`);
        }
      }

    } catch (err: any) {
      console.error('[InstanceManager] Error crítico sincronizando topología multi-instancia:', err);
      throw err;
    }
  }

  /**
   * Inyecta la especificación de asignación de capital y límites en un slot dedicado del Blackboard.
   */
  private propagateConfigToBlackboard(config: InstanceConfig): void {
    const configAssessment: AgentAssessment = {
      agentName: 'Learning',
      timestamp: Date.now(),
      score: 100, // Máxima confianza operativa
      confidence: 1.0,
      data: {
        instanceConfig: {
          instance_id: config.instance_id,
          exchange: config.exchange,
          symbol: config.symbol,
          leverage: config.leverage,
          allocated_capital: config.allocated_capital,
          timeframe: config.timeframe
        }
      },
      justification: `Configuración operativa inmutable para el par ${config.symbol} en ${config.exchange}. Capital: $${config.allocated_capital} USD.`
    };

    // TTL 0 para garantizar que la configuración persista de forma estricta e indefinida en la pizarra
    this.blackboard.writeAssessment(config.instance_id, config.timeframe, configAssessment, 0);
  }

  /**
   * Inicia el bucle cognitivo (Fast-Loop) de baja latencia para una sub-instancia.
   */
  private startFastLoop(config: InstanceConfig): void {
    console.log(`[InstanceManager] [START] Lanzando Fast-Loop para la sub-instancia: ${config.instance_id}`);

    // Simulación reactiva de un bucle cognitivo institucional ejecutando análisis cada 10 segundos
    const interval = setInterval(async () => {
      try {
        const mockPrice = 60000 + (Math.random() - 0.5) * 1000; // precio sintético de telemetría
        
        // 1. Escribir actualización de mercado en el Blackboard
        this.blackboard.writeMarketData(config.instance_id, config.timeframe, {
          symbol: config.symbol,
          price: Number(mockPrice.toFixed(2)),
          volume24h: 150000000,
          high24h: Number((mockPrice * 1.02).toFixed(2)),
          low24h: Number((mockPrice * 0.98).toFixed(2)),
          timestamp: Date.now()
        }, 30000); // TTL de 30 segundos para datos de mercado

        // 2. Simular evaluación analítica automatizada del analista técnico
        const mockScore = Math.floor((Math.random() - 0.5) * 200); // [-100, 100]
        const technicalAssessment: AgentAssessment = {
          agentName: 'TechnicalAnalyst',
          timestamp: Date.now(),
          score: mockScore,
          confidence: 0.85,
          data: {
            rsi: 48 + Math.random() * 10,
            macd: 'neutral_cross',
            price: mockPrice
          },
          justification: `Fast-Loop análisis técnico rápido de volatilidad para el slot ${config.instance_id}`
        };

        this.blackboard.writeAssessment(config.instance_id, config.timeframe, technicalAssessment, 30000);

      } catch (loopError: any) {
        console.error(`[InstanceManager] Error en Fast-Loop de la instancia ${config.instance_id}:`, loopError);
      }
    }, 10000);

    this.activeLoops.set(config.instance_id, interval);

    // Guardar registro de auditoría
    db.insert(auditLogs).values({
      agentName: 'Audit',
      level: 'INFO',
      message: `Bucle de ejecución Fast-Loop inicializado correctamente para instancia ${config.instance_id}`,
      payload: { config }
    }).catch(err => console.error('[InstanceManager] Error al auditar inicio de instancia:', err));
  }

  /**
   * Suspende el Fast-Loop de una sub-instancia y remueve sus registros de memoria de la pizarra.
   */
  public stopFastLoop(instanceId: string): void {
    const interval = this.activeLoops.get(instanceId);
    if (interval) {
      clearInterval(interval);
      this.activeLoops.delete(instanceId);
      console.log(`[InstanceManager] [STOP] Bucle de ejecución detenido para: ${instanceId}`);

      const config = this.instances.get(instanceId);
      if (config) {
        // Limpiar Blackboard
        this.blackboard.clear(instanceId, config.timeframe);
        this.instances.delete(instanceId);
      }

      // Guardar registro de auditoría
      db.insert(auditLogs).values({
        agentName: 'Audit',
        level: 'WARN',
        message: `Bucle de ejecución Fast-Loop suspendido y liberado para instancia ${instanceId}`,
        payload: { instanceId }
      }).catch(err => console.error('[InstanceManager] Error al auditar parada de instancia:', err));
    }
  }

  /**
   * Retorna una lista inmutable de todas las sub-instancias activas en memoria.
   */
  public getActiveInstances(): readonly InstanceConfig[] {
    return Object.freeze(Array.from(this.instances.values()));
  }
}
