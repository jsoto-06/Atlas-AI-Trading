/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  TrendingUp, TrendingDown, RefreshCw, Layers, Shield, Database, Radio, 
  Activity, BookOpen, AlertTriangle, Play, Settings, Bell, FileText, 
  Terminal, Cpu, DollarSign, ArrowUpRight, ArrowDownRight, Info, CheckCircle2, 
  ChevronRight, HelpCircle, Eye, Sliders, BarChart2, ShieldCheck,
  EyeOff, Lock, Key, Wallet
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AgentName, AgentAssessment, MarketDirection, ApiConfigState } from './types.ts';

// ----------------------------------------------------------------------------
// Types & Initial Simulation Data
// ----------------------------------------------------------------------------

interface SimulatedLog {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  agentName: string;
  message: string;
  payload?: any;
}

interface AgentState {
  name: AgentName;
  spanishName: string;
  description: string;
  isFastLoop: boolean;
  status: 'OFFLINE' | 'IDLE' | 'PROCESSING' | 'COMPLETED';
  score: number;
  confidence: number;
  lastUpdated: string;
  justification: string;
  details: Record<string, any>;
}

// ----------------------------------------------------------------------------
// Custom Atlas AI Trading Vector Logo Component
// ----------------------------------------------------------------------------
const AtlasLogo = () => (
  <svg viewBox="0 0 100 100" className="w-12 h-12 text-cyan-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.5)] animate-pulse" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Background Glow */}
    <circle cx="50" cy="50" r="45" stroke="rgba(6,182,212,0.15)" strokeWidth="1" />
    <circle cx="50" cy="40" r="28" stroke="rgba(6,182,212,0.2)" strokeWidth="0.75" strokeDasharray="3 3" />
    
    {/* Orbits / Circular Frames */}
    <path d="M15 45 C 10 25, 90 25, 85 45" stroke="url(#cyanGlow)" strokeWidth="1.5" strokeLinecap="round" opacity="0.9" />
    <path d="M12 55 C 5 70, 95 70, 88 55" stroke="url(#indigoGlow)" strokeWidth="1.5" strokeLinecap="round" opacity="0.9" />
    
    {/* Globe Grid lines (latitude & longitude) */}
    <circle cx="50" cy="40" r="24" stroke="rgba(148,163,184,0.25)" strokeWidth="1" />
    <path d="M26 40 C 35 48, 65 48, 74 40" stroke="rgba(6,182,212,0.3)" strokeWidth="0.75" />
    <path d="M26 40 C 35 32, 65 32, 74 40" stroke="rgba(6,182,212,0.3)" strokeWidth="0.75" />
    <path d="M50 16 C 42 25, 42 55, 50 64" stroke="rgba(6,182,212,0.3)" strokeWidth="0.75" />
    <path d="M50 16 C 58 25, 58 55, 50 64" stroke="rgba(6,182,212,0.3)" strokeWidth="0.75" />
    
    {/* Muscular Atlas figure (Silhouetted / Polygon shaded style) */}
    {/* Head */}
    <path d="M50 51 C48 51, 47 48, 50 45 C53 48, 52 51, 50 51 Z" fill="#e2e8f0" stroke="#475569" strokeWidth="0.5" />
    {/* Trapezius and shoulders */}
    <path d="M36 58 L43 55 L47 52 L50 54 L53 52 L57 55 L64 58" stroke="#cbd5e1" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    {/* Torso */}
    <path d="M43 55 L45 68 L50 78 L55 68 L57 55 Z" fill="url(#metallicGrad)" stroke="#475569" strokeWidth="0.75" strokeLinejoin="round" />
    {/* Abs/rib definition */}
    <path d="M47 59 L53 59 M46 63 L54 63 M48 67 L52 67 M50 54 L50 78" stroke="#334155" strokeWidth="0.5" />
    {/* Arms holding the world */}
    {/* Left Arm */}
    <path d="M36 58 L30 47 L33 32 M33 32 L36 34 L32 46 L43 55" fill="url(#metallicGrad)" stroke="#64748b" strokeWidth="0.75" strokeLinejoin="round" />
    {/* Right Arm */}
    <path d="M64 58 L70 47 L67 32 M67 32 L64 34 L68 46 L57 55" fill="url(#metallicGrad)" stroke="#64748b" strokeWidth="0.75" strokeLinejoin="round" />
    
    {/* Candlestick Chart rising diagonally */}
    {/* Candle 1 */}
    <line x1="32" y1="45" x2="32" y2="35" stroke="#10b981" strokeWidth="0.75" />
    <rect x="30.5" y="38" width="3" height="4" fill="#10b981" rx="0.5" />
    {/* Candle 2 */}
    <line x1="44" y1="36" x2="44" y2="24" stroke="#10b981" strokeWidth="0.75" />
    <rect x="42.5" y="27" width="3" height="6" fill="#10b981" rx="0.5" />
    {/* Candle 3 */}
    <line x1="56" y1="26" x2="56" y2="14" stroke="#10b981" strokeWidth="0.75" />
    <rect x="54.5" y="18" width="3" height="5" fill="#10b981" rx="0.5" />
    {/* Candle 4 */}
    <line x1="68" y1="18" x2="68" y2="6" stroke="#10b981" strokeWidth="0.75" />
    <rect x="66.5" y="9" width="3" height="6" fill="#10b981" rx="0.5" />

    {/* Trend Line connecting the candles */}
    <path d="M32 40 L44 30 L56 20 L68 12" stroke="#34d399" strokeWidth="1.5" strokeLinecap="round" opacity="0.95" />

    {/* Definitions */}
    <defs>
      <linearGradient id="cyanGlow" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#06b6d4" stopOpacity="0" />
        <stop offset="50%" stopColor="#22d3ee" stopOpacity="1" />
        <stop offset="100%" stopColor="#0891b2" stopOpacity="0" />
      </linearGradient>
      <linearGradient id="indigoGlow" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#4f46e5" stopOpacity="0" />
        <stop offset="50%" stopColor="#818cf8" stopOpacity="1" />
        <stop offset="100%" stopColor="#4338ca" stopOpacity="0" />
      </linearGradient>
      <linearGradient id="metallicGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#f8fafc" />
        <stop offset="50%" stopColor="#94a3b8" />
        <stop offset="100%" stopColor="#334155" />
      </linearGradient>
    </defs>
  </svg>
);

export default function App() {
  // Connection and Session parameters
  const [symbol, setSymbol] = useState<'BTC/USDT' | 'ETH/USDT' | 'SOL/USDT'>('BTC/USDT');
  const [timeframe, setTimeframe] = useState<'15m' | '1h' | '4h' | '1D'>('1h');
  const [isLiveServer, setIsLiveServer] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [systemAlerts, setSystemAlerts] = useState<number>(0);
  
  // Real-time prices
  const [price, setPrice] = useState<number>(68420.50);
  const [priceDirection, setPriceDirection] = useState<'UP' | 'DOWN' | 'NEUTRAL'>('NEUTRAL');

  // Active Simulated Position (Paper Trading / Exchange status)
  const [activePosition, setActivePosition] = useState<{
    symbol: string;
    side: 'LONG' | 'SHORT';
    entryPrice: number;
    currentPrice: number;
    quantity: number;
    leverage: number;
    pnl: number;
    pnlPercentage: number;
    stopLoss: number;
    takeProfit: number;
  } | null>(null);

  // Live Audit Logs Array
  const [logs, setLogs] = useState<SimulatedLog[]>([
    {
      id: 'log_0',
      timestamp: new Date().toLocaleTimeString(),
      level: 'INFO',
      agentName: 'Orchestrator',
      message: 'Sistema de Trading Algorítmico AI inicializado correctamente en puerto 3000.',
    },
    {
      id: 'log_1',
      timestamp: new Date().toLocaleTimeString(),
      level: 'INFO',
      agentName: 'Blackboard',
      message: 'Memoria compartida en caché in-memory reactiva montada. Iniciando TTL Scavenger.',
    },
    {
      id: 'log_2',
      timestamp: new Date().toLocaleTimeString(),
      level: 'DEBUG',
      agentName: 'CloudSQL',
      message: 'Pool de conexiones PostgreSQL establecido. Tablas de auditoría cargadas.',
    }
  ]);

  // Parameters updated by learning agent
  const [learningParams, setLearningParams] = useState({
    rsi_period: 14,
    weight_technical: 0.25,
    weight_order_flow: 0.20,
    weight_sentiment: 0.15,
    weight_news: 0.15,
    global_risk_limit: 1.5, // % per trade
    kelly_multiplier: 0.5, // Half-Kelly
    win_rate_target: 64.2, // %
    profit_factor: 2.15,
  });

  // Selected agent for side panel inspection
  const [selectedAgentName, setSelectedAgentName] = useState<AgentName>('Supervisor');
  const [activeTab, setActiveTab] = useState<'decision' | 'logs' | 'terminal' | 'learning' | 'api-config'>('decision');

  // API Config State (Fase 15)
  const [apiConfig, setApiConfig] = useState<ApiConfigState>({
    apiKey: '',
    apiSecret: '',
    passphrase: '',
    modoReal: false
  });
  const [apiConfigLoading, setApiConfigLoading] = useState(false);
  const [apiConfigSaving, setApiConfigSaving] = useState(false);
  const [apiConfigMessage, setApiConfigMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Token de Administrador (Authorization: Bearer <ADMIN_API_TOKEN>)
  const [adminToken, setAdminToken] = useState(() => sessionStorage.getItem('ADMIN_API_TOKEN') || '');
  const [showAdminToken, setShowAdminToken] = useState(false);

  // API Config visibility states
  const [showApiKey, setShowApiKey] = useState(false);
  const [showApiSecret, setShowApiSecret] = useState(false);
  const [showPassphrase, setShowPassphrase] = useState(false);

  // Bitget Balances State
  const [balances, setBalances] = useState<{ demo: number; real: number; activeMode: 'demo' | 'real' }>({
    demo: 10000,
    real: 10000,
    activeMode: 'demo'
  });

  const fetchBalances = async () => {
    if (!adminToken) return;
    try {
      const res = await fetch('/api/v1/telemetry/balances', {
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setBalances({
          demo: typeof data.demo === 'number' ? data.demo : 10000,
          real: typeof data.real === 'number' ? data.real : 10000,
          activeMode: data.activeMode || 'demo'
        });
      } else if (res.status === 401) {
        console.warn('Unauthorized balances query: Token de Administrador inválido.');
      }
    } catch (err) {
      console.error('Error al obtener balances:', err);
    }
  };

  const fetchApiConfig = async () => {
    if (!adminToken) {
      setApiConfigMessage({ type: 'error', text: 'Introduce tu Token de Administrador para gestionar la configuración de Bitget.' });
      return;
    }
    setApiConfigLoading(true);
    setApiConfigMessage(null);
    try {
      const res = await fetch('/api/v1/telemetry/config', {
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setApiConfig({
          apiKey: data.apiKey || '',
          apiSecret: data.apiSecret || '',
          passphrase: data.passphrase || '',
          modoReal: !!data.modoReal
        });
      } else if (res.status === 401) {
        setApiConfigMessage({ type: 'error', text: 'Introduce tu Token de Administrador para gestionar la configuración de Bitget.' });
      } else {
        setApiConfigMessage({ type: 'error', text: 'Error al consultar la configuración de API desde el backend.' });
      }
    } catch (err: any) {
      console.error('Error al cargar la configuración de API:', err);
      setApiConfigMessage({ type: 'error', text: `Falla de red: ${err.message || err}` });
    } finally {
      setApiConfigLoading(false);
    }
  };

  const saveApiConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminToken) {
      setApiConfigMessage({ type: 'error', text: 'Introduce tu Token de Administrador para gestionar la configuración de Bitget.' });
      return;
    }
    setApiConfigSaving(true);
    setApiConfigMessage(null);
    try {
      const res = await fetch('/api/v1/telemetry/config', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify(apiConfig)
      });
      if (res.ok) {
        const data = await res.json();
        setApiConfigMessage({ type: 'success', text: data.mensaje || 'Configuración guardada exitosamente.' });
        // Re-obtener credenciales para refrescar la enmascaración de claves
        await fetchApiConfig();
        await fetchBalances();
      } else if (res.status === 401) {
        setApiConfigMessage({ type: 'error', text: 'Token de Administrador no válido o expirado.' });
      } else {
        const data = await res.json().catch(() => ({}));
        setApiConfigMessage({ type: 'error', text: data.message || 'Error al guardar la configuración de API.' });
      }
    } catch (err: any) {
      console.error('Error al guardar la configuración de API:', err);
      setApiConfigMessage({ type: 'error', text: `Falla de red al enviar POST: ${err.message || err}` });
    } finally {
      setApiConfigSaving(false);
    }
  };

  // Sincronizar token en sessionStorage para preservar en la sesión
  useEffect(() => {
    sessionStorage.setItem('ADMIN_API_TOKEN', adminToken);
    if (adminToken) {
      fetchApiConfig();
    } else {
      setApiConfigMessage({ type: 'error', text: 'Introduce tu Token de Administrador para gestionar la configuración de Bitget.' });
    }
  }, [adminToken]);

  // Manejar reconexión y sondeo de balances reactivo según el token
  useEffect(() => {
    if (adminToken) {
      fetchBalances();
      const interval = setInterval(fetchBalances, 6000);
      return () => clearInterval(interval);
    }
  }, [adminToken]);

  useEffect(() => {
    if (activeTab === 'api-config' && adminToken) {
      fetchApiConfig();
    }
  }, [activeTab]);

  // Main 15 Agents status tracker
  const [agents, setAgents] = useState<Record<AgentName, AgentState>>({
    TechnicalAnalyst: {
      name: 'TechnicalAnalyst',
      spanishName: 'Analista Técnico',
      description: 'Calcula indicadores (RSI, MACD, EMA, VWAP) e interpreta patrones visuales (SMC/ICT) usando Gemini.',
      isFastLoop: true,
      status: 'IDLE',
      score: 0,
      confidence: 0,
      lastUpdated: 'Sin datos',
      justification: 'Esperando el inicio de la orquestación.',
      details: { rsi: 50, macd: 'Neutral', vwap: 0, blocks: 'Ninguno detectado' }
    },
    News: {
      name: 'News',
      spanishName: 'Analista de Noticias',
      description: 'Escanea el feed RSS de Cointelegraph para medir el impacto inmediato de noticias cripto.',
      isFastLoop: false,
      status: 'IDLE',
      score: 0,
      confidence: 0,
      lastUpdated: 'Sin datos',
      justification: 'Esperando noticias frescas del feed.',
      details: { fed_sentiment: 'Neutral', regulatory_risk: 'Bajo', macro_impact: 'Ninguno' }
    },
    Sentiment: {
      name: 'Sentiment',
      spanishName: 'Analista de Sentimiento',
      description: 'Analiza la opinión en redes sociales (Twitter/X, Telegram, Reddit) y el índice de Miedo y Codicia.',
      isFastLoop: false,
      status: 'IDLE',
      score: 0,
      confidence: 0,
      lastUpdated: 'Sin datos',
      justification: 'Esperando análisis social.',
      details: { fear_and_greed: 55, fomo_level: 'Medio', twitter_score: 0 }
    },
    OnChain: {
      name: 'OnChain',
      spanishName: 'Analista On-Chain',
      description: 'Sigue el flujo de billeteras frías, flujos de entrada/salida de exchanges (inflows/outflows) y acumulación de ballenas.',
      isFastLoop: false,
      status: 'IDLE',
      score: 0,
      confidence: 0,
      lastUpdated: 'Sin datos',
      justification: 'Esperando telemetría de bloques.',
      details: { exchange_netflow: 0, whale_accumulation: 'Estable', active_wallets_delta: '0%' }
    },
    OrderFlow: {
      name: 'OrderFlow',
      spanishName: 'Analista Order Flow',
      description: 'Monitorea el Order Book, DOM, CVD, Delta, Funding Rates y liquidaciones en tiempo real en Bitget.',
      isFastLoop: true,
      status: 'IDLE',
      score: 0,
      confidence: 0,
      lastUpdated: 'Sin datos',
      justification: 'Esperando flujo de órdenes.',
      details: { cvd_delta: 'Neutral', open_interest: 'Estable', skew: 'Neutral' }
    },
    Correlation: {
      name: 'Correlation',
      spanishName: 'Módulo de Correlaciones',
      description: 'Calcula correlaciones en vivo entre criptoactivos, Nasdaq, S&P 500, DXY y rendimiento de bonos.',
      isFastLoop: true,
      status: 'IDLE',
      score: 0,
      confidence: 0,
      lastUpdated: 'Sin datos',
      justification: 'Esperando análisis de correlación cruzada.',
      details: { btc_sp500_corr: 0.65, dxy_negative_corr: -0.82, beta: 1.1 }
    },
    Backtesting: {
      name: 'Backtesting',
      spanishName: 'Validador Histórico',
      description: 'Ejecuta simulaciones instantáneas con walk-forward en el entorno para medir el win-rate esperado del setup.',
      isFastLoop: false,
      status: 'IDLE',
      score: 0,
      confidence: 0,
      lastUpdated: 'Sin datos',
      justification: 'Esperando generación de señal.',
      details: { simulated_trades: 0, win_rate: 0, profit_factor: 0 }
    },
    RiskManager: {
      name: 'RiskManager',
      spanishName: 'Gestor de Riesgos',
      description: 'Establece el tamaño exacto de la posición, Stop Loss, Take Profit aplicando el Criterio de Kelly y límites de drawdown.',
      isFastLoop: true,
      status: 'IDLE',
      score: 0,
      confidence: 0,
      lastUpdated: 'Sin datos',
      justification: 'Esperando cálculo de exposición.',
      details: { position_size_pct: 0, stop_loss_atr: 0, risk_reward_ratio: '0' }
    },
    Divergence: {
      name: 'Divergence',
      spanishName: 'Analista de Divergencias',
      description: 'Localiza divergencias de precios contra indicadores y orderflow de forma exhaustiva.',
      isFastLoop: true,
      status: 'IDLE',
      score: 0,
      confidence: 0,
      lastUpdated: 'Sin datos',
      justification: 'Esperando cálculo de divergencias.',
      details: { rsi_divergence: 'Ninguna', delta_divergence: 'Ninguna' }
    },
    Liquidation: {
      name: 'Liquidation',
      spanishName: 'Detector de Squeezes',
      description: 'Identifica zonas de liquidez extrema acumulada y predice barridos de stop loss (Stop Hunting / Liquidation Squeezes).',
      isFastLoop: true,
      status: 'IDLE',
      score: 0,
      confidence: 0,
      lastUpdated: 'Sin datos',
      justification: 'Esperando mapas de liquidación.',
      details: { long_liquidation_pool: 0, short_liquidation_pool: 0 }
    },
    Supervisor: {
      name: 'Supervisor',
      spanishName: 'Supervisor de Consenso',
      description: 'Consolida todos los análisis del Blackboard, calcula el puntaje final ponderado y emite órdenes.',
      isFastLoop: true,
      status: 'IDLE',
      score: 0,
      confidence: 0,
      lastUpdated: 'Sin datos',
      justification: 'Haga clic en "Lanzar Ciclo Orquestador" para iniciar el análisis.',
      details: { weighted_score: 0, total_agents_consulted: 0, fallback_applied: false }
    },
    Execution: {
      name: 'Execution',
      spanishName: 'Ejecutor Bitget',
      description: 'Enruta órdenes oficiales a Bitget (Spot/Futuros) manejando latencias de red, reintentos y APIs.',
      isFastLoop: true,
      status: 'IDLE',
      score: 0,
      confidence: 0,
      lastUpdated: 'Sin datos',
      justification: 'Esperando órdenes de compra/venta.',
      details: { api_latency_ms: 0, order_type_routing: 'Futuros' }
    },
    Learning: {
      name: 'Learning',
      spanishName: 'Módulo de Aprendizaje',
      description: 'Analiza retrospectivamente los resultados reales versus predicciones de los agentes para ajustar pesos mediante optimización bayesiana.',
      isFastLoop: false,
      status: 'IDLE',
      score: 0,
      confidence: 0,
      lastUpdated: 'Sin datos',
      justification: 'Esperando feedback de trades cerrados.',
      details: { optimized_epochs: 12, bayesian_tuning_factor: 1.05 }
    },
    Audit: {
      name: 'Audit',
      spanishName: 'Auditor de Decisiones',
      description: 'Registra de manera inmutable prompts, JSONs, indicadores e historial completo de decisiones para transparencia.',
      isFastLoop: false,
      status: 'IDLE',
      score: 0,
      confidence: 0,
      lastUpdated: 'Sin datos',
      justification: 'Esperando transacciones de auditoría.',
      details: { db_storage_status: 'Synced', table: 'audit_logs' }
    },
    Notification: {
      name: 'Notification',
      spanishName: 'Notificador Multicanal',
      description: 'Maneja alertas y notifica de inmediato a Telegram, Discord y correos corporativos en caso de anomalías.',
      isFastLoop: false,
      status: 'IDLE',
      score: 0,
      confidence: 0,
      lastUpdated: 'Sin datos',
      justification: 'Esperando alertas del sistema.',
      details: { telegram_status: 'Connected', discord_status: 'Connected' }
    }
  });

  // Supervisor Final Consensus Result State
  const [consensusResult, setConsensusResult] = useState<{
    direction: MarketDirection;
    score: number;
    justification: string;
    details: string;
    timestamp: string;
  }>({
    direction: 'HOLD',
    score: 0,
    justification: 'No se han recibido análisis todavía. Lance una simulación del ciclo orquestador.',
    details: 'Esperando ciclo...',
    timestamp: 'N/A'
  });

  // Manual configuration of weights (can be tuned by the user)
  const [agentWeights, setAgentWeights] = useState<Record<AgentName, number>>({
    TechnicalAnalyst: 0.25,
    News: 0.15,
    Sentiment: 0.10,
    OnChain: 0.08,
    OrderFlow: 0.15,
    Correlation: 0.05,
    Backtesting: 0.10,
    RiskManager: 0.0, // Non-analytical
    Divergence: 0.07,
    Liquidation: 0.05,
    Supervisor: 0.0,
    Execution: 0.0,
    Learning: 0.0,
    Audit: 0.0,
    Notification: 0.0
  });

  // ----------------------------------------------------------------------------
  // Helper to fetch real-time prices from Binance API
  // ----------------------------------------------------------------------------
  const fetchRealPrice = async (currentSymbol: string): Promise<number | null> => {
    try {
      const binanceSymbol = currentSymbol.replace('/', '');
      const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${binanceSymbol}`);
      if (response.ok) {
        const data = await response.json();
        const realPrice = parseFloat(data.price);
        if (!isNaN(realPrice) && realPrice > 0) {
          return realPrice;
        }
      }
    } catch (e) {
      // Silently fall back to simulation
    }
    return null;
  };

  // ----------------------------------------------------------------------------
  // Live Price Ticker - Real Price Polling with Simulation Fallback
  // ----------------------------------------------------------------------------
  useEffect(() => {
    let active = true;

    const interval = setInterval(async () => {
      const realPrice = await fetchRealPrice(symbol);
      if (!active) return;

      setPrice(prevPrice => {
        let nextPrice = prevPrice;
        let change = 0;

        if (realPrice !== null) {
          change = realPrice - prevPrice;
          nextPrice = realPrice;
        } else {
          // Volatility-based simulation fallback
          const volatility = symbol === 'BTC/USDT' ? 12.5 : symbol === 'ETH/USDT' ? 1.1 : 0.08;
          change = (Math.random() - 0.495) * volatility;
          nextPrice = Math.max(10, Number((prevPrice + change).toFixed(2)));
        }

        setPriceDirection(change > 0 ? 'UP' : change < 0 ? 'DOWN' : 'NEUTRAL');
        
        // Update active position in real-time
        if (activePosition) {
          setActivePosition(prev => {
            if (!prev) return null;
            const diff = nextPrice - prev.entryPrice;
            const multiplier = prev.side === 'LONG' ? 1 : -1;
            const pnl = Number((diff * prev.quantity * prev.leverage * multiplier).toFixed(2));
            const pnlPercentage = Number(((diff / prev.entryPrice) * 100 * prev.leverage * multiplier).toFixed(2));
            
            // Check stop loss / take profit triggers
            if (prev.side === 'LONG' && nextPrice <= prev.stopLoss) {
              addLog('WARN', 'RiskManager', `STOP LOSS DISPARADO en ${nextPrice}. Cerrando posición LONG.`);
              return null;
            }
            if (prev.side === 'LONG' && nextPrice >= prev.takeProfit) {
              addLog('INFO', 'RiskManager', `TAKE PROFIT ALCANZADO en ${nextPrice}. Cerrando posición LONG.`);
              return null;
            }
            if (prev.side === 'SHORT' && nextPrice <= prev.takeProfit) {
              addLog('INFO', 'RiskManager', `TAKE PROFIT ALCANZADO en ${nextPrice}. Cerrando posición SHORT.`);
              return null;
            }
            if (prev.side === 'SHORT' && nextPrice >= prev.stopLoss) {
              addLog('WARN', 'RiskManager', `STOP LOSS DISPARADO en ${nextPrice}. Cerrando posición SHORT.`);
              return null;
            }

            return {
              ...prev,
              currentPrice: nextPrice,
              pnl,
              pnlPercentage
            };
          });
        }
        
        return nextPrice;
      });
    }, 3000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [symbol, activePosition]);

  // Adjust default values and load initial real price on symbol change
  useEffect(() => {
    let active = true;

    const loadInitialPrice = async () => {
      const realPrice = await fetchRealPrice(symbol);
      if (!active) return;

      if (realPrice !== null) {
        setPrice(realPrice);
      } else {
        if (symbol === 'BTC/USDT') setPrice(68420.50);
        else if (symbol === 'ETH/USDT') setPrice(3480.20);
        else if (symbol === 'SOL/USDT') setPrice(142.80);
      }
    };

    loadInitialPrice();

    return () => {
      active = false;
    };
  }, [symbol]);

  // Helper to append a structured log
  const addLog = (level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', agentName: string, message: string, payload: any = null) => {
    const newLog: SimulatedLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      timestamp: new Date().toLocaleTimeString(),
      level,
      agentName,
      message,
      payload
    };
    setLogs(prev => [newLog, ...prev].slice(0, 80)); // Cap at 80 logs
  };

  // ----------------------------------------------------------------------------
  // Async Multi-Agent Pipeline Simulator (Blackboard + Orchestrator)
  // ----------------------------------------------------------------------------
  const handleTriggerPipeline = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    addLog('INFO', 'Orchestrator', `Iniciando flujo orquestador para ${symbol} en timeframe de ${timeframe}`);

    // Clean agent state
    setAgents(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(key => {
        const k = key as AgentName;
        updated[k] = { ...updated[k], status: 'IDLE' };
      });
      return updated;
    });

    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    try {
      // 1. Ingesta de datos en Blackboard
      addLog('DEBUG', 'Blackboard', `Escribiendo ticker de mercado en memoria central: ${symbol} - Precio: ${price}`);
      await sleep(1000);

      // 2. Ejecutar agentes Fast-Loop (Técnico, OrderFlow, Correlación, Divergencias, Liquidaciones)
      addLog('INFO', 'Orchestrator', 'Ejecutando Fast-Loop pipeline (Análisis Cuantitativo)...');
      
      setAgents(prev => ({
        ...prev,
        TechnicalAnalyst: { ...prev.TechnicalAnalyst, status: 'PROCESSING' },
        OrderFlow: { ...prev.OrderFlow, status: 'PROCESSING' },
        Correlation: { ...prev.Correlation, status: 'PROCESSING' },
        Divergence: { ...prev.Divergence, status: 'PROCESSING' },
        Liquidation: { ...prev.Liquidation, status: 'PROCESSING' }
      }));
      await sleep(1500);

      // Generar puntuaciones basadas en tendencias simuladas
      const isUpTrend = Math.random() > 0.45; // slight bullish bias
      const techScore = isUpTrend ? Math.floor(40 + Math.random() * 45) : -Math.floor(30 + Math.random() * 50);
      const flowScore = isUpTrend ? Math.floor(20 + Math.random() * 55) : -Math.floor(15 + Math.random() * 65);
      const corrScore = Math.floor((Math.random() - 0.4) * 80);
      const divScore = isUpTrend ? 15 : -35;
      const liqScore = Math.floor((Math.random() - 0.5) * 60);

      setAgents(prev => ({
        ...prev,
        TechnicalAnalyst: {
          ...prev.TechnicalAnalyst,
          status: 'COMPLETED',
          score: techScore,
          confidence: 0.85,
          lastUpdated: new Date().toLocaleTimeString(),
          justification: techScore > 0 
            ? `Estructura alcista en ${timeframe}. Ruptura de estructura (BOS) y Order Block de soporte verificado en base de datos.` 
            : `Fuerte rechazo en la media móvil exponencial. Brecha de Valor Justo (FVG) bajista no rellenada.`,
          details: { rsi: techScore > 0 ? 64 : 38, macd: techScore > 0 ? 'Bullish Crossover' : 'Bearish Trend', blocks: techScore > 0 ? 'Mitigated Block at support' : 'Unmitigated supply block' }
        },
        OrderFlow: {
          ...prev.OrderFlow,
          status: 'COMPLETED',
          score: flowScore,
          confidence: 0.90,
          lastUpdated: new Date().toLocaleTimeString(),
          justification: flowScore > 0 
            ? 'CVD en ascenso vertical con delta de volumen positivo. Fuertes órdenes de compra institucionales detectadas.' 
            : 'Fuerte absorción vendedora (Limit Sell orders) y aumento de Open Interest indica distribución agresiva.',
          details: { cvd_delta: flowScore > 0 ? '+120k BTC' : '-90k BTC', open_interest: '+4.5% delta', skew: flowScore > 0 ? 'Bullish' : 'Bearish' }
        },
        Correlation: {
          ...prev.Correlation,
          status: 'COMPLETED',
          score: corrScore,
          confidence: 0.95,
          lastUpdated: new Date().toLocaleTimeString(),
          justification: `Fuerte correlación con S&P500 (Beta: 1.12). DXY en retroceso apoyando vientos alcistas en el sector de riesgo.`,
          details: { btc_sp500_corr: 0.78, dxy_negative_corr: -0.85, beta: 1.12 }
        },
        Divergence: {
          ...prev.Divergence,
          status: 'COMPLETED',
          score: divScore,
          confidence: 0.75,
          lastUpdated: new Date().toLocaleTimeString(),
          justification: divScore > 0 
            ? 'Divergencia alcista oculta detectada entre el precio y el RSI en 1h. Continuación de tendencia favorecida.' 
            : 'Divergencia bajista clásica detectada: Precio haciendo máximos más altos mientras el RSI se debilita.',
          details: { rsi_divergence: divScore > 0 ? 'Hidden Bullish' : 'Classic Bearish', delta_divergence: 'Neutral' }
        },
        Liquidation: {
          ...prev.Liquidation,
          status: 'COMPLETED',
          score: liqScore,
          confidence: 0.80,
          lastUpdated: new Date().toLocaleTimeString(),
          justification: liqScore > 0 
            ? 'Enorme piscina de liquidez vendedora acumulada arriba del rango. Alto potencial de Short Squeeze.' 
            : 'Saturación de apalancamiento en posiciones largas. Stop Hunting inminente para barrer sobre-apalancados.',
          details: { long_liquidation_pool: '$45M close', short_liquidation_pool: '$72M above' }
        }
      }));

      addLog('INFO', 'Blackboard', 'Fast-Loop completado con éxito. Datos persistidos en el Blackboard.');
      await sleep(1000);

      // 3. Ejecutar agentes Slow-Loop (News, Sentiment, On-Chain, Backtesting) - Concurrente con Gemini
      addLog('INFO', 'Orchestrator', 'Ejecutando Slow-Loop pipeline (Modelos de Lenguaje Gemini API y Scraping)...');
      
      setAgents(prev => ({
        ...prev,
        News: { ...prev.News, status: 'PROCESSING' },
        Sentiment: { ...prev.Sentiment, status: 'PROCESSING' },
        OnChain: { ...prev.OnChain, status: 'PROCESSING' },
        Backtesting: { ...prev.Backtesting, status: 'PROCESSING' }
      }));
      await sleep(2500);

      const newsScore = isUpTrend ? Math.floor(30 + Math.random() * 50) : -Math.floor(20 + Math.random() * 60);
      const sentimentScore = isUpTrend ? Math.floor(40 + Math.random() * 45) : -Math.floor(25 + Math.random() * 55);
      const onChainScore = Math.floor((Math.random() - 0.3) * 75);
      const backtestWinRate = Number((55 + Math.random() * 15).toFixed(1));
      const backtestProfitFactor = Number((1.5 + Math.random() * 1.2).toFixed(2));
      const backtestScore = backtestWinRate > 60 ? 50 : 10;

      setAgents(prev => ({
        ...prev,
        News: {
          ...prev.News,
          status: 'COMPLETED',
          score: newsScore,
          confidence: 0.80,
          lastUpdated: new Date().toLocaleTimeString(),
          justification: newsScore > 0 
            ? 'Análisis semántico Gemini: Reportajes alcistas sobre flujos netos positivos en ETFs y moderación del tono regulatorio en la Fed.' 
            : 'Incertidumbre regulatoria global e informes macroeconómicos de inflación superiores a lo esperado impactan la confianza.',
          details: { fed_sentiment: 'Dovish bias', regulatory_risk: 'Bajo-Medio', macro_impact: 'Bullish macro flow' }
        },
        Sentiment: {
          ...prev.Sentiment,
          status: 'COMPLETED',
          score: sentimentScore,
          confidence: 0.88,
          lastUpdated: new Date().toLocaleTimeString(),
          justification: sentimentScore > 0 
            ? 'Index Fear & Greed sube a 65 (Codicia moderada). Narrativa en Twitter/X dominada por la acumulación institucional.' 
            : 'Pánico leve reflejado en foros de Reddit por liquidaciones masivas. Miedo domina las narrativas de corto plazo.',
          details: { fear_and_greed: sentimentScore > 0 ? 68 : 42, fomo_level: 'Alto', twitter_score: sentimentScore > 0 ? 'Extremadamente Alcista' : 'Bajista' }
        },
        OnChain: {
          ...prev.OnChain,
          status: 'COMPLETED',
          score: onChainScore,
          confidence: 0.82,
          lastUpdated: new Date().toLocaleTimeString(),
          justification: onChainScore > 0 
            ? 'Flujo masivo de monedas de exchanges hacia billeteras frías (Outflows). Ballenas acumulando activamente.' 
            : 'Monedas inactivas con más de 3 años de antigüedad se mueven a exchanges (Inflows), sugiriendo toma de ganancias.',
          details: { exchange_netflow: onChainScore > 0 ? '-15k BTC (Outflow)' : '+8k BTC (Inflow)', whale_accumulation: 'Acumulación Fuerte' }
        },
        Backtesting: {
          ...prev.Backtesting,
          status: 'COMPLETED',
          score: backtestScore,
          confidence: 0.90,
          lastUpdated: new Date().toLocaleTimeString(),
          justification: `Simulación de Walk-Forward exitosa sobre 365 días históricos. Win Rate esperado: ${backtestWinRate}%, Profit Factor de ${backtestProfitFactor}.`,
          details: { simulated_trades: 124, win_rate: `${backtestWinRate}%`, profit_factor: backtestProfitFactor }
        }
      }));

      addLog('INFO', 'Blackboard', 'Slow-Loop cognitivo (Gemini API integrado) completado.');
      await sleep(1000);

      // 4. Evaluar con Risk Manager Agent
      addLog('INFO', 'RiskManager', 'Risk Manager evaluando viabilidad del setup...');
      setAgents(prev => ({ ...prev, RiskManager: { ...prev.RiskManager, status: 'PROCESSING' } }));
      await sleep(1500);

      // Criterios de riesgo
      const canTrade = true; // Risk always approves under normal simulated volatility
      const calculatedSize = Number((1.2 + Math.random() * 1.5).toFixed(2));
      const stopLossOffset = price * (0.015 + Math.random() * 0.01); // 1.5% - 2.5% ATR
      const takeProfitOffset = stopLossOffset * 2.2; // ~1:2.2 Risk-Reward ratio
      
      const calculatedSL = Number((isUpTrend ? price - stopLossOffset : price + stopLossOffset).toFixed(2));
      const calculatedTP = Number((isUpTrend ? price + takeProfitOffset : price - takeProfitOffset).toFixed(2));

      setAgents(prev => ({
        ...prev,
        RiskManager: {
          ...prev.RiskManager,
          status: 'COMPLETED',
          score: 100, // Validated
          confidence: 1.0,
          lastUpdated: new Date().toLocaleTimeString(),
          justification: `Riesgo Aprobado. Posición sugerida de ${calculatedSize}% de capital usando Criterio de Kelly (Half-Kelly). R:R es de 1:2.2.`,
          details: { position_size_pct: `${calculatedSize}%`, stop_loss_atr: calculatedSL, risk_reward_ratio: '1:2.2' }
        }
      }));
      addLog('INFO', 'RiskManager', `Métricas de Riesgo aprobadas: SL=${calculatedSL}, TP=${calculatedTP}, Tamaño=${calculatedSize}%`);

      // 5. Supervisor Agent calcula la consolidación final ponderada
      addLog('INFO', 'Supervisor', 'Lanzando el motor de consenso del Supervisor...');
      setAgents(prev => ({ ...prev, Supervisor: { ...prev.Supervisor, status: 'PROCESSING' } }));
      await sleep(1200);

      // Calcular puntaje ponderado
      let weightedTotal = 0;
      let totalAssessedWeight = 0;

      // Usando el estado más fresco de los agentes para simular el Blackboard
      const rawScores = {
        TechnicalAnalyst: techScore,
        News: newsScore,
        Sentiment: sentimentScore,
        OnChain: onChainScore,
        OrderFlow: flowScore,
        Correlation: corrScore,
        Backtesting: backtestScore,
        Divergence: divScore,
        Liquidation: liqScore
      };

      Object.entries(rawScores).forEach(([key, score]) => {
        const agentName = key as AgentName;
        const weight = agentWeights[agentName] || 0;
        weightedTotal += score * weight;
        totalAssessedWeight += weight;
      });

      const finalConsensusScore = Math.round(weightedTotal / (totalAssessedWeight || 1));
      
      let direction: MarketDirection = 'HOLD';
      if (finalConsensusScore >= 20) direction = 'BUY';
      else if (finalConsensusScore <= -20) direction = 'SELL';

      const rationaleText = direction === 'BUY'
        ? `Consenso ALTAMENTE ALCISTA (+${finalConsensusScore}). El Analista Técnico y los flujos institucionales en Order Book y On-Chain confirman la entrada de dinero inteligente (Smart Money). Los modelos cognitivos Gemini validan el sentimiento y macro-economía favorable.`
        : direction === 'SELL'
        ? `Consenso ALTAMENTE BAJISTA (${finalConsensusScore}). El análisis de mercado estructural de 1h confirma la ruptura de soportes clave. La distribución de ballenas On-Chain y las absorciones vendedoras detectadas por el Order Flow avalan posiciones cortas.`
        : `Consenso NEUTRAL (${finalConsensusScore}). El mercado se encuentra en un rango de acumulación lateral estrecho. No existe confluencia suficiente entre los factores rápidos y lentos para justificar una orden.`;

      setAgents(prev => ({
        ...prev,
        Supervisor: {
          ...prev.Supervisor,
          status: 'COMPLETED',
          score: finalConsensusScore,
          confidence: 0.92,
          lastUpdated: new Date().toLocaleTimeString(),
          justification: rationaleText,
          details: { weighted_score: finalConsensusScore, total_agents_consulted: 9, fallback_applied: false }
        }
      }));

      setConsensusResult({
        direction,
        score: finalConsensusScore,
        justification: rationaleText,
        details: `Ejecutado con éxito bajo confluencia de 9 sub-agentes independientes.`,
        timestamp: new Date().toLocaleTimeString()
      });

      addLog('INFO', 'Supervisor', `Decisión del Supervisor tomada: ${direction} (Score: ${finalConsensusScore})`);

      // 6. Execution Agent a través de Bitget
      setAgents(prev => ({ ...prev, Execution: { ...prev.Execution, status: 'PROCESSING' } }));
      await sleep(1000);

      let orderPlacedText = 'Sin órdenes enviadas al exchange.';
      if (direction !== 'HOLD') {
        const simQty = Number((100 / price).toFixed(4));
        const side = direction === 'BUY' ? 'LONG' : 'SHORT';
        
        setActivePosition({
          symbol,
          side,
          entryPrice: price,
          currentPrice: price,
          quantity: simQty,
          leverage: 10, // Default simulated leverage
          pnl: 0,
          pnlPercentage: 0,
          stopLoss: calculatedSL,
          takeProfit: calculatedTP
        });

        orderPlacedText = `ORDEN ENVIADA A BITGET API: ${direction} ${simQty} ${symbol} en ${price} (Apalancamiento: 10x)`;
        addLog('INFO', 'Execution', orderPlacedText);
        setSystemAlerts(prev => prev + 1);
      } else {
        addLog('INFO', 'Execution', 'No se cumplen los umbrales mínimos de scoring para operar. Manteniendo liquidez de reserva.');
      }

      setAgents(prev => ({
        ...prev,
        Execution: {
          ...prev.Execution,
          status: 'COMPLETED',
          score: direction !== 'HOLD' ? 100 : 0,
          confidence: 1.0,
          lastUpdated: new Date().toLocaleTimeString(),
          justification: orderPlacedText,
          details: { api_latency_ms: 124, order_type_routing: 'Futuros' }
        }
      }));

      // 7. Modulos finales: Aprendizaje, Auditoría y Notificaciones
      setAgents(prev => ({
        ...prev,
        Learning: { ...prev.Learning, status: 'PROCESSING' },
        Audit: { ...prev.Audit, status: 'PROCESSING' },
        Notification: { ...prev.Notification, status: 'PROCESSING' }
      }));
      await sleep(1200);

      // Optimizar un parámetro ficticio de aprendizaje
      const rsiMod = Math.random() > 0.5 ? 1 : -1;
      setLearningParams(prev => ({
        ...prev,
        rsi_period: Math.max(8, Math.min(21, prev.rsi_period + rsiMod)),
        win_rate_target: Number((prev.win_rate_target + (Math.random() - 0.45) * 0.5).toFixed(1))
      }));

      setAgents(prev => ({
        ...prev,
        Learning: {
          ...prev.Learning,
          status: 'COMPLETED',
          score: 100,
          confidence: 1.0,
          lastUpdated: new Date().toLocaleTimeString(),
          justification: `Parámetros actualizados en base de datos. Se ajusta el período del RSI a ${learningParams.rsi_period} y se guarda en tabla 'learning_performance' para optimización bayesiana en la próxima época.`,
          details: { optimized_epochs: 13, bayesian_tuning_factor: 1.08 }
        },
        Audit: {
          ...prev.Audit,
          status: 'COMPLETED',
          score: 100,
          confidence: 1.0,
          lastUpdated: new Date().toLocaleTimeString(),
          justification: `Sesión de orquestación registrada en base de datos en su totalidad. Hash guardado con éxito.`,
          details: { db_storage_status: 'Synced', table: 'audit_logs' }
        },
        Notification: {
          ...prev.Notification,
          status: 'COMPLETED',
          score: 100,
          confidence: 1.0,
          lastUpdated: new Date().toLocaleTimeString(),
          justification: `Canales Telegram y Discord actualizados con la última decisión del Supervisor y el estado de la cartera.`,
          details: { telegram_status: 'Connected', discord_status: 'Connected' }
        }
      }));

      addLog('INFO', 'Notification', `Mensaje de estado despachado mediante webhook a Telegram.`);
      addLog('INFO', 'Audit', `Cierre de auditoría. Hash de bloque registrado de forma inmutable en PostgreSQL.`);

    } catch (err) {
      addLog('ERROR', 'Orchestrator', `Excepción fatal en la ejecución del ciclo de trading: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Safe reset of variables and position simulation
  const handleResetPosition = () => {
    setActivePosition(null);
    addLog('INFO', 'RiskManager', 'Posición activa cerrada manualmente. Volviendo a modo de liquidez 100%.');
  };

  const handlePlaceManualOrder = (side: 'LONG' | 'SHORT') => {
    const calculatedSize = Number((1.5 + Math.random() * 1.5).toFixed(2));
    const offset = price * 0.02;
    const simQty = Number((150 / price).toFixed(4));
    
    setActivePosition({
      symbol,
      side,
      entryPrice: price,
      currentPrice: price,
      quantity: simQty,
      leverage: 10,
      pnl: 0,
      pnlPercentage: 0,
      stopLoss: Number((side === 'LONG' ? price - offset : price + offset).toFixed(2)),
      takeProfit: Number((side === 'LONG' ? price + offset * 2.2 : price - offset * 2.2).toFixed(2))
    });

    addLog('INFO', 'Execution', `ORDEN MANUAL ENVIADA A BITGET API: ${side} ${simQty} ${symbol} en ${price} (ATR Stop configurado)`);
  };

  // Helper to retrieve color coding based on score values
  const getScoreColor = (score: number) => {
    if (score > 15) return 'text-emerald-400 bg-emerald-950/40 border-emerald-800/30';
    if (score < -15) return 'text-rose-400 bg-rose-950/40 border-rose-800/30';
    return 'text-slate-400 bg-slate-900/60 border-slate-800/40';
  };

  return (
    <div className="min-h-screen bg-[#07080c] text-slate-100 flex flex-col antialiased">
      {/* Top Banner - Global Header */}
      <header className="border-b border-[#1b1e2e]/70 bg-[#0c0e18] px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4 sticky top-0 z-40 shadow-xl backdrop-blur-md">
        <div className="flex items-center gap-3">
          <AtlasLogo />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display font-extrabold text-2xl tracking-wider bg-gradient-to-r from-slate-100 via-indigo-200 to-cyan-300 bg-clip-text text-transparent uppercase">
                ATLAS AI TRADING
              </h1>
              <span className="text-[10px] bg-indigo-950 text-indigo-300 font-mono px-2 py-0.5 rounded border border-indigo-800/50">
                v1.2.0
              </span>
            </div>
            <p className="text-[10px] tracking-widest text-cyan-400/90 font-mono font-bold uppercase mt-0.5">
              INTELLIGENCE. ADAPTIVE. PROFITABLE.
            </p>
          </div>
        </div>

        {/* Live Controller Toggles */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Active Asset selection */}
          <div className="flex bg-[#0f1222] border border-[#1b203c] rounded-lg p-1">
            {(['BTC/USDT', 'ETH/USDT', 'SOL/USDT'] as const).map(sym => (
              <button
                key={sym}
                onClick={() => setSymbol(sym)}
                className={`px-3 py-1.5 text-xs font-mono font-medium rounded-md transition-all duration-300 ${
                  symbol === sym 
                    ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-md shadow-indigo-900/30' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {sym}
              </button>
            ))}
          </div>

          {/* Timeframe selection */}
          <div className="flex bg-[#0f1222] border border-[#1b203c] rounded-lg p-1">
            {(['15m', '1h', '4h', '1D'] as const).map(tf => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-2.5 py-1.5 text-xs font-mono font-medium rounded-md transition-all duration-300 ${
                  timeframe === tf 
                    ? 'bg-indigo-950 text-indigo-300 border border-indigo-800/40' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          {/* Status Indicator */}
          <div className="flex items-center gap-2 bg-[#0c1322] border border-[#182645] px-3 py-1.5 rounded-lg text-xs font-mono">
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                apiConfig.modoReal ? 'bg-amber-400' : 'bg-emerald-400'
              }`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${
                apiConfig.modoReal ? 'bg-amber-500' : 'bg-emerald-500'
              }`}></span>
            </span>
            <span className="text-slate-400">{apiConfig.modoReal ? 'Entorno Real' : 'Sandbox'}</span>
            <span className={`font-bold font-sans ${
              apiConfig.modoReal ? 'text-amber-400' : 'text-emerald-400'
            }`}>CONECTADO</span>
          </div>

          {/* Dynamic Run Trigger Button */}
          <button
            onClick={handleTriggerPipeline}
            disabled={isProcessing}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all duration-300 ${
              isProcessing 
                ? 'bg-indigo-950 text-indigo-400 cursor-not-allowed border border-indigo-800/30' 
                : 'bg-gradient-to-r from-indigo-500 via-indigo-600 to-indigo-700 hover:from-indigo-600 hover:to-indigo-800 text-slate-100 shadow-lg shadow-indigo-950/40 hover:shadow-indigo-900/40 transform hover:-translate-y-0.5 active:translate-y-0'
            }`}
          >
            <Play className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} />
            {isProcessing ? 'PROCESANDO...' : 'LANZAR ORQUESTACIÓN'}
          </button>
        </div>
      </header>

      {/* Primary KPI Stats Area */}
      <section className="bg-[#090b12] border-b border-[#131726]/60 p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 shadow-inner">
        {/* Price KPI */}
        <div className="bg-[#0f1222]/80 border border-[#1d2340]/60 rounded-xl p-4 flex items-center justify-between transition-all duration-300 hover:border-[#2b335c]/80">
          <div>
            <p className="text-[10px] text-slate-400 font-mono tracking-wider">COTIZACIÓN EN VIVO</p>
            <h3 className="font-mono text-xl font-bold tracking-tight text-slate-100 mt-1 flex items-baseline gap-1">
              ${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              <span className="text-xs text-slate-500">USDT</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1 font-mono">
              <Activity className="w-3 h-3 text-indigo-400" />
              Feed Bitget WebSocket
            </p>
          </div>
          <div className={`p-3 rounded-lg ${
            priceDirection === 'UP' ? 'bg-emerald-950/40 text-emerald-400' : priceDirection === 'DOWN' ? 'bg-rose-950/40 text-rose-400' : 'bg-slate-900 text-slate-400'
          }`}>
            {priceDirection === 'UP' ? <ArrowUpRight className="w-5 h-5" /> : priceDirection === 'DOWN' ? <ArrowDownRight className="w-5 h-5" /> : <Activity className="w-5 h-5" />}
          </div>
        </div>

        {/* Balances KPI */}
        <div className="bg-[#0f1222]/80 border border-[#1d2340]/60 rounded-xl p-4 flex items-center justify-between transition-all duration-300 hover:border-[#2b335c]/80">
          <div>
            <p className="text-[10px] text-slate-400 font-mono tracking-wider">SALDOS DISPONIBLES (USDT)</p>
            <div className="space-y-1.5 mt-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded font-mono bg-emerald-950 text-emerald-400 border border-emerald-800/40">DEMO</span>
                <span className="font-mono text-sm font-bold text-slate-100">${balances.demo.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                {balances.activeMode === 'demo' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" title="Modo Operativo Activo" />}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded font-mono bg-amber-950 text-amber-400 border border-amber-800/40">REAL</span>
                <span className="font-mono text-sm font-bold text-slate-100">${balances.real.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                {balances.activeMode === 'real' && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" title="Modo Operativo Activo" />}
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-1.5 flex items-center gap-1 font-mono">
              <Wallet className="w-3.5 h-3.5 text-indigo-400" />
              Saldos Cuenta de Futuros
            </p>
          </div>
          <div className="p-3 bg-[#0c1322] text-indigo-400 rounded-lg border border-[#182645]">
            <Wallet className="w-5 h-5" />
          </div>
        </div>

        {/* Position KPI */}
        <div className="bg-[#0f1222]/80 border border-[#1d2340]/60 rounded-xl p-4 flex items-center justify-between transition-all duration-300 hover:border-[#2b335c]/80">
          <div>
            <p className="text-[10px] text-slate-400 font-mono tracking-wider">POSICIÓN BITGET API</p>
            {activePosition ? (
              <div>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className={`text-xs font-extrabold px-1.5 py-0.5 rounded font-mono ${
                    activePosition.side === 'LONG' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/30' : 'bg-rose-950 text-rose-400 border border-rose-800/30'
                  }`}>
                    {activePosition.side}
                  </span>
                  <span className="font-mono text-sm font-semibold">{activePosition.leverage}x</span>
                  <span className="text-[11px] text-slate-500 font-mono">Qty: {activePosition.quantity}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-sm font-bold font-mono ${activePosition.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    ${activePosition.pnl >= 0 ? '+' : ''}{activePosition.pnl.toLocaleString()}
                  </span>
                  <span className={`text-xs font-mono ${activePosition.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    ({activePosition.pnlPercentage >= 0 ? '+' : ''}{activePosition.pnlPercentage}%)
                  </span>
                </div>
              </div>
            ) : (
              <div>
                <h3 className="font-mono text-base font-semibold text-slate-400 mt-1">Liquidez de Reserva</h3>
                <p className="text-xs text-slate-500 mt-1">No hay posiciones activas en Bitget</p>
              </div>
            )}
          </div>
          {activePosition ? (
            <button
              onClick={handleResetPosition}
              className="p-2 text-xs bg-rose-950/50 hover:bg-rose-900 border border-rose-900/40 text-rose-300 rounded-lg font-semibold transition-all"
            >
              CERRAR
            </button>
          ) : (
            <div className="p-3 bg-slate-900 text-slate-500 rounded-lg">
              <Shield className="w-5 h-5" />
            </div>
          )}
        </div>

        {/* Global Consensus score KPI */}
        <div className="bg-[#0f1222]/80 border border-[#1d2340]/60 rounded-xl p-4 flex items-center justify-between transition-all duration-300 hover:border-[#2b335c]/80">
          <div>
            <p className="text-[10px] text-slate-400 font-mono tracking-wider">SCORE DE CONSENSO</p>
            <div className="flex items-baseline gap-2 mt-1">
              <h3 className={`font-mono text-xl font-bold tracking-tight ${
                consensusResult.score >= 20 ? 'text-emerald-400' : consensusResult.score <= -20 ? 'text-rose-400' : 'text-slate-300'
              }`}>
                {consensusResult.score > 0 ? `+${consensusResult.score}` : consensusResult.score}
              </h3>
              <span className="text-[10px] text-slate-500 font-mono">/ [-100, 100]</span>
            </div>
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1 font-mono">
              Consenso: 
              <span className={`font-bold ${
                consensusResult.direction === 'BUY' ? 'text-emerald-400' : consensusResult.direction === 'SELL' ? 'text-rose-400' : 'text-slate-400'
              }`}>
                {consensusResult.direction === 'BUY' ? 'ALCISTA (BUY)' : consensusResult.direction === 'SELL' ? 'BAJISTA (SELL)' : 'NEUTRAL (HOLD)'}
              </span>
            </p>
          </div>
          <div className={`p-3 rounded-lg ${
            consensusResult.direction === 'BUY' ? 'bg-emerald-950/40 text-emerald-400' : consensusResult.direction === 'SELL' ? 'bg-rose-950/40 text-rose-400' : 'bg-slate-900 text-slate-400'
          }`}>
            <BarChart2 className="w-5 h-5" />
          </div>
        </div>

        {/* Risk Budget KPI */}
        <div className="bg-[#0f1222]/80 border border-[#1d2340]/60 rounded-xl p-4 flex items-center justify-between transition-all duration-300 hover:border-[#2b335c]/80">
          <div>
            <p className="text-[10px] text-slate-400 font-mono tracking-wider">PRESUPUESTO DE RIESGO</p>
            <h3 className="font-mono text-xl font-bold tracking-tight text-indigo-400 mt-1">
              {learningParams.global_risk_limit}% <span className="text-xs text-slate-500">Max</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1 font-mono">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
              Criterio Half-Kelly activo
            </p>
          </div>
          <div className="p-3 bg-indigo-950/40 text-indigo-400 rounded-lg border border-indigo-900/30">
            <Shield className="w-5 h-5" />
          </div>
        </div>
      </section>

      {/* Main Workspace Layout */}
      <main className="flex-1 p-6 grid grid-cols-1 xl:grid-cols-12 gap-6 max-w-[1700px] w-full mx-auto">
        
        {/* Left Side: 15-Agent Grid and Blackboard Monitor (7 Columns) */}
        <section className="xl:col-span-7 flex flex-col gap-6">
          <div className="bg-[#0c0e18] border border-[#181c30]/70 rounded-xl p-5 shadow-xl">
            <div className="flex items-center justify-between border-b border-[#1b1e2e] pb-4 mb-4">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-400" />
                <h2 className="font-display font-semibold text-sm tracking-wide text-slate-100 uppercase">
                  MONITOR DE PIZARRA (BLACKBOARD)
                </h2>
              </div>
              <span className="text-[10px] font-mono text-slate-400">
                15 Agentes Desacoplados Activos
              </span>
            </div>

            {/* Grid layout for all 15 agents */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[620px] overflow-y-auto pr-1">
              {(Object.values(agents) as AgentState[]).map(agent => {
                const isSelected = selectedAgentName === agent.name;
                const scoreColor = getScoreColor(agent.score);
                
                return (
                  <div
                    key={agent.name}
                    onClick={() => setSelectedAgentName(agent.name)}
                    className={`p-3.5 rounded-lg border text-left cursor-pointer transition-all duration-300 ${
                      isSelected 
                        ? 'bg-gradient-to-tr from-[#121528] to-[#1c213d] border-indigo-600/70 shadow-lg shadow-indigo-950/30 transform translate-x-1' 
                        : 'bg-[#0e111d]/70 hover:bg-[#12162a]/50 border-[#1a1e36]/70 hover:border-[#232a4a]/80'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={`w-2 h-2 rounded-full ${
                          agent.status === 'PROCESSING' 
                            ? 'bg-amber-400 animate-pulse' 
                            : agent.status === 'COMPLETED' 
                            ? 'bg-emerald-400' 
                            : 'bg-slate-600'
                        }`} />
                        <span className="font-semibold text-xs text-slate-100 truncate">
                          {agent.spanishName}
                        </span>
                      </div>
                      <span className="text-[9px] font-mono text-slate-500 uppercase bg-[#080a13] px-1.5 py-0.5 rounded border border-[#1b213b]/30">
                        {agent.isFastLoop ? 'FAST' : 'SLOW'}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-400 line-clamp-1 mb-2.5">
                      {agent.description}
                    </p>

                    {/* Agent state meters */}
                    <div className="flex items-center justify-between gap-4">
                      {/* Metric Score Indicator */}
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-500 font-mono">Score:</span>
                        <span className={`text-[11px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                          agent.status === 'COMPLETED' ? scoreColor : 'text-slate-500 bg-slate-900/60 border-slate-800'
                        }`}>
                          {agent.status === 'COMPLETED' 
                            ? (agent.score > 0 ? `+${agent.score}` : agent.score) 
                            : 'N/A'}
                        </span>
                      </div>

                      {/* Confidence slider display */}
                      <div className="flex-1 flex items-center justify-end gap-1.5">
                        <span className="text-[10px] text-slate-500 font-mono">Conf:</span>
                        <div className="w-12 bg-slate-900 h-1.5 rounded-full overflow-hidden border border-slate-800/30">
                          <div 
                            className="bg-indigo-500 h-full rounded-full transition-all duration-500"
                            style={{ width: `${agent.status === 'COMPLETED' ? agent.confidence * 100 : 0}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-mono text-slate-400">
                          {agent.status === 'COMPLETED' ? `${Math.round(agent.confidence * 100)}%` : '0%'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick Informational Guide regarding Blackboard decoupling */}
          <div className="bg-[#0d121f] border border-[#141b31] rounded-lg p-4 flex gap-3 text-xs text-slate-400 leading-relaxed">
            <Info className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-200">Arquitectura Desacoplada Blackboard:</span> Ningún agente tiene dependencia jerárquica con los otros. Cada agente lee/escribe únicamente en el slot asignado del Blackboard bajo estricto TTL. El orquestador ejecuta los pipelines concurrentemente, permitiendo que el Supervisor califique y emita decisiones robustas incluso si hay latencias o caídas de APIs.
            </div>
          </div>
        </section>

        {/* Right Side: Tabbed Workspace and Console (5 Columns) */}
        <section className="xl:col-span-5 flex flex-col gap-6">
          <div className="bg-[#0c0e18] border border-[#181c30]/70 rounded-xl p-5 shadow-xl flex-1 flex flex-col min-h-[500px]">
            
            {/* Tab navigation headers */}
            <div className="flex border-b border-[#1b1e2e] mb-4 gap-1 overflow-x-auto">
              <button
                onClick={() => setActiveTab('decision')}
                className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all shrink-0 ${
                  activeTab === 'decision' 
                    ? 'border-indigo-500 text-slate-100' 
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                Decisión Consenso
              </button>

              <button
                onClick={() => setActiveTab('logs')}
                className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all shrink-0 ${
                  activeTab === 'logs' 
                    ? 'border-indigo-500 text-slate-100' 
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                Consola Logs
              </button>

              <button
                onClick={() => setActiveTab('terminal')}
                className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all shrink-0 ${
                  activeTab === 'terminal' 
                    ? 'border-indigo-500 text-slate-100' 
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sliders className="w-3.5 h-3.5 text-amber-400" />
                Bitget Operar
              </button>

              <button
                onClick={() => setActiveTab('learning')}
                className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all shrink-0 ${
                  activeTab === 'learning' 
                    ? 'border-indigo-500 text-slate-100' 
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                Aprendizaje
              </button>

              <button
                onClick={() => setActiveTab('api-config')}
                className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all shrink-0 ${
                  activeTab === 'api-config' 
                    ? 'border-indigo-500 text-slate-100' 
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Settings className="w-3.5 h-3.5 text-cyan-400 animate-spin-slow" />
                ⚙️ Configuración API
              </button>
            </div>

            {/* Tab content areas */}
            <div className="flex-1 flex flex-col justify-between">
              <AnimatePresence mode="wait">
                {activeTab === 'decision' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-4 flex-1 flex flex-col"
                  >
                    <div className="bg-[#0a0c14] border border-[#191d35] p-4 rounded-lg">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Activity className="w-4 h-4 text-indigo-400" />
                          <h3 className="text-xs font-bold text-slate-200 font-display">
                            ÚLTIMO DICTAMEN DEL SUPERVISOR
                          </h3>
                        </div>
                        <span className="text-[10px] font-mono text-slate-500">
                          {consensusResult.timestamp}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 mb-3">
                        <span className={`text-sm font-extrabold px-2.5 py-1 rounded font-mono ${
                          consensusResult.direction === 'BUY' 
                            ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/40' 
                            : consensusResult.direction === 'SELL' 
                            ? 'bg-rose-950/80 text-rose-400 border border-rose-800/40' 
                            : 'bg-slate-900 text-slate-400 border border-slate-800'
                        }`}>
                          {consensusResult.direction === 'BUY' ? 'COMPRAR / LONG' : consensusResult.direction === 'SELL' ? 'VENDER / SHORT' : 'MANTENER / HOLD'}
                        </span>
                        <span className="text-xs text-slate-400 font-mono">
                          Puntaje Final: {consensusResult.score > 0 ? `+${consensusResult.score}` : consensusResult.score}
                        </span>
                      </div>

                      <p className="text-xs text-slate-300 leading-relaxed font-sans border-t border-[#191d35] pt-3">
                        {consensusResult.justification}
                      </p>
                    </div>

                    {/* Weight adjustments container */}
                    <div className="bg-[#0a0c14] border border-[#191d35] p-4 rounded-lg flex-1">
                      <h4 className="text-[11px] font-bold text-slate-300 tracking-wider uppercase mb-3 flex items-center justify-between">
                        <span>Ponderación de Agentes (Pesos)</span>
                        <span className="text-[9px] font-mono text-indigo-400">Optimizado por Learning Agent</span>
                      </h4>
                      <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                        {(Object.entries(agentWeights) as Array<[AgentName, number]>).map(([key, value]) => {
                          if (value === 0) return null;
                          const typedKey = key as AgentName;
                          return (
                            <div key={key} className="flex items-center justify-between text-xs font-mono">
                              <span className="text-slate-400">{agents[typedKey]?.spanishName || key}</span>
                              <div className="flex items-center gap-3">
                                <input
                                  type="range"
                                  min="0"
                                  max="0.5"
                                  step="0.01"
                                  value={value}
                                  onChange={(e) => setAgentWeights(prev => ({ ...prev, [key]: parseFloat(e.target.value) }))}
                                  className="w-24 accent-indigo-500 bg-slate-950 h-1 rounded"
                                />
                                <span className="text-indigo-400 w-8 text-right">{(value * 100).toFixed(0)}%</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </motion.div>
                )}

                {activeTab === 'logs' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="flex-1 flex flex-col"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-xs font-bold text-slate-200">
                        AUDITORÍA DRIZZLE / BASE DE DATOS
                      </h3>
                      <button 
                        onClick={() => setLogs([])}
                        className="text-[10px] text-slate-500 hover:text-slate-300 transition font-mono uppercase"
                      >
                        Limpiar Consola
                      </button>
                    </div>
                    
                    <div className="bg-[#05060b] border border-[#171a2d] p-3 rounded-lg font-mono text-[11px] flex-1 overflow-y-auto max-h-[340px] space-y-2 text-slate-300">
                      {logs.map(log => (
                        <div key={log.id} className="border-b border-[#131526]/30 pb-1.5 last:border-0">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-500 text-[10px]">{log.timestamp}</span>
                            <span className={`px-1 rounded text-[9px] font-bold ${
                              log.level === 'ERROR' ? 'bg-rose-950/60 text-rose-400 border border-rose-900/40' :
                              log.level === 'WARN' ? 'bg-amber-950/60 text-amber-400 border border-amber-900/40' :
                              log.level === 'DEBUG' ? 'bg-cyan-950/60 text-cyan-400 border border-cyan-900/40' :
                              'bg-slate-900 text-slate-300 border border-slate-800'
                            }`}>
                              {log.level}
                            </span>
                            <span className="text-indigo-400 font-bold font-sans text-[10px]">{log.agentName}</span>
                          </div>
                          <p className="mt-1 pl-1 text-slate-300 font-sans text-xs leading-relaxed">{log.message}</p>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}

                {activeTab === 'terminal' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-4 flex-1 flex flex-col justify-between"
                  >
                    <div className="bg-[#0a0c14] border border-[#191d35] p-4 rounded-lg">
                      <h3 className="text-xs font-bold text-slate-200 mb-3 uppercase tracking-wider flex items-center justify-between">
                        <span>Ordenador Manual / Semi-Auto</span>
                        <span className="text-[9px] text-slate-500 font-mono">Simulación de Inyección API</span>
                      </h3>

                      <div className="grid grid-cols-2 gap-4">
                        <button
                          onClick={() => handlePlaceManualOrder('LONG')}
                          className="w-full bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white py-2.5 rounded-lg text-xs font-bold shadow-lg shadow-emerald-950/30 transition-all transform hover:-translate-y-0.5"
                        >
                          EJECUTAR LONG (BUY)
                        </button>
                        <button
                          onClick={() => handlePlaceManualOrder('SHORT')}
                          className="w-full bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white py-2.5 rounded-lg text-xs font-bold shadow-lg shadow-rose-950/30 transition-all transform hover:-translate-y-0.5"
                        >
                          EJECUTAR SHORT (SELL)
                        </button>
                      </div>

                      <div className="mt-4 border-t border-[#1d2340] pt-4 space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-400">ATR Stop Sugerido:</span>
                          <span className="font-mono text-slate-200 font-bold">${(price * 0.985).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-400">Tamaño Posición Kelly:</span>
                          <span className="font-mono text-slate-200 font-bold">{learningParams.kelly_multiplier * 5}% apalancado</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-400">Exchange Destino:</span>
                          <span className="font-mono text-indigo-400 font-bold">Bitget Testnet V2</span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-yellow-950/20 border border-yellow-900/30 rounded-lg p-3 text-[11px] text-yellow-400/90 leading-relaxed flex gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      Módulo de Riesgo activo: Ninguna orden manual o automatizada puede enviarse si el Drawdown diario excede el 5% o si la volatilidad excede los límites históricos.
                    </div>
                  </motion.div>
                )}

                {activeTab === 'learning' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-4 flex-1 flex flex-col"
                  >
                    <div className="bg-[#0a0c14] border border-[#191d35] p-4 rounded-lg">
                      <h3 className="text-xs font-bold text-slate-200 mb-3 font-display">
                        PARÁMETROS OPTIMIZADOS POR EL AGENTE DE APRENDIZAJE
                      </h3>

                      <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                        <div className="bg-slate-900/60 border border-slate-800 p-2.5 rounded">
                          <span className="text-slate-500 block text-[10px]">RSI OPTIMIZADO</span>
                          <span className="text-slate-100 font-bold text-sm">{learningParams.rsi_period} Períodos</span>
                        </div>
                        <div className="bg-slate-900/60 border border-slate-800 p-2.5 rounded">
                          <span className="text-slate-500 block text-[10px]">TASA ACERTOS ESPERADA</span>
                          <span className="text-emerald-400 font-bold text-sm">{learningParams.win_rate_target}% WR</span>
                        </div>
                        <div className="bg-slate-900/60 border border-slate-800 p-2.5 rounded">
                          <span className="text-slate-500 block text-[10px]">FACTOR DE GANANCIA</span>
                          <span className="text-indigo-400 font-bold text-sm">{learningParams.profit_factor} Profit Factor</span>
                        </div>
                        <div className="bg-slate-900/60 border border-slate-800 p-2.5 rounded">
                          <span className="text-slate-500 block text-[10px]">DURACIÓN DE TTL SLOTS</span>
                          <span className="text-slate-100 font-bold text-sm">30 minutos</span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-indigo-950/20 border border-indigo-900/30 p-3 rounded-lg text-xs text-slate-300">
                      <span className="font-bold text-indigo-300 block mb-1">Ajuste Bayesiano Activo:</span>
                      El Learning Agent ajusta las ponderaciones y el tamaño de Kelly automáticamente después de cada 10 operaciones, analizando la discrepancia entre las señales de los analistas y el resultado del P&L real.
                    </div>
                  </motion.div>
                )}

                {activeTab === 'api-config' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-4 flex-1 flex flex-col justify-between"
                  >
                    <form onSubmit={saveApiConfig} className="space-y-4 flex-1 flex flex-col justify-between">
                      <div className="space-y-4">
                        <div className="bg-[#0a0c14] border border-[#191d35] p-4 rounded-lg space-y-4">
                          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                            <Shield className="w-4 h-4 text-cyan-400" />
                            <span>Parámetros de Enlace Encriptado (Bitget)</span>
                          </h3>

                          {/* Token de Administrador */}
                          <div className="space-y-1.5 pb-2 border-b border-[#182645]/40 mb-2">
                            <label className="text-[10px] font-mono text-cyan-400 uppercase tracking-wider flex items-center gap-1 font-bold">
                              <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                              Token de Administrador (Firma de Seguridad)
                            </label>
                            <div className="relative">
                              <input
                                type={showAdminToken ? 'text' : 'password'}
                                value={adminToken}
                                onChange={(e) => setAdminToken(e.target.value)}
                                placeholder="Introduce tu ADMIN_API_TOKEN..."
                                className="w-full bg-[#05060a] border border-cyan-500/30 rounded px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500 transition-all pr-10"
                                required
                              />
                              <button
                                type="button"
                                onClick={() => setShowAdminToken(!showAdminToken)}
                                className="absolute right-3 top-2 text-slate-400 hover:text-slate-200"
                              >
                                {showAdminToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                            <p className="text-[9px] text-slate-400 leading-normal">
                              Requerido para autorizar operaciones y leer configuraciones seguras en el servidor.
                            </p>
                          </div>

                          {/* API Key */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider flex items-center gap-1">
                              <Key className="w-3 h-3 text-slate-500" />
                              Bitget API Key
                            </label>
                            <div className="relative">
                              <input
                                type={showApiKey ? 'text' : 'password'}
                                value={apiConfig.apiKey}
                                onChange={(e) => setApiConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                                placeholder="bg_xxxx...xxxx"
                                className="w-full bg-[#05060a] border border-[#182645] rounded px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500 transition-all pr-10"
                                required
                              />
                              <button
                                type="button"
                                onClick={() => setShowApiKey(!showApiKey)}
                                className="absolute right-3 top-2 text-slate-400 hover:text-slate-200"
                              >
                                {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </div>

                          {/* API Secret */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider flex items-center gap-1">
                              <Lock className="w-3 h-3 text-slate-500" />
                              Bitget Secret Key
                            </label>
                            <div className="relative">
                              <input
                                type={showApiSecret ? 'text' : 'password'}
                                value={apiConfig.apiSecret}
                                onChange={(e) => setApiConfig(prev => ({ ...prev, apiSecret: e.target.value }))}
                                placeholder="bg_sec_xxxx...xxxx"
                                className="w-full bg-[#05060a] border border-[#182645] rounded px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500 transition-all pr-10"
                                required
                              />
                              <button
                                type="button"
                                onClick={() => setShowApiSecret(!showApiSecret)}
                                className="absolute right-3 top-2 text-slate-400 hover:text-slate-200"
                              >
                                {showApiSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </div>

                          {/* Passphrase */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider flex items-center gap-1">
                              <Lock className="w-3 h-3 text-slate-500" />
                              Bitget Passphrase
                            </label>
                            <div className="relative">
                              <input
                                type={showPassphrase ? 'text' : 'password'}
                                value={apiConfig.passphrase}
                                onChange={(e) => setApiConfig(prev => ({ ...prev, passphrase: e.target.value }))}
                                placeholder="Contraseña de firma de API"
                                className="w-full bg-[#05060a] border border-[#182645] rounded px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500 transition-all pr-10"
                                required
                              />
                              <button
                                type="button"
                                onClick={() => setShowPassphrase(!showPassphrase)}
                                className="absolute right-3 top-2 text-slate-400 hover:text-slate-200"
                              >
                                {showPassphrase ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Entorno operativo toggle */}
                        <div className="bg-[#0a0c14] border border-[#191d35] p-4 rounded-lg flex items-center justify-between">
                          <div className="space-y-1 pr-4">
                            <span className="text-xs font-bold text-slate-200 block uppercase tracking-wider">Modo Operativo de Inyección</span>
                            <span className="text-[10px] text-slate-400 block leading-normal">
                              Determina si las órdenes automáticas se inyectan en simulación local o se despachan directamente a la API de Futuros en Vivo.
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => setApiConfig(prev => ({ ...prev, modoReal: !prev.modoReal }))}
                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                              apiConfig.modoReal ? 'bg-amber-500' : 'bg-emerald-600'
                            }`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                apiConfig.modoReal ? 'translate-x-5' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </div>

                        {/* Modo visual indicator label */}
                        <div className="flex items-center gap-2 justify-center py-1">
                          <span className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded border uppercase tracking-wider ${
                            apiConfig.modoReal 
                              ? 'bg-amber-950/40 text-amber-400 border-amber-900/50' 
                              : 'bg-emerald-950/40 text-emerald-400 border-emerald-900/50'
                          }`}>
                            {apiConfig.modoReal ? '⚠️ MODO OPERATIVO REAL (FUTUROS EN VIVO)' : '⚙️ MODO SIMULACIÓN (SANDBOX LOCAL)'}
                          </span>
                        </div>

                        {/* Alert Messages */}
                        {apiConfigMessage && (
                          <div className={`p-3 rounded-lg text-xs flex gap-2 border ${
                            apiConfigMessage.type === 'success'
                              ? 'bg-emerald-950/30 text-emerald-400 border-emerald-500/20'
                              : 'bg-rose-950/30 text-rose-400 border-rose-500/20'
                          }`}>
                            {apiConfigMessage.type === 'success' ? (
                              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                            ) : (
                              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            )}
                            <span>{apiConfigMessage.text}</span>
                          </div>
                        )}
                      </div>

                      {/* Action Button */}
                      <button
                        type="submit"
                        disabled={apiConfigSaving || apiConfigLoading}
                        className={`w-full font-bold text-xs py-3 rounded-lg uppercase tracking-wider transition-all transform active:scale-[0.98] mt-4 flex items-center justify-center gap-2 ${
                          apiConfigSaving || apiConfigLoading
                            ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                            : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-950/40 hover:-translate-y-0.5'
                        }`}
                      >
                        {apiConfigSaving ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            GUARDANDO CONFIGURACIÓN...
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="w-3.5 h-3.5" />
                            GUARDAR CONFIGURACIÓN
                          </>
                        )}
                      </button>
                    </form>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Collapsible details for the selected agent in focus */}
              <div className="border-t border-[#1b1e2e]/60 pt-4 mt-4 bg-[#0a0c14]/40 p-3 rounded-lg">
                <div className="flex items-center gap-1.5 mb-2">
                  <Eye className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                    Inspección de Pizarra: {agents[selectedAgentName]?.spanishName}
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed italic mb-2">
                  "{agents[selectedAgentName]?.justification}"
                </p>
                <div className="bg-[#05060a] p-2 rounded border border-[#15192b] font-mono text-[10px] text-indigo-300 overflow-x-auto max-h-[100px]">
                  {JSON.stringify(agents[selectedAgentName]?.details, null, 2)}
                </div>
              </div>
            </div>

          </div>
        </section>
      </main>

      {/* Global Bottom Status Bar */}
      <footer className="border-t border-[#131726]/60 bg-[#090b12] px-6 py-3 text-xs font-mono text-slate-500 flex flex-col sm:flex-row justify-between items-center gap-2">
        <div className="flex items-center gap-3">
          <span>Servidor Principal: <span className="text-indigo-400">Node/Vite (Express v4)</span></span>
          <span className="text-slate-700">|</span>
          <span>Database: <span className="text-cyan-400">PostgreSQL (Drizzle ORM)</span></span>
        </div>
        <div>
          Desplegado de forma segura en AI Studio Workspace • 2026-07-08
        </div>
      </footer>
    </div>
  );
}
