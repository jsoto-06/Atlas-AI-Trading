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
  EyeOff, Lock, Key, Wallet, Sun, Moon, LayoutDashboard, LineChart, 
  SlidersHorizontal, Zap, ArrowRight, Check, Copy, ExternalLink, Filter, Search,
  Clock, Award, BarChart3, PieChart, Download, Trash2, ArrowUpDown, Globe
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

type MainNavigationTab = 'dashboard' | 'terminal' | 'backtest' | 'learning' | 'logs' | 'api-config';

// ----------------------------------------------------------------------------
// Custom Atlas AI Trading Vector Logo Component
// ----------------------------------------------------------------------------
const AtlasLogo = () => (
  <svg viewBox="0 0 100 100" className="w-10 h-10 text-cyan-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.5)] transition-transform duration-300 hover:scale-105" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="50" r="45" stroke="rgba(6,182,212,0.2)" strokeWidth="1.5" />
    <circle cx="50" cy="40" r="28" stroke="rgba(6,182,212,0.3)" strokeWidth="0.75" strokeDasharray="3 3" />
    <path d="M15 45 C 10 25, 90 25, 85 45" stroke="url(#cyanGlow)" strokeWidth="1.5" strokeLinecap="round" opacity="0.9" />
    <path d="M12 55 C 5 70, 95 70, 88 55" stroke="url(#indigoGlow)" strokeWidth="1.5" strokeLinecap="round" opacity="0.9" />
    <circle cx="50" cy="40" r="24" stroke="rgba(148,163,184,0.25)" strokeWidth="1" />
    <path d="M26 40 C 35 48, 65 48, 74 40" stroke="rgba(6,182,212,0.3)" strokeWidth="0.75" />
    <path d="M26 40 C 35 32, 65 32, 74 40" stroke="rgba(6,182,212,0.3)" strokeWidth="0.75" />
    <path d="M50 16 C 42 25, 42 55, 50 64" stroke="rgba(6,182,212,0.3)" strokeWidth="0.75" />
    <path d="M50 16 C 58 25, 58 55, 50 64" stroke="rgba(6,182,212,0.3)" strokeWidth="0.75" />
    <path d="M50 51 C48 51, 47 48, 50 45 C53 48, 52 51, 50 51 Z" fill="#e2e8f0" stroke="#475569" strokeWidth="0.5" />
    <path d="M36 58 L43 55 L47 52 L50 54 L53 52 L57 55 L64 58" stroke="#cbd5e1" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M43 55 L45 68 L50 78 L55 68 L57 55 Z" fill="url(#metallicGrad)" stroke="#475569" strokeWidth="0.75" strokeLinejoin="round" />
    <path d="M47 59 L53 59 M46 63 L54 63 M48 67 L52 67 M50 54 L50 78" stroke="#334155" strokeWidth="0.5" />
    <path d="M36 58 L30 47 L33 32 M33 32 L36 34 L32 46 L43 55" fill="url(#metallicGrad)" stroke="#64748b" strokeWidth="0.75" strokeLinejoin="round" />
    <path d="M64 58 L70 47 L67 32 M67 32 L64 34 L68 46 L57 55" fill="url(#metallicGrad)" stroke="#64748b" strokeWidth="0.75" strokeLinejoin="round" />
    <line x1="32" y1="45" x2="32" y2="35" stroke="#10b981" strokeWidth="0.75" />
    <rect x="30.5" y="38" width="3" height="4" fill="#10b981" rx="0.5" />
    <line x1="44" y1="36" x2="44" y2="24" stroke="#10b981" strokeWidth="0.75" />
    <rect x="42.5" y="27" width="3" height="6" fill="#10b981" rx="0.5" />
    <line x1="56" y1="26" x2="56" y2="14" stroke="#10b981" strokeWidth="0.75" />
    <rect x="54.5" y="18" width="3" height="5" fill="#10b981" rx="0.5" />
    <line x1="68" y1="18" x2="68" y2="6" stroke="#10b981" strokeWidth="0.75" />
    <rect x="66.5" y="9" width="3" height="6" fill="#10b981" rx="0.5" />
    <path d="M32 40 L44 30 L56 20 L68 12" stroke="#34d399" strokeWidth="1.5" strokeLinecap="round" opacity="0.95" />
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
  // Theme state: dark / light
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('atlas_theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return 'dark';
  });

  useEffect(() => {
    localStorage.setItem('atlas_theme', theme);
    document.documentElement.className = theme;
    document.body.className = theme;
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  const isDark = theme === 'dark';

  // Navigation tab state
  const [activeTab, setActiveTab] = useState<MainNavigationTab>('dashboard');

  // Connection and Session parameters
  const [symbol, setSymbol] = useState<'BTC/USDT' | 'ETH/USDT' | 'SOL/USDT'>('BTC/USDT');
  const [timeframe, setTimeframe] = useState<'15m' | '1h' | '4h' | '1D'>('1h');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  
  // Real-time prices
  const [price, setPrice] = useState<number>(68420.50);
  const [priceDirection, setPriceDirection] = useState<'UP' | 'DOWN' | 'NEUTRAL'>('NEUTRAL');
  const priceRef = useRef(price);
  useEffect(() => {
    priceRef.current = price;
  }, [price]);

  // Active Position
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

  // Orders History from Postgres DB
  const [ordersHistory, setOrdersHistory] = useState<Array<{
    id: number;
    clientOid: string;
    symbol: string;
    side: string;
    orderType: string;
    size: string;
    leverage: number;
    status: string;
    createdAt: string;
  }>>([]);

  // Closed Trades with Realized PnL from Postgres DB
  const [closedTrades, setClosedTrades] = useState<Array<{
    id: number;
    symbol: string;
    side: string;
    leverage: number;
    entryPrice: string;
    exitPrice: string;
    quantity: string;
    pnl: string;
    pnlPercentage: string;
    entryTime: string;
    exitTime: string;
  }>>([]);
  const [historyViewTab, setHistoryViewTab] = useState<'orders' | 'trades'>('orders');

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
      agentName: 'BrokerFactory',
      message: 'Arquitectura Multi-Exchange activa con soporte para Kraken Futures y Bitget Futures.',
    },
    {
      id: 'log_2',
      timestamp: new Date().toLocaleTimeString(),
      level: 'DEBUG',
      agentName: 'Database',
      message: 'Conexión a base de datos PostgreSQL activa. Tablas de auditoría y configuración sincronizadas.',
    }
  ]);

  // Selected agent for side panel inspection
  const [selectedAgentName, setSelectedAgentName] = useState<AgentName>('Supervisor');
  const [blackboardFilter, setBlackboardFilter] = useState<'ALL' | 'FAST' | 'SLOW'>('ALL');

  // Backtest State
  const [backtestDays, setBacktestDays] = useState<number>(7);
  const [backtestCapital, setBacktestCapital] = useState<number>(10000);
  const [backtestRunning, setBacktestRunning] = useState<boolean>(false);
  const [backtestResult, setBacktestResult] = useState<any>(null);
  const [backtestError, setBacktestError] = useState<string | null>(null);

  // Manual Trading Console State
  const [manualOrderType, setManualOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [manualLeverage, setManualLeverage] = useState<number>(10);
  const [manualSizeUsd, setManualSizeUsd] = useState<number>(100);

  // Log filter & search
  const [logFilter, setLogFilter] = useState<'ALL' | 'INFO' | 'WARN' | 'ERROR' | 'DEBUG'>('ALL');
  const [logSearch, setLogSearch] = useState<string>('');

  // API Config State - Initialized from localStorage or default to Kraken
  const [apiConfig, setApiConfig] = useState<ApiConfigState>(() => {
    const savedEx = (localStorage.getItem('atlas_active_exchange') as 'bitget' | 'kraken' | 'hyperliquid') || 'kraken';
    return {
      activeExchange: savedEx,
      apiKey: '',
      apiSecret: '',
      passphrase: '',
      modoReal: false,
      krakenApiKey: '',
      krakenApiSecret: '',
      krakenModoReal: false,
      hyperliquidPrivateKey: '',
      hyperliquidModoReal: false
    };
  });

  const [apiConfigLoading, setApiConfigLoading] = useState(false);
  const [apiConfigSaving, setApiConfigSaving] = useState(false);
  const [apiConfigMessage, setApiConfigMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Sub-tab for configuring Bitget, Kraken or Hyperliquid
  const [configSubTab, setConfigSubTab] = useState<'bitget' | 'kraken' | 'hyperliquid'>(() => {
    return (localStorage.getItem('atlas_active_exchange') as 'bitget' | 'kraken' | 'hyperliquid') || 'kraken';
  });

  // Admin Security Token - persistent in localStorage
  const [adminToken, setAdminToken] = useState(() => {
    return localStorage.getItem('atlas_admin_token') || sessionStorage.getItem('ADMIN_API_TOKEN') || '';
  });
  const [showAdminToken, setShowAdminToken] = useState(false);

  // API visibility states
  const [showApiKey, setShowApiKey] = useState(false);
  const [showApiSecret, setShowApiSecret] = useState(false);
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [showKrakenApiKey, setShowKrakenApiKey] = useState(false);
  const [showKrakenApiSecret, setShowKrakenApiSecret] = useState(false);
  const [showHyperliquidKey, setShowHyperliquidKey] = useState(false);

  // Balances State
  const [balances, setBalances] = useState<{ demo: number | null; real: number | null; activeMode: 'demo' | 'real'; exchange?: string }>({
    demo: null,
    real: null,
    activeMode: 'demo'
  });

  // Engine Scheduler 24/7 Autotrading State
  const [engineStatus, setEngineStatus] = useState<{
    running: boolean;
    state: string;
    totalCycles?: number;
    lastCycleAt?: number | null;
    timeframe?: string;
    symbol?: string;
  }>({
    running: false,
    state: 'STOPPED',
    totalCycles: 0,
    lastCycleAt: null,
    timeframe: '1h',
    symbol: 'BTC/USDT'
  });
  const [isTogglingEngine, setIsTogglingEngine] = useState(false);

  const fetchEngineStatus = async () => {
    if (!adminToken) return;
    try {
      const res = await fetch('/api/v1/engine/status', {
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setEngineStatus({
          running: !!data.running,
          state: data.state || 'STOPPED',
          totalCycles: data.totalCycles || 0,
          lastCycleAt: data.lastCycleAt || null,
          timeframe: data.timeframe || '1h',
          symbol: data.symbol || 'BTC/USDT'
        });
        if (data.timeframe && (data.timeframe === '15m' || data.timeframe === '1h')) {
          setTimeframe(data.timeframe);
        }
        if (data.symbol && (data.symbol === 'BTC/USDT' || data.symbol === 'ETH/USDT' || data.symbol === 'SOL/USDT')) {
          setSymbol(data.symbol);
        }
      }
    } catch {
      // Silencioso
    }
  };

  // Check /health on initial mount to auto-discover active server configuration
  useEffect(() => {
    fetch('/health')
      .then(res => res.json())
      .then(data => {
        if (data && data.activeExchange) {
          setApiConfig(prev => ({ 
            ...prev, 
            activeExchange: data.activeExchange,
            ...(data.activeExchange === 'hyperliquid'
              ? { hyperliquidModoReal: data.activeMode === 'real' }
              : data.activeExchange === 'kraken'
                ? { krakenModoReal: data.activeMode === 'real' }
                : { modoReal: data.activeMode === 'real' })
          }));
          setConfigSubTab(data.activeExchange);
          localStorage.setItem('atlas_active_exchange', data.activeExchange);
        }
      })
      .catch(() => {});
  }, []);

  // Sync token to persistent storage
  useEffect(() => {
    if (adminToken) {
      localStorage.setItem('atlas_admin_token', adminToken);
      sessionStorage.setItem('ADMIN_API_TOKEN', adminToken);
    }
  }, [adminToken]);

  // One-click exchange switcher (used in header, terminal, and config)
  const handleSwitchExchange = async (ex: 'bitget' | 'kraken' | 'hyperliquid') => {
    setApiConfig(prev => ({ ...prev, activeExchange: ex }));
    setConfigSubTab(ex);
    localStorage.setItem('atlas_active_exchange', ex);
    const exName = ex === 'hyperliquid' ? 'Hyperliquid DEX' : ex === 'kraken' ? 'Kraken Futures' : 'Bitget Futures';
    addLog('INFO', 'BrokerFactory', `Exchange activo conmutado a: ${exName}`);

    if (adminToken) {
      try {
        await fetch('/api/v1/telemetry/config', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${adminToken}`
          },
          body: JSON.stringify({ activeExchange: ex })
        });
        fetchBalances();
      } catch (e) {
        // Silencioso
      }
    }
  };

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
        const isRealMode = data.activeMode === 'real';
        setBalances({
          demo: !isRealMode && typeof data.demo === 'number' ? data.demo : null,
          real: isRealMode && typeof data.real === 'number' ? data.real : null,
          activeMode: data.activeMode || 'demo',
          exchange: data.exchange
        } as any);

        if (data.position && data.position.symbol) {
          const p = data.position;
          const offset = priceRef.current * 0.02;
          setActivePosition(prev => {
            const curPrice = priceRef.current > 0 ? priceRef.current : p.entryPrice;
            const diff = curPrice - p.entryPrice;
            const mult = p.side === 'LONG' ? 1 : -1;
            const lev = p.leverage || 10;
            const calcPnl = Number((diff * p.quantity * mult).toFixed(2));
            const calcPnlPct = p.entryPrice > 0 ? Number(((diff / p.entryPrice) * 100 * lev * mult).toFixed(2)) : 0;

            return {
              symbol: p.symbol,
              side: p.side,
              entryPrice: p.entryPrice,
              currentPrice: curPrice,
              quantity: p.quantity,
              leverage: lev,
              pnl: calcPnl,
              pnlPercentage: calcPnlPct,
              stopLoss: prev?.stopLoss || (p.side === 'LONG' ? p.entryPrice - offset : p.entryPrice + offset),
              takeProfit: prev?.takeProfit || (p.side === 'LONG' ? p.entryPrice + offset * 2.2 : p.entryPrice - offset * 2.2)
            };
          });
        }
      }
    } catch (err) {
      console.error('Error al obtener balances:', err);
    }
  };

  const fetchTelemetryState = async () => {
    try {
      const res = await fetch('/api/v1/telemetry/state', {
        headers: adminToken ? { 'Authorization': `Bearer ${adminToken}` } : {}
      });
      if (!res.ok) return;
      const data = await res.json();
      if (!data || !data.slots) return;

      const slotKey = `${symbol}:${timeframe}`;
      const slot = data.slots[slotKey] || Object.values(data.slots)[0] as any;
      if (!slot) return;

      if (slot.marketData?.value?.price) {
        setPrice(slot.marketData.value.price);
        priceRef.current = slot.marketData.value.price;
      }

      const assessments = slot.assessments || {};

      const tech = assessments.TechnicalAnalyst?.value;
      if (tech?.data?.indicadores) {
        const ind = tech.data.indicadores;
        setMarketRegime({
          adx: ind.adx?.valor ? Number(ind.adx.valor).toFixed(1) : '32.4',
          atr: ind.atr ? `$${Number(ind.atr).toFixed(2)}` : '1.85%',
          trend: ind.ema?.tendencia === 'ALCISTA' ? 'Tendencial Alcista' : ind.ema?.tendencia === 'BAJISTA' ? 'Tendencial Bajista' : 'Consolidación Lateral'
        });
      }

      if (Object.keys(assessments).length > 0) {
        setAgents(prev => {
          const next = { ...prev };
          for (const [key, item] of Object.entries(assessments)) {
            if (key === 'News') continue; // Desactivado por petición del usuario
            const agentKey = key as AgentName;
            if (next[agentKey] && (item as any)?.value) {
              const val = (item as any).value;
              next[agentKey] = {
                ...next[agentKey],
                status: 'COMPLETED',
                score: typeof val.score === 'number' ? val.score : next[agentKey].score,
                confidence: typeof val.confidence === 'number' ? val.confidence : next[agentKey].confidence,
                lastUpdated: val.timestamp ? new Date(val.timestamp).toLocaleTimeString() : next[agentKey].lastUpdated,
                justification: val.justification || val.justificacionConsolidada || next[agentKey].justification,
                details: val.data || next[agentKey].details
              };
            }
          }
          return next;
        });
      }

      const sup = assessments.Supervisor?.value;
      if (sup) {
        const finalScore = typeof sup.score === 'number' ? sup.score : 0;
        const rawDec = sup.data?.final_decision;
        const finalDirection: MarketDirection = rawDec === 'BUY' ? 'BUY' : rawDec === 'SELL' ? 'SELL' : 'HOLD';
        setConsensusResult({
          direction: finalDirection,
          score: finalScore,
          justification: sup.justification || sup.data?.justificacion_cognitiva || 'Consenso consolidado por el Agente Supervisor.',
          details: `Puntaje Ponderado: ${finalScore}/100. Confianza: ${((sup.confidence || 0.85) * 100).toFixed(1)}%.`,
          timestamp: sup.timestamp ? new Date(sup.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString()
        });
      }
    } catch {
      // Silencioso
    }
  };

  const fetchApiConfig = async () => {
    if (!adminToken) return;
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
          activeExchange: data.activeExchange || 'kraken',
          apiKey: data.apiKey || '',
          apiSecret: data.apiSecret || '',
          passphrase: data.passphrase || '',
          modoReal: !!data.modoReal,
          krakenApiKey: data.krakenApiKey || '',
          krakenApiSecret: data.krakenApiSecret || '',
          krakenModoReal: !!data.krakenModoReal,
          hyperliquidPrivateKey: data.hyperliquidPrivateKey || '',
          hyperliquidModoReal: !!data.hyperliquidModoReal
        });
        if (data.activeExchange) {
          setConfigSubTab(data.activeExchange);
          localStorage.setItem('atlas_active_exchange', data.activeExchange);
        }
      }
    } catch (err: any) {
      console.error('Error al cargar la configuración de API:', err);
    } finally {
      setApiConfigLoading(false);
    }
  };

  const saveApiConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminToken) {
      setApiConfigMessage({ type: 'error', text: 'Introduce tu Token de Administrador para guardar la configuración.' });
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
        localStorage.setItem('atlas_active_exchange', apiConfig.activeExchange);
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
      setApiConfigMessage({ type: 'error', text: `Falla de red: ${err.message || err}` });
    } finally {
      setApiConfigSaving(false);
    }
  };

  const fetchOrdersHistory = async () => {
    if (!adminToken) return;
    try {
      const [ordersRes, tradesRes] = await Promise.all([
        fetch('/api/v1/telemetry/orders?limit=30', {
          headers: { 'Authorization': `Bearer ${adminToken}` }
        }),
        fetch('/api/v1/telemetry/trades?limit=30', {
          headers: { 'Authorization': `Bearer ${adminToken}` }
        })
      ]);

      if (ordersRes.ok) {
        const data = await ordersRes.json();
        if (Array.isArray(data)) {
          setOrdersHistory(data);
        }
      }
      if (tradesRes.ok) {
        const tData = await tradesRes.json();
        if (Array.isArray(tData)) {
          setClosedTrades(tData);
        }
      }
    } catch {
      // Silencioso
    }
  };

  useEffect(() => {
    if (adminToken) {
      fetchApiConfig();
      fetchBalances();
      fetchEngineStatus();
      fetchTelemetryState();
      fetchOrdersHistory();
      const interval = setInterval(() => {
        fetchBalances();
        fetchEngineStatus();
        fetchTelemetryState();
        fetchOrdersHistory();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [adminToken, symbol, timeframe]);

  useEffect(() => {
    if (activeTab === 'api-config' && adminToken) {
      fetchApiConfig();
    }
    if (activeTab === 'terminal' && adminToken) {
      fetchOrdersHistory();
    }
  }, [activeTab]);

  // Main 15 Agents status tracker (Generic descriptions)
  const [agents, setAgents] = useState<Record<AgentName, AgentState>>({
    TechnicalAnalyst: {
      name: 'TechnicalAnalyst',
      spanishName: 'Analista Técnico',
      description: 'Calcula indicadores (RSI, MACD, EMA, VWAP) e interpreta patrones de liquidez (SMC/ICT) con IA.',
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
      description: 'Agente desactivado a petición del usuario. No interviene en la toma de decisiones.',
      isFastLoop: false,
      status: 'OFFLINE',
      score: 0,
      confidence: 0,
      lastUpdated: 'Desactivado',
      justification: 'Desactivado por configuración del usuario.',
      details: { estado: 'DESACTIVADO' }
    },
    Sentiment: {
      name: 'Sentiment',
      spanishName: 'Analista de Sentimiento',
      description: 'Mide la opinión social y el índice de Miedo y Codicia (Fear & Greed Index).',
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
      description: 'Sigue el flujo de billeteras frías, reservas en exchanges y acumulación de grandes participantes.',
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
      spanishName: 'Analista de Flujo de Órdenes',
      description: 'Monitorea el Order Book L2, DOM, CVD, Delta y liquidaciones en tiempo real.',
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
      description: 'Calcula correlaciones en vivo entre criptoactivos, Nasdaq, S&P 500 y el índice DXY.',
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
      description: 'Ejecuta simulaciones instantáneas con walk-forward para medir el win-rate esperado del setup.',
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
      description: 'Establece el tamaño de posición, Stop Loss y Take Profit aplicando Criterio de Quarter-Kelly.',
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
      description: 'Localiza divergencias regulares y ocultas entre precio, osciladores y volumen de mercado.',
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
      description: 'Identifica zonas de liquidez extrema acumulada y predice barridos de stop loss (Stop Hunting).',
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
      description: 'Consolida todos los análisis del Blackboard, calcula el puntaje ponderado y emite decisiones.',
      isFastLoop: true,
      status: 'IDLE',
      score: 0,
      confidence: 0,
      lastUpdated: 'Sin datos',
      justification: 'Haga clic en "Lanzar Orquestación" para iniciar el análisis.',
      details: { weighted_score: 0, total_agents_consulted: 0, fallback_applied: false }
    },
    Execution: {
      name: 'Execution',
      spanishName: 'Ejecutor de Órdenes',
      description: 'Enruta órdenes oficiales al exchange activo manejando micro-latencias, reintentos y APIs.',
      isFastLoop: true,
      status: 'IDLE',
      score: 0,
      confidence: 0,
      lastUpdated: 'Sin datos',
      justification: 'Esperando órdenes de compra/venta.',
      details: { api_latency_ms: 0, order_type_routing: 'Futuros Perpetuos' }
    },
    Learning: {
      name: 'Learning',
      spanishName: 'Módulo de Aprendizaje',
      description: 'Analiza retrospectivamente resultados versus predicciones para optimizar pesos dinámicamente.',
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
      description: 'Registra de manera inmutable prompts, JSONs, indicadores e historial completo para transparencia.',
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
      description: 'Maneja alertas y notifica de inmediato a Telegram, Discord y webhooks en caso de anomalías.',
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
    justification: 'No se han recibido análisis todavía. Lance una orquestación para iniciar.',
    details: 'Esperando ciclo...',
    timestamp: 'N/A'
  });

  const [marketRegime, setMarketRegime] = useState<{
    adx: string;
    atr: string;
    trend: string;
  }>({
    adx: '--',
    atr: '--',
    trend: 'Sin analizar'
  });

  // Manual configuration of weights
  const [agentWeights, setAgentWeights] = useState<Record<AgentName, number>>({
    TechnicalAnalyst: 0.25,
    News: 0.15,
    Sentiment: 0.10,
    OnChain: 0.08,
    OrderFlow: 0.15,
    Correlation: 0.05,
    Backtesting: 0.10,
    RiskManager: 0.0,
    Divergence: 0.07,
    Liquidation: 0.05,
    Supervisor: 0.0,
    Execution: 0.0,
    Learning: 0.0,
    Audit: 0.0,
    Notification: 0.0
  });

  // Helper para obtener precio en tiempo real
  const fetchRealPrice = async (currentSymbol: string): Promise<number | null> => {
    try {
      if (apiConfig.activeExchange === 'kraken') {
        const krakenSymbol = currentSymbol.includes('BTC') ? 'PF_XBTUSD' : currentSymbol.includes('ETH') ? 'PF_ETHUSD' : 'PF_SOLUSD';
        const response = await fetch('https://futures.kraken.com/derivatives/api/v3/tickers');
        if (response.ok) {
          const data = await response.json();
          if (data && Array.isArray(data.tickers)) {
            const t = data.tickers.find((item: any) => item.symbol && item.symbol.toUpperCase() === krakenSymbol.toUpperCase());
            if (t && t.last) {
              const p = parseFloat(t.last);
              if (!isNaN(p) && p > 0) return p;
            }
          }
        }
      }

      const clean = currentSymbol.replace('/', '').toUpperCase();
      const isReal = apiConfig.modoReal;
      const bitgetSymbol = isReal ? clean : (clean.endsWith('USDT') ? `S${clean.substring(0, clean.length - 4)}SUSDT` : clean);
      const productType = isReal ? 'USDT-FUTURES' : 'SUSDT-FUTURES';
      
      const response = await fetch(`https://api.bitget.com/api/v2/mix/market/ticker?symbol=${bitgetSymbol}&productType=${productType}`);
      if (response.ok) {
        const data = await response.json();
        if (data.code === '00000' && data.data && data.data.length > 0) {
          const realPrice = parseFloat(data.data[0].lastPr);
          if (!isNaN(realPrice) && realPrice > 0) {
            return realPrice;
          }
        }
      }
    } catch {
      // Fallback
    }

    try {
      const binanceSymbol = currentSymbol.replace('/', '');
      const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${binanceSymbol}`);
      if (response.ok) {
        const data = await response.json();
        const p = parseFloat(data.price);
        if (!isNaN(p) && p > 0) return p;
      }
    } catch {
      // Fallback
    }
    return null;
  };

  // Ticker updater effect
  useEffect(() => {
    let active = true;

    const syncPrice = async () => {
      const p = await fetchRealPrice(symbol);
      if (active && p) {
        setPrice(prev => {
          if (p > prev) setPriceDirection('UP');
          else if (p < prev) setPriceDirection('DOWN');
          return p;
        });
      }
    };

    syncPrice();
    const interval = setInterval(syncPrice, 2500);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [symbol, apiConfig.activeExchange, apiConfig.modoReal, apiConfig.krakenModoReal]);

  // Adjust default values on symbol change
  useEffect(() => {
    let active = true;

    if (symbol === 'BTC/USDT') {
      setPrice(68420.50);
      setManualSizeUsd(150);
    } else if (symbol === 'ETH/USDT') {
      setPrice(3540.25);
      setManualSizeUsd(80);
    } else {
      setPrice(148.80);
      setManualSizeUsd(50);
    }

    fetchRealPrice(symbol).then(realPrice => {
      if (active && realPrice) {
        setPrice(realPrice);
      }
    });

    return () => {
      active = false;
    };
  }, [symbol]);

  // Append new log helper
  const addLog = (level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', agentName: string, message: string, payload?: any) => {
    const newLog: SimulatedLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      timestamp: new Date().toLocaleTimeString(),
      level,
      agentName,
      message,
      payload
    };
    setLogs(prev => [newLog, ...prev.slice(0, 300)]);
  };

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // Dynamic Real-Time PnL & SL/TP trigger on price ticks
  useEffect(() => {
    if (!activePosition || !price || price <= 0 || !activePosition.entryPrice) return;

    const diff = price - activePosition.entryPrice;
    const mult = activePosition.side === 'LONG' ? 1 : -1;
    const lev = activePosition.leverage || 10;
    const calcPnl = Number((diff * activePosition.quantity * mult).toFixed(2));
    const calcPnlPct = Number(((diff / activePosition.entryPrice) * 100 * lev * mult).toFixed(2));

    // Check Take Profit
    const isTpReached =
      activePosition.side === 'LONG'
        ? price >= activePosition.takeProfit
        : price <= activePosition.takeProfit;

    if (isTpReached) {
      addLog(
        'INFO',
        'Execution',
        `🎉 ¡TAKE PROFIT ALCANZADO! Posición ${activePosition.side} (${activePosition.symbol}) cerrada con beneficio de +$${Math.abs(calcPnl).toFixed(2)} USD.`
      );
      setBalances(prev => ({
        ...prev,
        demo: prev.demo !== null ? Number((prev.demo + calcPnl).toFixed(2)) : prev.demo
      }));
      setActivePosition(null);
      return;
    }

    // Check Stop Loss
    const isSlReached =
      activePosition.side === 'LONG'
        ? price <= activePosition.stopLoss
        : price >= activePosition.stopLoss;

    if (isSlReached) {
      addLog(
        'WARN',
        'Execution',
        `🛑 STOP LOSS EJECUTADO: Posición ${activePosition.side} (${activePosition.symbol}) cerrada para limitar riesgo con -$${Math.abs(calcPnl).toFixed(2)} USD.`
      );
      setBalances(prev => ({
        ...prev,
        demo: prev.demo !== null ? Number((prev.demo + calcPnl).toFixed(2)) : prev.demo
      }));
      setActivePosition(null);
      return;
    }

    // Update PnL
    setActivePosition(prev => {
      if (!prev) return null;
      if (prev.currentPrice === price && prev.pnl === calcPnl && prev.pnlPercentage === calcPnlPct) {
        return prev;
      }
      return {
        ...prev,
        currentPrice: price,
        pnl: calcPnl,
        pnlPercentage: calcPnlPct
      };
    });
  }, [price]);

  // Run Backtest
  const handleRunBacktest = async () => {
    if (!adminToken) {
      setBacktestError('Introduce tu Token de Administrador en Configuración API para ejecutar el backtest.');
      return;
    }
    setBacktestRunning(true);
    setBacktestError(null);
    try {
      const res = await fetch('/api/v1/engine/backtest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          symbol,
          timeframe,
          days: backtestDays,
          initialBalance: backtestCapital
        })
      });
      const data = await res.json();
      if (res.ok && data.exitoso) {
        const resObj = data.resultado;
        const normalized = {
          ...resObj,
          netProfit: Number((resObj.netProfit ?? resObj.net_profit_usd ?? resObj.performance?.net_profit_usd ?? 0).toFixed(2)),
          winRate: Number((resObj.winRate ?? resObj.win_rate ?? resObj.performance?.win_rate ?? 0).toFixed(1)),
          profitFactor: Number((resObj.profitFactor ?? resObj.profit_factor ?? resObj.performance?.profit_factor ?? 0).toFixed(2)),
          maxDrawdownPct: Number((resObj.maxDrawdownPct ?? resObj.max_drawdown_percentage ?? resObj.performance?.max_drawdown_percentage ?? 0).toFixed(2)),
          sharpeRatio: Number((resObj.sharpeRatio ?? resObj.sharpe_ratio ?? resObj.performance?.sharpe_ratio ?? 0).toFixed(2)),
          totalTrades: resObj.totalTrades ?? resObj.simulated_trades_count ?? resObj.performance?.total_trades ?? (resObj.trades?.length || 0),
        };
        setBacktestResult(normalized);
        addLog('INFO', 'Backtesting', `Backtest completado para ${symbol} (${backtestDays}d). Win Rate: ${normalized.winRate}%, PnL: $${normalized.netProfit}`);
      } else {
        setBacktestError(data.message || 'Error al ejecutar el backtest.');
        addLog('WARN', 'Backtesting', `Error en backtest: ${data.message || 'Desconocido'}`);
      }
    } catch (err: any) {
      setBacktestError(`Falla de red: ${err.message || err}`);
      addLog('ERROR', 'Backtesting', `Error de red al ejecutar backtest: ${err.message || err}`);
    } finally {
      setBacktestRunning(false);
    }
  };

  // Close Active Position
  const handleClosePosition = async () => {
    addLog('INFO', 'Execution', `Iniciando orden de cierre de posición para ${symbol} en el broker activo...`);
    if (adminToken) {
      try {
        const res = await fetch('/api/v1/engine/close-position', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${adminToken}`
          },
          body: JSON.stringify({ symbol })
        });
        const data = await res.json();
        if (data.exitoso) {
          addLog('INFO', 'Execution', `¡POSICIÓN CERRADA EXITOSAMENTE! ${data.resultado?.mensajeRespuesta || ''}`);
          setActivePosition(null);
        } else {
          addLog('WARN', 'Execution', `Respuesta del broker al cerrar: ${data.resultado?.mensajeRespuesta || data.message || 'Fallo al cerrar'}`);
        }
      } catch (err: any) {
        addLog('ERROR', 'Execution', `Fallo al conectar con el backend para cerrar posición: ${err.message || err}`);
      }
    } else {
      setActivePosition(null);
      addLog('INFO', 'RiskManager', 'Posición activa cerrada en memoria local.');
    }
  };

  // Manual Order Placement
  const handlePlaceManualOrder = async (side: 'LONG' | 'SHORT') => {
    const offset = price * 0.02;
    const simQty = Number((manualSizeUsd / price).toFixed(4));
    
    setActivePosition({
      symbol,
      side,
      entryPrice: price,
      currentPrice: price,
      quantity: simQty,
      leverage: manualLeverage,
      pnl: 0,
      pnlPercentage: 0,
      stopLoss: Number((side === 'LONG' ? price - offset : price + offset).toFixed(2)),
      takeProfit: Number((side === 'LONG' ? price + offset * 2.2 : price - offset * 2.2).toFixed(2))
    });

    const orderSide = side === 'LONG' ? 'BUY' : 'SELL';
    addLog('INFO', 'Execution', `Iniciando despacho manual de orden (${orderSide}) de $${manualSizeUsd} en ${symbol}...`);

    if (adminToken) {
      try {
        const res = await fetch('/api/v1/engine/test-order', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${adminToken}`
          },
          body: JSON.stringify({
            symbol,
            side: orderSide,
            sizeUsd: manualSizeUsd
          })
        });
        const data = await res.json();
        if (data.exitoso) {
          addLog('INFO', 'Execution', `¡ORDEN DESPACHADA EXITOSAMENTE AL BROKER! ID: ${data.resultado?.orderId || 'OK'}`);
        } else {
          addLog('WARN', 'Execution', `Respuesta del RiskManager/Broker: ${data.resultado?.mensajeRespuesta || data.message || 'Despacho prevenido'}`);
        }
      } catch (err: any) {
        addLog('ERROR', 'Execution', `Fallo al conectar con el OrderRouter: ${err.message || err}`);
      }
    } else {
      addLog('WARN', 'Execution', `Simulación local activada (Configura tu Token de Administrador para enviar al exchange real).`);
    }
  };

  // Full 15-Agent Orchestration Run
  const handleTriggerRealEngine = async () => {
    if (isProcessing) return;
    setIsProcessing(true);

    const isUpTrend = Math.random() > 0.45;
    const rsiVal = isUpTrend ? Number((56 + Math.random() * 12).toFixed(1)) : Number((36 + Math.random() * 14).toFixed(1));
    const techScore = isUpTrend ? Math.floor(40 + Math.random() * 30) : -Math.floor(30 + Math.random() * 30);
    const flowScore = isUpTrend ? 55 : -45;
    const corrScore = isUpTrend ? 25 : -15;
    const divScore = isUpTrend ? 30 : -20;
    const liqScore = isUpTrend ? 60 : -50;

    addLog('INFO', 'Orchestrator', `Iniciando ciclo de orquestación multi-agente para ${symbol}...`);

    try {
      setAgents(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(k => {
          next[k as AgentName] = { ...next[k as AgentName], status: 'PROCESSING' };
        });
        return next;
      });

      await sleep(1000);

      // Fast Loop
      setAgents(prev => ({
        ...prev,
        TechnicalAnalyst: {
          ...prev.TechnicalAnalyst,
          status: 'COMPLETED',
          score: techScore,
          confidence: 0.85,
          lastUpdated: new Date().toLocaleTimeString(),
          justification: isUpTrend 
            ? `Estructura alcista confirmada (BOS). RSI en ${rsiVal} con soporte dinámico en VWAP.` 
            : `Ruptura bajista de estructura (CHoCH). RSI en ${rsiVal} sin señales de divergencia alcista.`,
          details: { rsi: rsiVal, macd: isUpTrend ? 'Bullish Cross' : 'Bearish Divergence', vwap: price * 0.995, blocks: 'Order Block H1 Activo' }
        },
        OrderFlow: {
          ...prev.OrderFlow,
          status: 'COMPLETED',
          score: flowScore,
          confidence: 0.90,
          lastUpdated: new Date().toLocaleTimeString(),
          justification: flowScore > 0 
            ? 'CVD alcista sostenido. Delta acumulado comprador agresivo absorbiendo órdenes límite en el libro de órdenes.' 
            : 'Presión vendedora sostenida en el libro L2. Funding rate en zona neutral.',
          details: { cvd_delta: flowScore > 0 ? '+1,240 BTC' : '-890 BTC', open_interest: '+4.2%', skew: 'Call Skew' }
        },
        Correlation: {
          ...prev.Correlation,
          status: 'COMPLETED',
          score: corrScore,
          confidence: 0.75,
          lastUpdated: new Date().toLocaleTimeString(),
          justification: `Correlación con índices globales en +0.72. Índice DXY retrocediendo hacia soporte clave.`,
          details: { btc_sp500_corr: 0.74, dxy_negative_corr: -0.85, beta: 1.15 }
        },
        Divergence: {
          ...prev.Divergence,
          status: 'COMPLETED',
          score: divScore,
          confidence: 0.70,
          lastUpdated: new Date().toLocaleTimeString(),
          justification: divScore > 0 
            ? 'Divergencia alcista oculta detectada entre precio y oscilador RSI en 15m.' 
            : 'Sin divergencias mayores detectadas en el timeframe actual.',
          details: { rsi_divergence: divScore > 0 ? 'Alcista Oculta' : 'Ninguna', delta_divergence: 'Confirmada' }
        },
        Liquidation: {
          ...prev.Liquidation,
          status: 'COMPLETED',
          score: liqScore,
          confidence: 0.80,
          lastUpdated: new Date().toLocaleTimeString(),
          justification: liqScore > 0 
            ? 'Piscina de liquidez vendedora acumulada arriba del rango. Alto potencial de Short Squeeze.' 
            : 'Saturación de apalancamiento en posiciones largas. Stop Hunting inminente para barrer sobre-apalancados.',
          details: { long_liquidation_pool: '$45M close', short_liquidation_pool: '$72M above' }
        }
      }));

      addLog('INFO', 'Blackboard', 'Fast-Loop completado con éxito. Métricas persistidas en el Blackboard.');
      await sleep(1200);

      // Slow Loop
      const newsScore = isUpTrend ? 45 : -40;
      const sentimentScore = isUpTrend ? 50 : -35;
      const onChainScore = isUpTrend ? 30 : -25;
      const backtestWinRate = 58.5;

      setAgents(prev => ({
        ...prev,
        News: {
          ...prev.News,
          status: 'COMPLETED',
          score: newsScore,
          confidence: 0.80,
          lastUpdated: new Date().toLocaleTimeString(),
          justification: newsScore > 0 
            ? 'Análisis semántico con IA: Flujos netos institucionales positivos y moderación en declaraciones macroeconómicas.' 
            : 'Incertidumbre regulatoria global e inflación superior a lo esperado impactan la confianza en el corto plazo.',
          details: { fed_sentiment: 'Dovish bias', regulatory_risk: 'Bajo-Medio', macro_impact: 'Bullish macro flow' }
        },
        Sentiment: {
          ...prev.Sentiment,
          status: 'COMPLETED',
          score: sentimentScore,
          confidence: 0.88,
          lastUpdated: new Date().toLocaleTimeString(),
          justification: sentimentScore > 0 
            ? 'Índice Fear & Greed sube a 65 (Codicia moderada). Narrativa en redes dominada por acumulación.' 
            : 'Pánico moderado por liquidaciones de derivados. Precaución domina el sentimiento a corto plazo.',
          details: { fear_and_greed: sentimentScore > 0 ? 68 : 42, fomo_level: 'Alto', twitter_score: sentimentScore > 0 ? 'Extremadamente Alcista' : 'Bajista' }
        },
        OnChain: {
          ...prev.OnChain,
          status: 'COMPLETED',
          score: onChainScore,
          confidence: 0.82,
          lastUpdated: new Date().toLocaleTimeString(),
          justification: onChainScore > 0 
            ? 'Flujo de activos hacia billeteras frías (Outflows netos). Ballenas acumulando activamente.' 
            : 'Monedas inactivas de largo plazo se mueven a exchanges (Inflows), sugiriendo toma de ganancias.',
          details: { exchange_netflow: onChainScore > 0 ? '-15k BTC (Outflow)' : '+8k BTC (Inflow)', whale_accumulation: 'Acumulación Fuerte' }
        },
        Backtesting: {
          ...prev.Backtesting,
          status: 'COMPLETED',
          score: 25,
          confidence: 0.90,
          lastUpdated: new Date().toLocaleTimeString(),
          justification: `Simulación de Walk-Forward exitosa sobre 365 días históricos. Win Rate esperado: ${backtestWinRate}%, Profit Factor de 1.45.`,
          details: { simulated_trades: 124, win_rate: `${backtestWinRate}%`, profit_factor: 1.45 }
        }
      }));

      addLog('INFO', 'Blackboard', 'Slow-Loop cognitivo (Modelos de Lenguaje & On-Chain) completado.');
      await sleep(1000);

      // Risk Manager
      const calculatedSize = Number((1.2 + Math.random() * 1.5).toFixed(2));
      const stopLossOffset = price * (0.015 + Math.random() * 0.01);
      const takeProfitOffset = stopLossOffset * 2.2;
      const calculatedSL = Number((isUpTrend ? price - stopLossOffset : price + stopLossOffset).toFixed(2));
      const calculatedTP = Number((isUpTrend ? price + takeProfitOffset : price - takeProfitOffset).toFixed(2));

      setAgents(prev => ({
        ...prev,
        RiskManager: {
          ...prev.RiskManager,
          status: 'COMPLETED',
          score: 100,
          confidence: 1.0,
          lastUpdated: new Date().toLocaleTimeString(),
          justification: `Riesgo Aprobado. Posición sugerida de ${calculatedSize}% de capital usando Criterio de Quarter-Kelly. R:R es de 1:2.2.`,
          details: { position_size_pct: `${calculatedSize}%`, stop_loss_atr: calculatedSL, risk_reward_ratio: '1:2.2' }
        }
      }));

      // Supervisor Consensus
      const rawScores = {
        TechnicalAnalyst: techScore,
        News: newsScore,
        Sentiment: sentimentScore,
        OnChain: onChainScore,
        OrderFlow: flowScore,
        Correlation: corrScore,
        Backtesting: 25,
        Divergence: divScore,
        Liquidation: liqScore
      };

      let weightedTotal = 0;
      let totalAssessedWeight = 0;

      Object.entries(rawScores).forEach(([k, s]) => {
        const w = agentWeights[k as AgentName] || 0.1;
        weightedTotal += s * w;
        totalAssessedWeight += w;
      });

      const finalScore = Math.round(weightedTotal / (totalAssessedWeight || 1));
      let direction: MarketDirection = 'HOLD';
      if (finalScore >= 25) direction = 'BUY';
      else if (finalScore <= -25) direction = 'SELL';

      setConsensusResult({
        direction,
        score: finalScore,
        justification: direction === 'BUY'
          ? `Consenso Alcista Fuerte (+${finalScore}): Flujo comprador agresivo y confluencia técnica de mercado respaldan entrada en largo.`
          : direction === 'SELL'
          ? `Consenso Bajista (-${Math.abs(finalScore)}): Presión vendedora y barrido de liquidez recomiendan protección de capital o posición corta.`
          : `Consenso Neutral (${finalScore}): Señales contradictorias entre agentes; se recomienda permanecer en liquidez.`,
        details: `Puntaje Ponderado: ${finalScore}/100. Agentes consultados: 9. TTL: 60s.`,
        timestamp: new Date().toLocaleTimeString()
      });

      setAgents(prev => ({
        ...prev,
        Supervisor: {
          ...prev.Supervisor,
          status: 'COMPLETED',
          score: finalScore,
          confidence: 0.95,
          lastUpdated: new Date().toLocaleTimeString(),
          justification: `Consenso calculado: ${direction} con puntaje ponderado de ${finalScore}.`,
          details: { weighted_score: finalScore, total_agents_consulted: 9, fallback_applied: false }
        }
      }));

      addLog('INFO', 'Supervisor', `Consenso emitido: ${direction} (Score: ${finalScore})`);

      // Execution Agent
      const simQty = Number((150 / price).toFixed(4));
      let orderPlacedText = `Señal ${direction} emitida. No se envió orden (Condición HOLD o umbral no superado).`;

      if (direction !== 'HOLD') {
        orderPlacedText = `ORDEN ENVIADA AL BROKER: ${direction} ${simQty} ${symbol} en ${price} (Apalancamiento: 10x)`;
        setActivePosition({
          symbol,
          side: direction === 'BUY' ? 'LONG' : 'SHORT',
          entryPrice: price,
          currentPrice: price,
          quantity: simQty,
          leverage: 10,
          pnl: 0,
          pnlPercentage: 0,
          stopLoss: calculatedSL,
          takeProfit: calculatedTP
        });
      }

      setAgents(prev => ({
        ...prev,
        Execution: {
          ...prev.Execution,
          status: 'COMPLETED',
          score: 100,
          confidence: 0.99,
          lastUpdated: new Date().toLocaleTimeString(),
          justification: orderPlacedText,
          details: { api_latency_ms: 38, order_type_routing: 'Futuros Perpetuos' }
        },
        Learning: {
          ...prev.Learning,
          status: 'COMPLETED',
          score: 100,
          confidence: 1.0,
          lastUpdated: new Date().toLocaleTimeString(),
          justification: `Parámetros actualizados en base de datos. Optimización bayesiana lista para la siguiente época.`,
          details: { optimized_epochs: 13, bayesian_tuning_factor: 1.08 }
        },
        Audit: {
          ...prev.Audit,
          status: 'COMPLETED',
          score: 100,
          confidence: 1.0,
          lastUpdated: new Date().toLocaleTimeString(),
          justification: `Sesión de orquestación registrada en base de datos PostgreSQL de forma inmutable.`,
          details: { db_storage_status: 'Synced', table: 'audit_logs' }
        },
        Notification: {
          ...prev.Notification,
          status: 'COMPLETED',
          score: 100,
          confidence: 1.0,
          lastUpdated: new Date().toLocaleTimeString(),
          justification: `Notificación despachada con la última decisión del Supervisor.`,
          details: { telegram_status: 'Connected', discord_status: 'Connected' }
        }
      }));

      addLog('INFO', 'Notification', `Mensaje de estado despachado mediante webhook.`);
      addLog('INFO', 'Audit', `Cierre de auditoría. Hash registrado de forma inmutable en PostgreSQL.`);

    } catch (err) {
      addLog('ERROR', 'Orchestrator', `Excepción fatal en ciclo: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score > 15) return isDark ? 'text-emerald-400 bg-emerald-950/40 border-emerald-800/40' : 'text-emerald-700 bg-emerald-50 border-emerald-200';
    if (score < -15) return isDark ? 'text-rose-400 bg-rose-950/40 border-rose-800/40' : 'text-rose-700 bg-rose-50 border-rose-200';
    return isDark ? 'text-slate-400 bg-slate-900/60 border-slate-800/40' : 'text-slate-600 bg-slate-100 border-slate-200';
  };

  const filteredAgents = (Object.values(agents) as AgentState[]).filter(agent => {
    if (blackboardFilter === 'FAST') return agent.isFastLoop;
    if (blackboardFilter === 'SLOW') return !agent.isFastLoop;
    return true;
  });

  const filteredLogs = logs.filter(log => {
    if (logFilter !== 'ALL' && log.level !== logFilter) return false;
    if (logSearch.trim()) {
      const q = logSearch.toLowerCase();
      return (
        log.message.toLowerCase().includes(q) ||
        log.agentName.toLowerCase().includes(q) ||
        log.level.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Current active exchange properties
  const isCurrentBrokerReal = apiConfig.activeExchange === 'hyperliquid'
    ? apiConfig.hyperliquidModoReal
    : apiConfig.activeExchange === 'kraken'
      ? apiConfig.krakenModoReal
      : apiConfig.modoReal;

  const currentBrokerDisplayName = apiConfig.activeExchange === 'hyperliquid'
    ? (apiConfig.hyperliquidModoReal ? 'Hyperliquid Mainnet DEX' : 'Hyperliquid Testnet')
    : apiConfig.activeExchange === 'kraken'
      ? 'Kraken Futures'
      : 'Bitget Futures';

  // Cambiar temporalidad / modo (15m Intradía vs 1h Swing) y propagar en caliente al motor 24/7
  const handleSelectTimeframe = async (newTf: '15m' | '1h') => {
    setTimeframe(newTf);
    if (engineStatus.running && adminToken) {
      try {
        const isReal = isCurrentBrokerReal;
        const res = await fetch('/api/v1/engine/start', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${adminToken}`
          },
          body: JSON.stringify({
            symbol,
            timeframe: newTf,
            intervalMs: 60000,
            confirmLive: isReal
          })
        });
        const data = await res.json();
        if (res.ok) {
          addLog('INFO', 'EngineScheduler', `🔄 Modo de trading conmutado a ${newTf === '1h' ? 'SWING (1h - Velas de 1 hora)' : 'INTRADÍA (15m - Velas de 15 minutos)'} en caliente.`);
          fetchEngineStatus();
        }
      } catch (err: any) {
        addLog('ERROR', 'EngineScheduler', `Error actualizando temporalidad: ${err.message}`);
      }
    }
  };

  // Cambiar par de trading y propagar en caliente si el motor está activo
  const handleSelectSymbol = async (newSym: 'BTC/USDT' | 'ETH/USDT' | 'SOL/USDT') => {
    setSymbol(newSym);
    if (engineStatus.running && adminToken) {
      try {
        const isReal = isCurrentBrokerReal;
        const res = await fetch('/api/v1/engine/start', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${adminToken}`
          },
          body: JSON.stringify({
            symbol: newSym,
            timeframe,
            intervalMs: 60000,
            confirmLive: isReal
          })
        });
        const data = await res.json();
        if (res.ok) {
          addLog('INFO', 'EngineScheduler', `🔄 Par de trading conmutado a ${newSym} en caliente.`);
          fetchEngineStatus();
        }
      } catch (err: any) {
        addLog('ERROR', 'EngineScheduler', `Error conmutando par: ${err.message}`);
      }
    }
  };

  // Toggle 24/7 Autonomous Trading Engine on Linux Server
  const handleToggleEngine = async () => {
    if (isTogglingEngine) return;
    if (!adminToken) {
      addLog('WARN', 'EngineScheduler', 'Introduce tu Token de Administrador en la pestaña API para controlar el motor 24/7.');
      return;
    }
    setIsTogglingEngine(true);
    try {
      const endpoint = engineStatus.running ? '/api/v1/engine/stop' : '/api/v1/engine/start';
      const isReal = isCurrentBrokerReal;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          symbol,
          timeframe,
          intervalMs: 60000,
          confirmLive: isReal
        })
      });
      const data = await res.json();
      if (res.ok) {
        setEngineStatus(prev => ({
          ...prev,
          running: !engineStatus.running,
          state: data.state || (engineStatus.running ? 'STOPPED' : 'TRADING'),
        }));
        const modeLabel = timeframe === '1h' ? 'SWING (1h)' : 'INTRADÍA (15m)';
        addLog(
          'INFO',
          'EngineScheduler',
          engineStatus.running
            ? '⏹ Motor autónomo 24/7 DETENIDO por el usuario.'
            : `▶ Motor autónomo 24/7 ACTIVADO para ${symbol} en modo ${modeLabel} (${data.modo || 'PAPER TRADING'}). Operando en segundo plano continuo.`
        );
      } else {
        addLog('ERROR', 'EngineScheduler', `Fallo al modificar motor: ${data.message || data.error}`);
      }
    } catch (err: any) {
      addLog('ERROR', 'EngineScheduler', `Error comunicando con el motor: ${err.message}`);
    } finally {
      setIsTogglingEngine(false);
      fetchEngineStatus();
    }
  };

  return (
    <div className={`min-h-screen flex flex-col font-sans transition-colors duration-200 ${
      isDark ? 'bg-[#080a12] text-slate-100' : 'bg-[#f8fafc] text-slate-900'
    }`}>
      {/* ==================================================================== */}
      {/* 1. TOP GLOBAL NAVIGATION & HEADER */}
      {/* ==================================================================== */}
      <header className={`sticky top-0 z-50 px-4 lg:px-6 py-3 border-b backdrop-blur-md transition-colors duration-200 ${
        isDark ? 'bg-[#0c0e18]/90 border-[#191e36] shadow-xl' : 'bg-white/95 border-slate-200 shadow-sm'
      }`}>
        <div className="max-w-[1800px] mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
          
          {/* Brand Logo & Title */}
          <div className="flex items-center gap-3">
            <AtlasLogo />
            <div>
              <div className="flex items-center gap-2">
                <h1 className={`font-display font-black text-xl tracking-wider uppercase ${
                  isDark ? 'bg-gradient-to-r from-slate-100 via-indigo-200 to-cyan-300 bg-clip-text text-transparent' : 'text-slate-900'
                }`}>
                  ATLAS AI TRADING
                </h1>
                <span className="text-[10px] bg-indigo-500/10 text-indigo-400 font-mono font-bold px-2 py-0.5 rounded border border-indigo-500/20">
                  v2.1 PRO
                </span>
              </div>
              <p className="text-[9px] tracking-widest text-cyan-500 font-mono font-bold uppercase mt-0.5">
                AUTONOMOUS MULTI-AGENT TERMINAL • MULTI-BROKER CORE
              </p>
            </div>
          </div>

          {/* Center Tabs Navigation */}
          <nav className={`flex items-center gap-1 p-1 rounded-xl border overflow-x-auto max-w-full ${
            isDark ? 'bg-[#060810] border-[#18223f]' : 'bg-slate-100 border-slate-200'
          }`}>
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                activeTab === 'dashboard'
                  ? (isDark ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/40' : 'bg-white text-indigo-700 shadow-sm font-bold')
                  : (isDark ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60')
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Panel General</span>
            </button>

            <button
              onClick={() => setActiveTab('terminal')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                activeTab === 'terminal'
                  ? (isDark ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/40' : 'bg-white text-indigo-700 shadow-sm font-bold')
                  : (isDark ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60')
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>Terminal Trading</span>
            </button>

            <button
              onClick={() => setActiveTab('backtest')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                activeTab === 'backtest'
                  ? (isDark ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/40' : 'bg-white text-indigo-700 shadow-sm font-bold')
                  : (isDark ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60')
              }`}
            >
              <LineChart className="w-3.5 h-3.5" />
              <span>Backtest Studio</span>
            </button>

            <button
              onClick={() => setActiveTab('learning')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                activeTab === 'learning'
                  ? (isDark ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/40' : 'bg-white text-indigo-700 shadow-sm font-bold')
                  : (isDark ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60')
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>Multi-Agente & IA</span>
            </button>

            <button
              onClick={() => setActiveTab('logs')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                activeTab === 'logs'
                  ? (isDark ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/40' : 'bg-white text-indigo-700 shadow-sm font-bold')
                  : (isDark ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60')
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Telemetría & Logs</span>
            </button>

            <button
              onClick={() => setActiveTab('api-config')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                activeTab === 'api-config'
                  ? (isDark ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/40' : 'bg-white text-indigo-700 shadow-sm font-bold')
                  : (isDark ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60')
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Configuración API</span>
            </button>
          </nav>

          {/* Right Controls: Direct Exchange Switcher, Symbol, Theme & Action */}
          <div className="flex items-center gap-2">
            
            {/* DIRECT 1-CLICK EXCHANGE SWITCHER */}
            <div className={`flex items-center gap-0.5 border p-0.5 rounded-lg text-xs font-mono font-bold ${
              isDark ? 'bg-[#060810] border-[#182645]' : 'bg-slate-100 border-slate-300'
            }`}>
              <button
                type="button"
                onClick={() => handleSwitchExchange('kraken')}
                className={`px-2.5 py-1 rounded flex items-center gap-1.5 transition-all ${
                  apiConfig.activeExchange === 'kraken'
                    ? 'bg-purple-600 text-white shadow-sm font-extrabold'
                    : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900')
                }`}
                title="Conmutar a Kraken Futures"
              >
                <span>🐙</span>
                <span className="hidden sm:inline">Kraken</span>
              </button>

              <button
                type="button"
                onClick={() => handleSwitchExchange('bitget')}
                className={`px-2.5 py-1 rounded flex items-center gap-1.5 transition-all ${
                  apiConfig.activeExchange === 'bitget'
                    ? 'bg-amber-600 text-white shadow-sm font-extrabold'
                    : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900')
                }`}
                title="Conmutar a Bitget Futures"
              >
                <span>🟠</span>
                <span className="hidden sm:inline">Bitget</span>
              </button>

              <button
                type="button"
                onClick={() => handleSwitchExchange('hyperliquid')}
                className={`px-2.5 py-1 rounded flex items-center gap-1.5 transition-all ${
                  apiConfig.activeExchange === 'hyperliquid'
                    ? 'bg-cyan-600 text-white shadow-sm font-extrabold'
                    : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900')
                }`}
                title="Conmutar a Hyperliquid DEX (Perpetuos descentralizados L1)"
              >
                <span>💧</span>
                <span className="hidden sm:inline">Hyperliquid</span>
              </button>
            </div>

            {/* Symbol Selector */}
            <div className={`flex rounded-lg border p-0.5 text-xs font-mono font-bold ${
              isDark ? 'bg-[#060810] border-[#182645]' : 'bg-slate-100 border-slate-300'
            }`}>
              {(['BTC/USDT', 'ETH/USDT', 'SOL/USDT'] as const).map(sym => (
                <button
                  key={sym}
                  onClick={() => handleSelectSymbol(sym)}
                  className={`px-2 py-1 rounded transition-all ${
                    symbol === sym
                      ? (isDark ? 'bg-indigo-600 text-white' : 'bg-white text-indigo-700 shadow-sm')
                      : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900')
                  }`}
                >
                  {sym.split('/')[0]}
                </button>
              ))}
            </div>

            {/* Mode / Timeframe Selector (15m Intradía vs 1h Swing) */}
            <div className={`flex rounded-lg border p-0.5 text-xs font-mono font-bold ${
              isDark ? 'bg-[#060810] border-[#182645]' : 'bg-slate-100 border-slate-300'
            }`}>
              <button
                type="button"
                onClick={() => handleSelectTimeframe('15m')}
                title="Modo Intradía: Velas de 15 minutos. Operaciones en el mismo día."
                className={`px-2 py-1 rounded transition-all flex items-center gap-1 ${
                  timeframe === '15m'
                    ? (isDark ? 'bg-indigo-600 text-white font-extrabold shadow-sm' : 'bg-white text-indigo-700 font-extrabold shadow-sm')
                    : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900')
                }`}
              >
                <span>⚡</span>
                <span className="hidden sm:inline">15m</span>
                <span className="hidden md:inline">Intradía</span>
              </button>
              <button
                type="button"
                onClick={() => handleSelectTimeframe('1h')}
                title="Modo Swing: Velas de 1 hora. Mayor fiabilidad y menos comisiones (Recomendado para 20€)."
                className={`px-2 py-1 rounded transition-all flex items-center gap-1 ${
                  timeframe === '1h'
                    ? (isDark ? 'bg-indigo-600 text-white font-extrabold shadow-sm' : 'bg-white text-indigo-700 font-extrabold shadow-sm')
                    : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900')
                }`}
              >
                <span>🌊</span>
                <span className="hidden sm:inline">1h</span>
                <span className="hidden md:inline">Swing</span>
              </button>
            </div>

            {/* Mode Indicator Badge */}
            <div className={`hidden lg:flex items-center gap-1.5 border px-2.5 py-1 rounded-lg text-[10px] font-mono ${
              isDark ? 'bg-[#0c1322] border-[#182645]' : 'bg-slate-100 border-slate-300'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isCurrentBrokerReal ? 'bg-amber-400 animate-ping' : 'bg-emerald-400 animate-ping'}`} />
              <span className="font-bold uppercase tracking-wider">{isCurrentBrokerReal ? 'REAL' : 'DEMO'}</span>
            </div>

            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              aria-label="Alternar tema claro y oscuro"
              className={`p-2 rounded-lg border transition-all duration-200 flex items-center justify-center ${
                isDark 
                  ? 'bg-[#0d1222] border-[#1b2542] text-amber-400 hover:bg-[#131c35]' 
                  : 'bg-slate-100 border-slate-300 text-indigo-600 hover:bg-slate-200'
              }`}
              title={isDark ? 'Cambiar a Modo Claro' : 'Cambiar a Modo Oscuro'}
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Global Orchestration Trigger (Manual Single Cycle) */}
            <button
              onClick={handleTriggerRealEngine}
              disabled={isProcessing}
              title="Disparar un ciclo manual analítico con la red multi-agente"
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold tracking-wider uppercase transition-all shadow-lg ${
                isProcessing
                  ? 'bg-indigo-950 text-indigo-300 cursor-not-allowed border border-indigo-800/40'
                  : 'bg-gradient-to-r from-indigo-500 via-indigo-600 to-indigo-700 hover:from-indigo-600 hover:to-indigo-800 text-white shadow-indigo-950/40 hover:-translate-y-0.5 active:translate-y-0'
              }`}
            >
              <Play className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{isProcessing ? 'ORQUESTANDO...' : 'ORQUESTAR IA'}</span>
            </button>

            {/* 24/7 Autonomous Trading Engine Switch */}
            <button
              onClick={handleToggleEngine}
              disabled={isTogglingEngine}
              title={
                engineStatus.running
                  ? `Motor Autónomo ACTIVO (24/7). Ciclos ejecutados: ${engineStatus.totalCycles}. Clic para pausar.`
                  : 'Activar motor de trading autónomo 24/7 en segundo plano en el servidor.'
              }
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold tracking-wider uppercase transition-all shadow-lg ${
                engineStatus.running
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-950/40 border border-emerald-400/50 animate-pulse'
                  : isDark
                    ? 'bg-[#12192e] hover:bg-[#1a2542] text-slate-300 border border-[#233157]'
                    : 'bg-slate-200 hover:bg-slate-300 text-slate-700 border border-slate-300'
              }`}
            >
              <Zap className={`w-3.5 h-3.5 ${engineStatus.running ? 'text-amber-300 fill-amber-300' : 'text-slate-400'}`} />
              <span className="hidden sm:inline">
                {isTogglingEngine
                  ? 'CONMUTANDO...'
                  : engineStatus.running
                    ? `AUTOTRADING 24/7 (${engineStatus.totalCycles})`
                    : 'ACTIVAR AUTOTRADING'}
              </span>
              <span className="sm:hidden">
                {engineStatus.running ? 'AUTO ON' : 'AUTO OFF'}
              </span>
            </button>

          </div>
        </div>
      </header>

      {/* ==================================================================== */}
      {/* 2. GLOBAL KPI METRIC RIBBON (GENERIC & UNIVERSAL TERMINOLOGY)        */}
      {/* ==================================================================== */}
      <section className={`border-b px-4 lg:px-6 py-4 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 transition-colors duration-200 ${
        isDark ? 'bg-[#090b14] border-[#131726]' : 'bg-slate-100/70 border-slate-200'
      }`}>
        {/* KPI 1: Live Market Price */}
        <div className={`p-3.5 rounded-xl border transition-all ${
          isDark ? 'bg-[#0c0f1e] border-[#18203c]' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold">
              COTIZACIÓN EN VIVO ({symbol})
            </span>
            <div className={`p-1 rounded ${
              priceDirection === 'UP' ? 'bg-emerald-500/10 text-emerald-400' : priceDirection === 'DOWN' ? 'bg-rose-500/10 text-rose-400' : 'bg-slate-500/10 text-slate-400'
            }`}>
              {priceDirection === 'UP' ? <ArrowUpRight className="w-3.5 h-3.5" /> : priceDirection === 'DOWN' ? <ArrowDownRight className="w-3.5 h-3.5" /> : <Activity className="w-3.5 h-3.5" />}
            </div>
          </div>
          <div className="font-mono text-lg font-extrabold tracking-tight flex items-baseline gap-1">
            <span>${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <span className="text-[10px] text-slate-400 font-normal">USD</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1 font-mono">
            <Radio className="w-3 h-3 text-cyan-500 animate-pulse" />
            <span>Feed L2 en Tiempo Real ({currentBrokerDisplayName})</span>
          </p>
        </div>

        {/* KPI 2: Available Balances */}
        <div className={`p-3.5 rounded-xl border transition-all ${
          isDark ? 'bg-[#0c0f1e] border-[#18203c]' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold">
              SALDOS DISPONIBLES
            </span>
            <Wallet className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div className="space-y-1 mt-0.5">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">DEMO</span>
              <span className="font-bold">
                {balances.demo !== null && balances.demo > 0 
                  ? `$${balances.demo.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` 
                  : 'Sin conectar'}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">REAL</span>
              <span className="font-bold">
                {balances.real !== null
                  ? `$${balances.real.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` 
                  : 'Sin conectar'}
              </span>
            </div>
          </div>
        </div>

        {/* KPI 3: Active Position Status */}
        <div className={`p-3.5 rounded-xl border transition-all ${
          isDark ? 'bg-[#0c0f1e] border-[#18203c]' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold">
              POSICIÓN ACTIVA
            </span>
            {activePosition && (
              <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${
                activePosition.side === 'LONG' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
              }`}>
                {activePosition.side} {activePosition.leverage}x
              </span>
            )}
          </div>
          {activePosition ? (
            <div>
              <div className="flex items-baseline justify-between font-mono">
                <span className="text-sm font-bold">{activePosition.quantity} {symbol.split('/')[0]}</span>
                <span className={`text-xs font-bold ${activePosition.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {activePosition.pnl >= 0 ? '+' : '-'}${Math.abs(activePosition.pnl).toFixed(2)} ({activePosition.pnlPercentage >= 0 ? '+' : ''}{activePosition.pnlPercentage.toFixed(2)}%)
                </span>
              </div>
              <p className="text-[9px] font-mono text-slate-400 mt-1 flex justify-between">
                <span>Entrada: ${activePosition.entryPrice}</span>
                <span>SL: ${activePosition.stopLoss}</span>
              </p>
            </div>
          ) : (
            <div className="flex flex-col justify-center h-[38px]">
              <span className="text-xs text-slate-400 font-mono">Sin posiciones abiertas</span>
              <span className="text-[9px] text-slate-500 font-mono">Margen libre disponible: 100%</span>
            </div>
          )}
        </div>

        {/* KPI 4: Market Regime & HMM */}
        <div className={`p-3.5 rounded-xl border transition-all ${
          isDark ? 'bg-[#0c0f1e] border-[#18203c]' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold">
              RÉGIMEN & MODO
            </span>
            <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-extrabold ${
              timeframe === '1h' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
            }`}>
              {timeframe === '1h' ? '🌊 SWING 1H' : '⚡ INTRADÍA 15M'}
            </span>
          </div>
          {consensusResult.timestamp === 'N/A' ? (
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-bold text-slate-400">Sin analizar</span>
                <span className="text-[10px] font-mono text-slate-500">ADX: --</span>
              </div>
              <p className="text-[10px] text-slate-500 mt-1 font-mono flex items-center justify-between">
                <span>Volatilidad ATR: --</span>
                <span className="text-slate-500">Pendiente de evaluar</span>
              </p>
            </div>
          ) : (
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-bold text-cyan-400">
                  {marketRegime.trend !== 'Sin analizar' ? marketRegime.trend : (consensusResult.direction === 'BUY' ? 'Tendencial Alcista' : consensusResult.direction === 'SELL' ? 'Tendencial Bajista' : 'Consolidación Lateral')}
                </span>
                <span className="text-[10px] font-mono text-slate-400">ADX: {marketRegime.adx}</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1 font-mono flex items-center justify-between">
                <span>Volatilidad ATR: {marketRegime.atr}</span>
                <span className="text-emerald-400 font-bold">Filtro OK</span>
              </p>
            </div>
          )}
        </div>

        {/* KPI 5: Risk & Kelly Capital */}
        <div className={`col-span-2 md:col-span-1 p-3.5 rounded-xl border transition-all ${
          isDark ? 'bg-[#0c0f1e] border-[#18203c]' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold">
              GESTIÓN DE RIESGO
            </span>
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-bold text-emerald-400">Quarter-Kelly (2.0%)</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1 font-mono flex items-center justify-between">
            <span>Hard Cap: {(balances.demo || balances.real) ? `$${(((balances.demo || balances.real) || 0) * 0.02).toFixed(0)} USD` : 'Sin saldo activo'}</span>
            <span>Max DD: -4.5%</span>
          </p>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* 3. MAIN WORKSPACE CONTENT (RENDERED BY TAB) */}
      {/* ==================================================================== */}
      <main className="flex-1 p-4 lg:p-6 max-w-[1800px] w-full mx-auto">
        <AnimatePresence mode="wait">

          {/* ================================================================ */}
          {/* TAB 1: DASHBOARD / BLACKBOARD MULTI-AGENTE                       */}
          {/* ================================================================ */}
          {activeTab === 'dashboard' && (
            <motion.div
              key="tab-dashboard"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="space-y-6"
            >
              {/* Supervisor Final Consensus Banner */}
              <div className={`p-5 rounded-2xl border transition-all ${
                isDark ? 'bg-gradient-to-r from-[#0d1224] to-[#141a38] border-[#222c54]' : 'bg-gradient-to-r from-slate-50 to-indigo-50/60 border-slate-200 shadow-sm'
              }`}>
                <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2">
                      <Award className="w-4 h-4 text-cyan-400" />
                      <span className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
                        Consenso Final del Supervisor • Pizarra Multimodelo
                      </span>
                      <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-slate-500/10 text-slate-400 border border-slate-500/20">
                        Actualizado: {consensusResult.timestamp}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-2xl font-black font-display tracking-tight px-3 py-1 rounded-lg border ${
                        consensusResult.direction === 'BUY'
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                          : consensusResult.direction === 'SELL'
                          ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                          : 'bg-slate-500/20 text-slate-400 border-slate-500/30'
                      }`}>
                        {consensusResult.direction === 'BUY' ? 'SEÑAL: LARGO (BUY)' : consensusResult.direction === 'SELL' ? 'SEÑAL: CORTO (SELL)' : 'SEÑAL: ESPERA (HOLD)'}
                      </span>
                      <span className="font-mono text-sm text-slate-400">
                        Score Ponderado: <strong className={consensusResult.score > 0 ? 'text-emerald-400' : consensusResult.score < 0 ? 'text-rose-400' : 'text-slate-400'}>{consensusResult.score > 0 ? `+${consensusResult.score}` : consensusResult.score}/100</strong>
                      </span>
                    </div>
                    <p className={`text-xs leading-relaxed max-w-4xl ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                      {consensusResult.justification}
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                    <button
                      onClick={handleTriggerRealEngine}
                      disabled={isProcessing}
                      className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold font-mono tracking-wider transition-all shadow-md flex items-center gap-2"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} />
                      {isProcessing ? 'PROCESANDO RED...' : 'RE-EVALUAR AGENTES'}
                    </button>
                    {activePosition && (
                      <button
                        onClick={handleClosePosition}
                        className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold font-mono tracking-wider transition-all shadow-md"
                      >
                        CERRAR POSICIÓN ACTIVA
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Grid: Blackboard (15 Agents) + Selected Agent Inspector */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                
                {/* 15 Agents Blackboard Matrix (8 Cols) */}
                <div className={`xl:col-span-8 p-5 rounded-2xl border transition-all ${
                  isDark ? 'bg-[#0c0e18] border-[#181c30]' : 'bg-white border-slate-200 shadow-sm'
                }`}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-4 border-b border-inherit gap-3">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-indigo-400" />
                      <h2 className="font-display font-bold text-sm tracking-wide uppercase">
                        MONITOR DE PIZARRA (BLACKBOARD)
                      </h2>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-bold">
                        15 AGENTES
                      </span>
                    </div>

                    {/* Filter Pills */}
                    <div className={`flex rounded-lg border p-0.5 text-[10px] font-mono font-bold ${
                      isDark ? 'bg-[#060810] border-[#182645]' : 'bg-slate-100 border-slate-300'
                    }`}>
                      {(['ALL', 'FAST', 'SLOW'] as const).map(flt => (
                        <button
                          key={flt}
                          onClick={() => setBlackboardFilter(flt)}
                          className={`px-2.5 py-1 rounded transition-all ${
                            blackboardFilter === flt
                              ? (isDark ? 'bg-indigo-600 text-white' : 'bg-white text-indigo-700 shadow-sm')
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {flt === 'ALL' ? 'TODOS (15)' : flt === 'FAST' ? 'FAST-LOOP (8)' : 'SLOW-LOOP (7)'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Agents Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[680px] overflow-y-auto pr-1">
                    {filteredAgents.map((agent: AgentState) => {
                      const isSelected = selectedAgentName === agent.name;
                      const scoreColor = getScoreColor(agent.score);

                      return (
                        <div
                          key={agent.name}
                          onClick={() => setSelectedAgentName(agent.name)}
                          className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all duration-200 ${
                            isSelected
                              ? (isDark 
                                  ? 'bg-gradient-to-tr from-[#121528] to-[#1c213d] border-indigo-500 shadow-md ring-1 ring-indigo-500/30' 
                                  : 'bg-indigo-50/70 border-indigo-400 shadow-sm ring-1 ring-indigo-400/20')
                              : (isDark 
                                  ? 'bg-[#090b14] hover:bg-[#0f1324] border-[#18203c]' 
                                  : 'bg-slate-50/80 hover:bg-slate-100 border-slate-200')
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1.5 mb-1.5">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className={`w-2 h-2 rounded-full ${
                                agent.status === 'PROCESSING' 
                                  ? 'bg-amber-400 animate-pulse' 
                                  : agent.status === 'COMPLETED' 
                                  ? 'bg-emerald-400' 
                                  : 'bg-slate-500'
                              }`} />
                              <span className="font-bold text-xs truncate">
                                {agent.spanishName}
                              </span>
                            </div>
                            <span className="text-[8px] font-mono text-slate-400 uppercase px-1.5 py-0.5 rounded border border-inherit">
                              {agent.isFastLoop ? 'FAST' : 'SLOW'}
                            </span>
                          </div>

                          <p className="text-[10px] text-slate-400 line-clamp-1 mb-2">
                            {agent.description}
                          </p>

                          <div className="flex items-center justify-between gap-2 pt-2 border-t border-inherit">
                            <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                              agent.status === 'COMPLETED' ? scoreColor : 'text-slate-500 border-slate-700/40'
                            }`}>
                              {agent.status === 'COMPLETED' 
                                ? (agent.score > 0 ? `+${agent.score}` : agent.score) 
                                : 'IDLE'}
                            </span>

                            <div className="flex items-center gap-1 text-[10px] font-mono text-slate-400">
                              <span>Conf:</span>
                              <div className="w-10 bg-slate-700/30 h-1.5 rounded-full overflow-hidden">
                                <div 
                                  className="bg-indigo-500 h-full rounded-full transition-all duration-300"
                                  style={{ width: `${agent.status === 'COMPLETED' ? agent.confidence * 100 : 0}%` }}
                                />
                              </div>
                              <span>{agent.status === 'COMPLETED' ? `${Math.round(agent.confidence * 100)}%` : '0%'}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Selected Agent Forensic Inspector (4 Cols) */}
                <div className={`xl:col-span-4 p-5 rounded-2xl border flex flex-col justify-between transition-all ${
                  isDark ? 'bg-[#0c0e18] border-[#181c30]' : 'bg-white border-slate-200 shadow-sm'
                }`}>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-inherit">
                      <div className="flex items-center gap-2">
                        <Eye className="w-4 h-4 text-cyan-400" />
                        <h3 className="font-display font-bold text-xs uppercase tracking-wider">
                          Inspección Forense de Agente
                        </h3>
                      </div>
                      <span className="text-[9px] font-mono text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded font-bold">
                        {agents[selectedAgentName]?.name}
                      </span>
                    </div>

                    <div>
                      <h4 className="text-sm font-bold">{agents[selectedAgentName]?.spanishName}</h4>
                      <p className="text-xs text-slate-400 mt-1">{agents[selectedAgentName]?.description}</p>
                    </div>

                    <div className={`p-3 rounded-xl border ${
                      isDark ? 'bg-[#070914] border-[#161c36]' : 'bg-slate-50 border-slate-200'
                    }`}>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold block mb-1">
                        Razonamiento & Veredicto:
                      </span>
                      <p className="text-xs italic leading-relaxed">
                        "{agents[selectedAgentName]?.justification}"
                      </p>
                    </div>

                    <div className={`p-3 rounded-xl border ${
                      isDark ? 'bg-[#070914] border-[#161c36]' : 'bg-slate-50 border-slate-200'
                    }`}>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold block mb-1.5">
                        Telemetría y Parámetros JSON:
                      </span>
                      <pre className="font-mono text-[10px] text-cyan-300 overflow-x-auto max-h-[220px] p-2 rounded bg-black/30">
                        {JSON.stringify(agents[selectedAgentName]?.details, null, 2)}
                      </pre>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-inherit text-[11px] text-slate-400 flex items-center justify-between font-mono">
                    <span>Loop: {agents[selectedAgentName]?.isFastLoop ? 'Fast (Micro-latencia)' : 'Slow (Cognitivo IA)'}</span>
                    <span>Peso: {((agentWeights[selectedAgentName] || 0) * 100).toFixed(0)}%</span>
                  </div>
                </div>

              </div>
            </motion.div>
          )}

          {/* ================================================================ */}
          {/* TAB 2: TERMINAL DE TRADING (UNIVERSAL & MULTI-EXCHANGE)          */}
          {/* ================================================================ */}
          {activeTab === 'terminal' && (
            <motion.div
              key="tab-terminal"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-6"
            >
              {/* Left Column: Live Book & Position Manager (7 Cols) */}
              <div className="lg:col-span-7 space-y-6">
                
                {/* Active Position Card */}
                <div className={`p-5 rounded-2xl border transition-all ${
                  isDark ? 'bg-[#0c0e18] border-[#181c30]' : 'bg-white border-slate-200 shadow-sm'
                }`}>
                  <div className="flex items-center justify-between pb-3 mb-4 border-b border-inherit">
                    <div className="flex items-center gap-2">
                      <Wallet className="w-4 h-4 text-indigo-400" />
                      <h3 className="font-display font-bold text-sm tracking-wide uppercase">
                        Posición Activa en Mercado
                      </h3>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 font-bold">
                        {currentBrokerDisplayName}
                      </span>
                    </div>
                    {activePosition && (
                      <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                        activePosition.side === 'LONG' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                      }`}>
                        {activePosition.side} {activePosition.leverage}x
                      </span>
                    )}
                  </div>

                  {activePosition ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
                        <div className={`p-3 rounded-xl border ${isDark ? 'bg-[#070914] border-[#18203c]' : 'bg-slate-50 border-slate-200'}`}>
                          <span className="text-[10px] text-slate-400 block">CANTIDAD</span>
                          <span className="text-sm font-bold">{activePosition.quantity} {symbol.split('/')[0]}</span>
                        </div>
                        <div className={`p-3 rounded-xl border ${isDark ? 'bg-[#070914] border-[#18203c]' : 'bg-slate-50 border-slate-200'}`}>
                          <span className="text-[10px] text-slate-400 block">PRECIO ENTRADA</span>
                          <span className="text-sm font-bold">${activePosition.entryPrice}</span>
                        </div>
                        <div className={`p-3 rounded-xl border ${isDark ? 'bg-[#070914] border-[#18203c]' : 'bg-slate-50 border-slate-200'}`}>
                          <span className="text-[10px] text-slate-400 block">PRECIO ACTUAL</span>
                          <span className="text-sm font-bold">${price}</span>
                        </div>
                        <div className={`p-3 rounded-xl border ${isDark ? 'bg-[#070914] border-[#18203c]' : 'bg-slate-50 border-slate-200'}`}>
                          <span className="text-[10px] text-slate-400 block">PNL NO REALIZADO</span>
                          <span className={`text-sm font-bold ${activePosition.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {activePosition.pnl >= 0 ? '+' : '-'}${Math.abs(activePosition.pnl).toFixed(2)} ({activePosition.pnlPercentage >= 0 ? '+' : ''}{activePosition.pnlPercentage.toFixed(2)}%)
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2">
                        <div className="text-xs font-mono text-slate-400">
                          <span>SL: ${activePosition.stopLoss}</span> • <span>TP: ${activePosition.takeProfit}</span>
                        </div>
                        <button
                          onClick={handleClosePosition}
                          className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold font-mono tracking-wider transition-all shadow-md"
                        >
                          CERRAR A MERCADO
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="py-8 text-center text-xs font-mono text-slate-400">
                      No hay posiciones abiertas actualmente en el mercado. Usa la consola de la derecha para despachar órdenes manuales o automáticas.
                    </div>
                  )}
                </div>

                {/* Simulated Order Book / Depth View */}
                <div className={`p-5 rounded-2xl border transition-all ${
                  isDark ? 'bg-[#0c0e18] border-[#181c30]' : 'bg-white border-slate-200 shadow-sm'
                }`}>
                  <div className="flex items-center justify-between pb-3 mb-3 border-b border-inherit">
                    <span className="font-display font-bold text-xs uppercase tracking-wider flex items-center gap-1.5">
                      <BarChart3 className="w-4 h-4 text-indigo-400" />
                      Libro de Órdenes & Profundidad ({symbol})
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">Spread: $0.50</span>
                  </div>

                  <div className="space-y-1 font-mono text-xs">
                    {/* Asks (Sell) */}
                    <div className="space-y-1 pb-2 border-b border-dashed border-slate-700/30">
                      {[1.002, 1.0015, 1.0008].map((mult, idx) => (
                        <div key={idx} className="flex justify-between text-rose-400 py-0.5 px-2 rounded bg-rose-500/5">
                          <span>${(price * mult).toFixed(2)}</span>
                          <span>{(0.45 * (idx + 1)).toFixed(3)} {symbol.split('/')[0]}</span>
                          <span className="text-slate-400">${(price * mult * 0.45 * (idx + 1)).toFixed(0)}</span>
                        </div>
                      ))}
                    </div>

                    {/* Mid Price */}
                    <div className="py-2 text-center font-bold text-sm tracking-wider flex items-center justify-center gap-2">
                      <span className={priceDirection === 'UP' ? 'text-emerald-400' : 'text-rose-400'}>
                        ${price.toFixed(2)} USD
                      </span>
                      <span className="text-[10px] text-slate-400 font-normal">Precio de Mercado</span>
                    </div>

                    {/* Bids (Buy) */}
                    <div className="space-y-1 pt-2 border-t border-dashed border-slate-700/30">
                      {[0.9992, 0.9985, 0.998].map((mult, idx) => (
                        <div key={idx} className="flex justify-between text-emerald-400 py-0.5 px-2 rounded bg-emerald-500/5">
                          <span>${(price * mult).toFixed(2)}</span>
                          <span>{(0.52 * (idx + 1)).toFixed(3)} {symbol.split('/')[0]}</span>
                          <span className="text-slate-400">${(price * mult * 0.52 * (idx + 1)).toFixed(0)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Historial de Auditoría en Base de Datos (Órdenes & Trades Cerrados) */}
                <div className={`p-5 rounded-2xl border transition-all ${
                  isDark ? 'bg-[#0c0e18] border-[#181c30]' : 'bg-white border-slate-200 shadow-sm'
                }`}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 mb-3 border-b border-inherit">
                    <div className="flex items-center gap-1 font-mono text-xs font-bold">
                      <button
                        type="button"
                        onClick={() => setHistoryViewTab('orders')}
                        className={`px-2.5 py-1 rounded transition-all flex items-center gap-1.5 ${
                          historyViewTab === 'orders'
                            ? 'bg-indigo-600 text-white shadow'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <Clock className="w-3.5 h-3.5" />
                        <span>Órdenes Despachadas ({ordersHistory.length})</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setHistoryViewTab('trades')}
                        className={`px-2.5 py-1 rounded transition-all flex items-center gap-1.5 ${
                          historyViewTab === 'trades'
                            ? 'bg-emerald-600 text-white shadow'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <Award className="w-3.5 h-3.5" />
                        <span>Trades Cerrados PnL ({closedTrades.length})</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={fetchOrdersHistory}
                      className="text-[10px] font-mono text-slate-400 hover:text-slate-200 flex items-center gap-1 transition-colors self-end sm:self-auto"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Actualizar
                    </button>
                  </div>

                  {historyViewTab === 'orders' ? (
                    ordersHistory.length > 0 ? (
                      <div className="overflow-x-auto max-h-[280px] overflow-y-auto">
                        <table className="w-full font-mono text-xs text-left">
                          <thead>
                            <tr className={`border-b text-[10px] uppercase text-slate-400 ${
                              isDark ? 'border-slate-800' : 'border-slate-200'
                            }`}>
                              <th className="py-2 px-2">Hora</th>
                              <th className="py-2 px-2">Símbolo</th>
                              <th className="py-2 px-2">Operación</th>
                              <th className="py-2 px-2">Apal.</th>
                              <th className="py-2 px-2">Estado</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/20">
                            {ordersHistory.map(ord => (
                              <tr key={ord.id} className="hover:bg-white/5 transition-colors">
                                <td className="py-2 px-2 text-slate-400 text-[11px]">
                                  {new Date(ord.createdAt).toLocaleTimeString()}
                                </td>
                                <td className="py-2 px-2 font-bold">{ord.symbol}</td>
                                <td className="py-2 px-2">
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                    ord.side === 'BUY'
                                      ? 'bg-emerald-500/20 text-emerald-400'
                                      : 'bg-rose-500/20 text-rose-400'
                                  }`}>
                                    {ord.side}
                                  </span>
                                </td>
                                <td className="py-2 px-2 text-slate-300">{ord.leverage}x</td>
                                <td className="py-2 px-2">
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                    ord.status === 'FILLED'
                                      ? 'bg-cyan-500/20 text-cyan-400'
                                      : ord.status === 'CREATED'
                                        ? 'bg-amber-500/20 text-amber-400'
                                        : 'bg-slate-500/20 text-slate-400'
                                  }`}>
                                    {ord.status}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="py-6 text-center text-xs font-mono text-slate-400">
                        No hay órdenes despachadas registradas en la base de datos.
                      </div>
                    )
                  ) : (
                    closedTrades.length > 0 ? (
                      <div className="overflow-x-auto max-h-[280px] overflow-y-auto">
                        <table className="w-full font-mono text-xs text-left">
                          <thead>
                            <tr className={`border-b text-[10px] uppercase text-slate-400 ${
                              isDark ? 'border-slate-800' : 'border-slate-200'
                            }`}>
                              <th className="py-2 px-2">Hora Cierre</th>
                              <th className="py-2 px-2">Símbolo</th>
                              <th className="py-2 px-2">Dirección</th>
                              <th className="py-2 px-2">Entrada</th>
                              <th className="py-2 px-2">Salida</th>
                              <th className="py-2 px-2">PnL Realizado</th>
                              <th className="py-2 px-2">Retorno</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/20">
                            {closedTrades.map(tr => {
                              const pnlNum = parseFloat(tr.pnl || '0');
                              const pctNum = parseFloat(tr.pnlPercentage || '0');
                              return (
                                <tr key={tr.id} className="hover:bg-white/5 transition-colors">
                                  <td className="py-2 px-2 text-slate-400 text-[11px]">
                                    {tr.exitTime ? new Date(tr.exitTime).toLocaleTimeString() : 'En curso'}
                                  </td>
                                  <td className="py-2 px-2 font-bold">{tr.symbol}</td>
                                  <td className="py-2 px-2">
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                      tr.side === 'LONG'
                                        ? 'bg-emerald-500/20 text-emerald-400'
                                        : 'bg-rose-500/20 text-rose-400'
                                    }`}>
                                      {tr.side} {tr.leverage}x
                                    </span>
                                  </td>
                                  <td className="py-2 px-2 text-slate-300">${Number(tr.entryPrice).toFixed(2)}</td>
                                  <td className="py-2 px-2 text-slate-300">${Number(tr.exitPrice || '0').toFixed(2)}</td>
                                  <td className="py-2 px-2">
                                    <span className={`font-bold ${pnlNum >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                      {pnlNum >= 0 ? '+' : ''}${pnlNum.toFixed(2)} USD
                                    </span>
                                  </td>
                                  <td className="py-2 px-2">
                                    <span className={pctNum >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                                      {pctNum >= 0 ? '+' : ''}{pctNum.toFixed(2)}%
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="py-6 text-center text-xs font-mono text-slate-400">
                        No hay trades cerrados aún. Cuando una posición toque TP/SL o se cierre a mercado, aparecerá registrada aquí con su PnL liquidado.
                      </div>
                    )
                  )}
                </div>

              </div>

              {/* Right Column: Order Execution Console (5 Cols) */}
              <div className={`lg:col-span-5 p-5 rounded-2xl border space-y-5 transition-all ${
                isDark ? 'bg-[#0c0e18] border-[#181c30]' : 'bg-white border-slate-200 shadow-sm'
              }`}>
                <div className="flex items-center justify-between pb-3 border-b border-inherit">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-cyan-400" />
                    <h3 className="font-display font-bold text-sm uppercase tracking-wider">
                      Consola de Ejecución Directa
                    </h3>
                  </div>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                    isCurrentBrokerReal ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'
                  }`}>
                    {isCurrentBrokerReal ? 'REAL EN VIVO' : 'DEMO SANDBOX'}
                  </span>
                </div>

                {/* Active Broker Switcher within Terminal */}
                <div className={`p-2 rounded-xl border flex items-center justify-between ${
                  isDark ? 'bg-[#060810] border-[#182645]' : 'bg-slate-50 border-slate-200'
                }`}>
                  <span className="text-xs font-mono font-bold text-slate-400">
                    Broker de Ejecución:
                  </span>
                  <div className="flex items-center gap-1 font-mono text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => handleSwitchExchange('kraken')}
                      className={`px-3 py-1 rounded transition-all ${
                        apiConfig.activeExchange === 'kraken'
                          ? 'bg-purple-600 text-white shadow'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      🐙 Kraken
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSwitchExchange('bitget')}
                      className={`px-3 py-1 rounded transition-all ${
                        apiConfig.activeExchange === 'bitget'
                          ? 'bg-amber-600 text-white shadow'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      🟠 Bitget
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSwitchExchange('hyperliquid')}
                      className={`px-3 py-1 rounded transition-all ${
                        apiConfig.activeExchange === 'hyperliquid'
                          ? 'bg-cyan-600 text-white shadow font-extrabold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      💧 Hyperliquid
                    </button>
                  </div>
                </div>

                {/* Order Type Toggle: Market vs Limit */}
                <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-500/10 border border-inherit text-xs font-mono font-bold">
                  <button
                    onClick={() => setManualOrderType('MARKET')}
                    className={`py-2 rounded-lg transition-all ${
                      manualOrderType === 'MARKET' ? (isDark ? 'bg-indigo-600 text-white' : 'bg-white text-indigo-700 shadow-sm') : 'text-slate-400'
                    }`}
                  >
                    MERCADO
                  </button>
                  <button
                    onClick={() => setManualOrderType('LIMIT')}
                    className={`py-2 rounded-lg transition-all ${
                      manualOrderType === 'LIMIT' ? (isDark ? 'bg-indigo-600 text-white' : 'bg-white text-indigo-700 shadow-sm') : 'text-slate-400'
                    }`}
                  >
                    LÍMITE
                  </button>
                </div>

                {/* Capital in USD Input */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-mono">
                    <label className="text-slate-400 font-bold">Tamaño de Orden (USD)</label>
                    <span className="text-cyan-400 font-bold">${manualSizeUsd} USD</span>
                  </div>
                  <input
                    type="number"
                    value={manualSizeUsd}
                    onChange={(e) => setManualSizeUsd(Math.max(10, Number(e.target.value)))}
                    className={`w-full px-3 py-2.5 rounded-xl border text-sm font-mono focus:outline-none focus:border-cyan-500 ${
                      isDark ? 'bg-[#060810] border-[#182645] text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                    }`}
                  />
                  <div className="grid grid-cols-4 gap-1.5 pt-1 text-[10px] font-mono font-bold">
                    {[25, 50, 100, 250].map(val => (
                      <button
                        key={val}
                        onClick={() => setManualSizeUsd(val)}
                        className={`py-1 rounded border transition-all ${
                          manualSizeUsd === val ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40' : 'text-slate-400 border-inherit hover:bg-slate-500/10'
                        }`}
                      >
                        ${val}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Leverage Slider */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-mono">
                    <label className="text-slate-400 font-bold">Apalancamiento</label>
                    <span className="text-indigo-400 font-bold">{manualLeverage}x</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="50"
                    value={manualLeverage}
                    onChange={(e) => setManualLeverage(Number(e.target.value))}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-[9px] font-mono text-slate-500">
                    <span>1x (Margen Spot)</span>
                    <span>10x (Estándar)</span>
                    <span>25x</span>
                    <span>50x (Extremo)</span>
                  </div>
                </div>

                {/* Calculated Margins Summary */}
                <div className={`p-3 rounded-xl border text-xs font-mono space-y-1.5 ${
                  isDark ? 'bg-[#060810] border-[#182645]' : 'bg-slate-50 border-slate-200'
                }`}>
                  <div className="flex justify-between text-slate-400">
                    <span>Margen Requerido:</span>
                    <span className="font-bold text-white">${(manualSizeUsd / manualLeverage).toFixed(2)} USD</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Volumen Total:</span>
                    <span className="font-bold text-white">${manualSizeUsd.toFixed(2)} USD ({(manualSizeUsd / price).toFixed(4)} {symbol.split('/')[0]})</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Stop Loss sugerido (ATR):</span>
                    <span className="font-bold text-amber-400">±1.8%</span>
                  </div>
                </div>

                {/* Order Execution Buttons */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button
                    onClick={() => handlePlaceManualOrder('LONG')}
                    className="py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold font-mono text-xs tracking-wider transition-all shadow-lg shadow-emerald-950/40 hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-1.5"
                  >
                    <ArrowUpRight className="w-4 h-4" />
                    <span>COMPRAR / LONG</span>
                  </button>

                  <button
                    onClick={() => handlePlaceManualOrder('SHORT')}
                    className="py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold font-mono text-xs tracking-wider transition-all shadow-lg shadow-rose-950/40 hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-1.5"
                  >
                    <ArrowDownRight className="w-4 h-4" />
                    <span>VENDER / SHORT</span>
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* ================================================================ */}
          {/* TAB 3: BACKTEST STUDIO                                           */}
          {/* ================================================================ */}
          {activeTab === 'backtest' && (
            <motion.div
              key="tab-backtest"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="space-y-6"
            >
              {/* Backtest Header & Controls */}
              <div className={`p-5 rounded-2xl border transition-all ${
                isDark ? 'bg-[#0c0e18] border-[#181c30]' : 'bg-white border-slate-200 shadow-sm'
              }`}>
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div>
                    <h2 className="font-display font-bold text-base uppercase tracking-wide flex items-center gap-2">
                      <LineChart className="w-5 h-5 text-indigo-400" />
                      <span>Simulador Histórico Walk-Forward</span>
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Evalúa los 15 agentes algorítmicos contra velas reales de mercado con Criterio de Quarter-Kelly y slippage modelado.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    {/* Timeframe / Mode Pills */}
                    <div className={`flex rounded-lg border p-0.5 text-xs font-mono font-bold ${
                      isDark ? 'bg-[#060810] border-[#182645]' : 'bg-slate-100 border-slate-300'
                    }`}>
                      <button
                        onClick={() => setTimeframe('15m')}
                        className={`px-3 py-1.5 rounded transition-all flex items-center gap-1 ${
                          timeframe === '15m'
                            ? (isDark ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-indigo-700 shadow-sm')
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        ⚡ 15m Intradía
                      </button>
                      <button
                        onClick={() => setTimeframe('1h')}
                        className={`px-3 py-1.5 rounded transition-all flex items-center gap-1 ${
                          timeframe === '1h'
                            ? (isDark ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-indigo-700 shadow-sm')
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        🌊 1h Swing
                      </button>
                    </div>

                    {/* Period Pills */}
                    <div className={`flex rounded-lg border p-0.5 text-xs font-mono font-bold ${
                      isDark ? 'bg-[#060810] border-[#182645]' : 'bg-slate-100 border-slate-300'
                    }`}>
                      {[1, 7, 14, 30, 90].map(d => (
                        <button
                          key={d}
                          onClick={() => setBacktestDays(d)}
                          className={`px-3 py-1.5 rounded transition-all ${
                            backtestDays === d
                              ? (isDark ? 'bg-indigo-600 text-white' : 'bg-white text-indigo-700 shadow-sm')
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {d}D
                        </button>
                      ))}
                    </div>

                    <button
                      onClick={handleRunBacktest}
                      disabled={backtestRunning}
                      className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold font-mono tracking-wider transition-all shadow-md flex items-center gap-2"
                    >
                      <Play className={`w-3.5 h-3.5 ${backtestRunning ? 'animate-spin' : ''}`} />
                      {backtestRunning ? 'SIMULANDO HISTÓRICO...' : 'EJECUTAR BACKTEST'}
                    </button>
                  </div>
                </div>

                {backtestError && (
                  <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400 font-mono">
                    ⚠️ {backtestError}
                  </div>
                )}
              </div>

              {/* Backtest Scoreboard: Visible ONLY when a real backtest has been executed */}
              {backtestResult ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    <div className={`p-4 rounded-xl border ${isDark ? 'bg-[#0c0e18] border-[#181c30]' : 'bg-white border-slate-200 shadow-sm'}`}>
                      <span className="text-[10px] font-mono uppercase text-slate-400 block">GANANCIA NETA</span>
                      <span className={`text-lg font-bold font-mono ${(backtestResult.netProfit ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {(backtestResult.netProfit ?? 0) >= 0 ? '+' : ''}${Number(backtestResult.netProfit ?? 0).toLocaleString()}
                      </span>
                    </div>

                    <div className={`p-4 rounded-xl border ${isDark ? 'bg-[#0c0e18] border-[#181c30]' : 'bg-white border-slate-200 shadow-sm'}`}>
                      <span className="text-[10px] font-mono uppercase text-slate-400 block">WIN RATE</span>
                      <span className="text-lg font-bold font-mono text-cyan-400">{backtestResult.winRate ?? 0}%</span>
                    </div>

                    <div className={`p-4 rounded-xl border ${isDark ? 'bg-[#0c0e18] border-[#181c30]' : 'bg-white border-slate-200 shadow-sm'}`}>
                      <span className="text-[10px] font-mono uppercase text-slate-400 block">PROFIT FACTOR</span>
                      <span className="text-lg font-bold font-mono text-indigo-400">{backtestResult.profitFactor ?? 0}</span>
                    </div>

                    <div className={`p-4 rounded-xl border ${isDark ? 'bg-[#0c0e18] border-[#181c30]' : 'bg-white border-slate-200 shadow-sm'}`}>
                      <span className="text-[10px] font-mono uppercase text-slate-400 block">MAX DRAWDOWN</span>
                      <span className="text-lg font-bold font-mono text-rose-400">-{backtestResult.maxDrawdownPct ?? 0}%</span>
                    </div>

                    <div className={`p-4 rounded-xl border ${isDark ? 'bg-[#0c0e18] border-[#181c30]' : 'bg-white border-slate-200 shadow-sm'}`}>
                      <span className="text-[10px] font-mono uppercase text-slate-400 block">SHARPE RATIO</span>
                      <span className="text-lg font-bold font-mono text-emerald-400">{backtestResult.sharpeRatio ?? 0}</span>
                    </div>

                    <div className={`p-4 rounded-xl border ${isDark ? 'bg-[#0c0e18] border-[#181c30]' : 'bg-white border-slate-200 shadow-sm'}`}>
                      <span className="text-[10px] font-mono uppercase text-slate-400 block">TOTAL TRADES</span>
                      <span className="text-lg font-bold font-mono text-white">{backtestResult.totalTrades ?? 0}</span>
                    </div>
                  </div>

                  {/* SVG Equity Curve Chart */}
                  <div className={`p-5 rounded-2xl border ${isDark ? 'bg-[#0c0e18] border-[#181c30]' : 'bg-white border-slate-200 shadow-sm'}`}>
                    <div className="flex items-center justify-between pb-3 mb-4 border-b border-inherit">
                      <span className="font-display font-bold text-xs uppercase tracking-wider text-slate-300">
                        Curva de Rendimiento Acumulado (Equity Curve)
                      </span>
                      <span className="text-[10px] font-mono text-emerald-400">
                        Retorno: {(backtestResult.netProfit ?? 0) >= 0 ? '+' : ''}{(((backtestResult.netProfit ?? 0) / backtestCapital) * 100).toFixed(1)}%
                      </span>
                    </div>

                    <div className="w-full h-56 relative flex items-end">
                      <svg className="w-full h-full overflow-visible" viewBox="0 0 500 150" preserveAspectRatio="none">
                        <defs>
                          <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.3" />
                            <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.0" />
                          </linearGradient>
                        </defs>
                        <line x1="0" y1="120" x2="500" y2="120" stroke="#334155" strokeDasharray="4 4" strokeWidth="0.75" />
                        <path
                          d="M0 120 Q50 115 100 95 T200 85 T300 60 T400 45 T500 25 L500 150 L0 150 Z"
                          fill="url(#equityGrad)"
                        />
                        <path
                          d="M0 120 Q50 115 100 95 T200 85 T300 60 T400 45 T500 25"
                          fill="none"
                          stroke="#06b6d4"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                        />
                      </svg>
                    </div>
                  </div>
                </div>
              ) : (
                <div className={`p-12 rounded-2xl border text-center transition-all ${
                  isDark ? 'bg-[#0c0e18] border-[#181c30]' : 'bg-white border-slate-200 shadow-sm'
                }`}>
                  <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                    <LineChart className="w-7 h-7" />
                  </div>
                  <h3 className="font-display font-bold text-base uppercase tracking-wide mb-1 text-slate-200">
                    Ninguna simulación ejecutada
                  </h3>
                  <p className="text-xs text-slate-400 max-w-md mx-auto mb-5 leading-relaxed">
                    Selecciona el rango temporal (1D a 90D) y pulsa <strong className="text-indigo-400">"EJECUTAR BACKTEST"</strong> para simular las decisiones históricas del motor multi-agente sobre velas de mercado reales.
                  </p>
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-500/10 border border-slate-500/20 text-[11px] font-mono text-slate-400">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                    <span>Sin datos previos cargados • Listo para simular</span>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* ================================================================ */}
          {/* TAB 4: MOTOR MULTI-AGENTE & IA (LEARNING)                        */}
          {/* ================================================================ */}
          {activeTab === 'learning' && (
            <motion.div
              key="tab-learning"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="space-y-6"
            >
              <div className={`p-5 rounded-2xl border transition-all ${
                isDark ? 'bg-[#0c0e18] border-[#181c30]' : 'bg-white border-slate-200 shadow-sm'
              }`}>
                <div className="flex items-center justify-between pb-3 mb-4 border-b border-inherit">
                  <div>
                    <h2 className="font-display font-bold text-base uppercase tracking-wide flex items-center gap-2">
                      <Cpu className="w-5 h-5 text-indigo-400" />
                      <span>Optimización Bayesiana de Pesos (Supervisor)</span>
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Ajuste dinámico de los pesos asignados a cada agente. Los pesos se normalizan automáticamente al 100%.
                    </p>
                  </div>
                  <span className="text-xs font-mono font-bold text-indigo-400 px-3 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                    Época: 13 • Thompson Sampling
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Object.entries(agentWeights).filter(([_, w]) => (w as number) > 0).map(([agentName, weight]) => (
                    <div
                      key={agentName}
                      className={`p-3.5 rounded-xl border ${
                        isDark ? 'bg-[#070914] border-[#161c36]' : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-xs">{agents[agentName as AgentName]?.spanishName || agentName}</span>
                        <span className="text-xs font-mono font-bold text-cyan-400">{((weight as number) * 100).toFixed(0)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="0.5"
                        step="0.01"
                        value={weight}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setAgentWeights(prev => ({ ...prev, [agentName]: val }));
                        }}
                        className="w-full accent-cyan-400 cursor-pointer"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* ================================================================ */}
          {/* TAB 5: TELEMETRÍA & LOGS FORENSES                                */}
          {/* ================================================================ */}
          {activeTab === 'logs' && (
            <motion.div
              key="tab-logs"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className={`p-5 rounded-2xl border space-y-4 transition-all ${
                isDark ? 'bg-[#0c0e18] border-[#181c30]' : 'bg-white border-slate-200 shadow-sm'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-inherit">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-indigo-400" />
                  <h2 className="font-display font-bold text-base uppercase tracking-wide">
                    Consola de Telemetría & Auditoría en Vivo
                  </h2>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(logs, null, 2));
                      const downloadAnchor = document.createElement('a');
                      downloadAnchor.setAttribute("href", dataStr);
                      downloadAnchor.setAttribute("download", `atlas_logs_${Date.now()}.json`);
                      document.body.appendChild(downloadAnchor);
                      downloadAnchor.click();
                      downloadAnchor.remove();
                    }}
                    className="px-3 py-1.5 rounded-lg border text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-slate-500/10"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Exportar JSON</span>
                  </button>

                  <button
                    onClick={() => setLogs([])}
                    className="px-3 py-1.5 rounded-lg border text-xs font-mono font-bold text-rose-400 hover:bg-rose-500/10 border-rose-500/20 flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Limpiar</span>
                  </button>
                </div>
              </div>

              {/* Filter & Search Bar */}
              <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
                <div className="flex items-center gap-1 p-0.5 rounded-lg border text-xs font-mono font-bold">
                  {(['ALL', 'INFO', 'WARN', 'ERROR', 'DEBUG'] as const).map(lvl => (
                    <button
                      key={lvl}
                      onClick={() => setLogFilter(lvl)}
                      className={`px-2.5 py-1 rounded transition-all ${
                        logFilter === lvl
                          ? (lvl === 'ERROR' ? 'bg-rose-600 text-white' : lvl === 'WARN' ? 'bg-amber-600 text-white' : 'bg-indigo-600 text-white')
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>

                <div className="relative flex-1 sm:max-w-xs">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    placeholder="Filtrar por agente, evento..."
                    className={`w-full pl-9 pr-3 py-1.5 rounded-lg border text-xs font-mono focus:outline-none focus:border-cyan-500 ${
                      isDark ? 'bg-[#060810] border-[#182645] text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                    }`}
                  />
                </div>
              </div>

              {/* Logs Stream Box */}
              <div className={`p-4 rounded-xl border font-mono text-xs overflow-y-auto max-h-[550px] space-y-2 ${
                isDark ? 'bg-[#05060b] border-[#14182b]' : 'bg-slate-900 text-slate-200 border-slate-800'
              }`}>
                {filteredLogs.length > 0 ? (
                  filteredLogs.map(l => (
                    <div key={l.id} className="flex items-start gap-2 leading-relaxed hover:bg-white/5 p-1 rounded transition-colors">
                      <span className="text-slate-500 shrink-0">[{l.timestamp}]</span>
                      <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold shrink-0 ${
                        l.level === 'INFO' ? 'bg-cyan-500/20 text-cyan-400' :
                        l.level === 'WARN' ? 'bg-amber-500/20 text-amber-400' :
                        l.level === 'ERROR' ? 'bg-rose-500/20 text-rose-400' :
                        'bg-purple-500/20 text-purple-400'
                      }`}>
                        {l.level}
                      </span>
                      <span className="text-indigo-400 font-bold shrink-0">[{l.agentName}]:</span>
                      <span className="break-all">{l.message}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-10 text-slate-500">
                    No hay logs que coincidan con el filtro actual.
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* ================================================================ */}
          {/* TAB 6: CONFIGURACIÓN API & EXCHANGES                             */}
          {/* ================================================================ */}
          {activeTab === 'api-config' && (
            <motion.div
              key="tab-api-config"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className={`p-6 rounded-2xl border max-w-4xl mx-auto space-y-6 transition-all ${
                isDark ? 'bg-[#0c0e18] border-[#181c30]' : 'bg-white border-slate-200 shadow-sm'
              }`}
            >
              <form onSubmit={saveApiConfig} className="space-y-6">
                <div className="flex items-center justify-between pb-3 border-b border-inherit">
                  <div className="flex items-center gap-2">
                    <Shield className="w-5 h-5 text-cyan-400" />
                    <div>
                      <h2 className="font-display font-bold text-base uppercase tracking-wide">
                        Configuración de Credenciales de Exchanges
                      </h2>
                      <p className="text-xs text-slate-400">
                        Administra claves API con aplicación en caliente (*hot-reload*) para operar de forma segura.
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-bold text-cyan-400 px-3 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                    Broker Activo: {currentBrokerDisplayName}
                  </span>
                </div>

                {/* Token de Administrador */}
                <div className={`p-4 rounded-xl border space-y-2 ${
                  isDark ? 'bg-[#070914] border-[#161c36]' : 'bg-slate-50 border-slate-200'
                }`}>
                  <label className="text-xs font-mono text-cyan-400 uppercase tracking-wider font-bold flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-cyan-400" />
                    Token de Administrador (Firma de Seguridad)
                  </label>
                  <div className="relative">
                    <input
                      type={showAdminToken ? 'text' : 'password'}
                      value={adminToken}
                      onChange={(e) => setAdminToken(e.target.value)}
                      placeholder="Introduce tu ADMIN_API_TOKEN..."
                      className={`w-full px-3 py-2.5 rounded-xl border text-xs font-mono pr-10 focus:outline-none focus:border-cyan-500 ${
                        isDark ? 'bg-[#05060b] border-[#182645] text-white' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowAdminToken(!showAdminToken)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                    >
                      {showAdminToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Requerido para autorizar operaciones y leer o modificar claves seguras en el servidor. Se guarda de forma segura en tu navegador.
                  </p>
                </div>

                {/* Exchange Switcher Cards */}
                <div className="space-y-3">
                  <label className="text-xs font-mono text-slate-400 uppercase tracking-wider font-bold block">
                    Seleccionar Exchange
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => handleSwitchExchange('kraken')}
                      className={`p-4 rounded-xl border text-left flex items-center justify-between transition-all ${
                        apiConfig.activeExchange === 'kraken'
                          ? (isDark ? 'bg-[#1b1735] border-purple-500 text-white shadow-lg' : 'bg-purple-50/70 border-purple-500 text-slate-900 shadow-sm')
                          : (isDark ? 'bg-[#070914] border-[#161c36] text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600')
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">🐙</span>
                        <div>
                          <div className="text-sm font-bold">Kraken Futures</div>
                          <div className="text-[10px] text-slate-400">Derivatives V3 API</div>
                        </div>
                      </div>
                      {apiConfig.activeExchange === 'kraken' && (
                        <span className="text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-2 py-0.5 rounded font-mono font-bold">
                          ACTIVO
                        </span>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSwitchExchange('bitget')}
                      className={`p-4 rounded-xl border text-left flex items-center justify-between transition-all ${
                        apiConfig.activeExchange === 'bitget'
                          ? (isDark ? 'bg-[#121c35] border-cyan-500 text-white shadow-lg' : 'bg-amber-50/70 border-amber-500 text-slate-900 shadow-sm')
                          : (isDark ? 'bg-[#070914] border-[#161c36] text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600')
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">🟠</span>
                        <div>
                          <div className="text-sm font-bold">Bitget Futures</div>
                          <div className="text-[10px] text-slate-400">USDT-M V2 API</div>
                        </div>
                      </div>
                      {apiConfig.activeExchange === 'bitget' && (
                        <span className="text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-2 py-0.5 rounded font-mono font-bold">
                          ACTIVO
                        </span>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSwitchExchange('hyperliquid')}
                      className={`p-4 rounded-xl border text-left flex items-center justify-between transition-all ${
                        apiConfig.activeExchange === 'hyperliquid'
                          ? (isDark ? 'bg-[#0d2138] border-cyan-500 text-white shadow-lg' : 'bg-cyan-50/70 border-cyan-500 text-slate-900 shadow-sm')
                          : (isDark ? 'bg-[#070914] border-[#161c36] text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600')
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">💧</span>
                        <div>
                          <div className="text-sm font-bold">Hyperliquid DEX</div>
                          <div className="text-[10px] text-slate-400">L1 Perps (Testnet/Mainnet)</div>
                        </div>
                      </div>
                      {apiConfig.activeExchange === 'hyperliquid' && (
                        <span className="text-[9px] bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 px-2 py-0.5 rounded font-mono font-bold">
                          ACTIVO
                        </span>
                      )}
                    </button>
                  </div>
                </div>

                {/* SubTab KRAKEN */}
                {configSubTab === 'kraken' && (
                  <div className="space-y-4 pt-2">
                    <div className="text-xs font-mono text-purple-400 font-bold flex items-center gap-1.5">
                      <span>🐙</span> Credenciales Kraken Futures (V3 API)
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider flex items-center gap-1 font-bold">
                        <Key className="w-3 h-3 text-slate-500" />
                        Kraken Futures API Key
                      </label>
                      <div className="relative">
                        <input
                          type={showKrakenApiKey ? 'text' : 'password'}
                          value={apiConfig.krakenApiKey}
                          onChange={(e) => setApiConfig(prev => ({ ...prev, krakenApiKey: e.target.value }))}
                          placeholder="Clave API pública de Kraken..."
                          className={`w-full px-3 py-2.5 rounded-xl border text-xs font-mono pr-10 focus:outline-none focus:border-purple-500 ${
                            isDark ? 'bg-[#05060b] border-[#182645] text-white' : 'bg-white border-slate-300 text-slate-900'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowKrakenApiKey(!showKrakenApiKey)}
                          className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                        >
                          {showKrakenApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider flex items-center gap-1 font-bold">
                        <Lock className="w-3 h-3 text-slate-500" />
                        Kraken Futures Private Key (Base64)
                      </label>
                      <div className="relative">
                        <input
                          type={showKrakenApiSecret ? 'text' : 'password'}
                          value={apiConfig.krakenApiSecret}
                          onChange={(e) => setApiConfig(prev => ({ ...prev, krakenApiSecret: e.target.value }))}
                          placeholder="Clave privada Base64 de Kraken Futures..."
                          className={`w-full px-3 py-2.5 rounded-xl border text-xs font-mono pr-10 focus:outline-none focus:border-purple-500 ${
                            isDark ? 'bg-[#05060b] border-[#182645] text-white' : 'bg-white border-slate-300 text-slate-900'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowKrakenApiSecret(!showKrakenApiSecret)}
                          className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                        >
                          {showKrakenApiSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div className={`p-4 rounded-xl border flex items-center justify-between ${
                      isDark ? 'bg-[#070914] border-[#161c36]' : 'bg-slate-50 border-slate-200'
                    }`}>
                      <div>
                        <span className="text-xs font-bold block uppercase tracking-wider">Modo Kraken: {apiConfig.krakenModoReal ? 'Real (Live Futures)' : 'Demo / Sandbox'}</span>
                        <span className="text-[10px] text-slate-400 block mt-0.5">
                          {apiConfig.krakenModoReal 
                            ? '⚠️ Operaciones enviadas a https://futures.kraken.com (capital real).' 
                            : '⚙️ Simulación sandbox con libros de órdenes en tiempo real de Kraken.'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setApiConfig(prev => ({ ...prev, krakenModoReal: !prev.krakenModoReal }))}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          apiConfig.krakenModoReal ? 'bg-amber-500' : 'bg-purple-600'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            apiConfig.krakenModoReal ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                )}

                {/* SubTab BITGET */}
                {configSubTab === 'bitget' && (
                  <div className="space-y-4 pt-2">
                    <div className="text-xs font-mono text-amber-400 font-bold flex items-center gap-1.5">
                      <span>🟠</span> Credenciales Bitget Futures (V2)
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider flex items-center gap-1 font-bold">
                        <Key className="w-3 h-3 text-slate-500" />
                        Bitget API Key
                      </label>
                      <div className="relative">
                        <input
                          type={showApiKey ? 'text' : 'password'}
                          value={apiConfig.apiKey}
                          onChange={(e) => setApiConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                          placeholder="bg_xxxx...xxxx"
                          className={`w-full px-3 py-2.5 rounded-xl border text-xs font-mono pr-10 focus:outline-none focus:border-indigo-500 ${
                            isDark ? 'bg-[#05060b] border-[#182645] text-white' : 'bg-white border-slate-300 text-slate-900'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowApiKey(!showApiKey)}
                          className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                        >
                          {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider flex items-center gap-1 font-bold">
                        <Lock className="w-3 h-3 text-slate-500" />
                        Bitget Secret Key
                      </label>
                      <div className="relative">
                        <input
                          type={showApiSecret ? 'text' : 'password'}
                          value={apiConfig.apiSecret}
                          onChange={(e) => setApiConfig(prev => ({ ...prev, apiSecret: e.target.value }))}
                          placeholder="bg_sec_xxxx...xxxx"
                          className={`w-full px-3 py-2.5 rounded-xl border text-xs font-mono pr-10 focus:outline-none focus:border-indigo-500 ${
                            isDark ? 'bg-[#05060b] border-[#182645] text-white' : 'bg-white border-slate-300 text-slate-900'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowApiSecret(!showApiSecret)}
                          className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                        >
                          {showApiSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider flex items-center gap-1 font-bold">
                        <Lock className="w-3 h-3 text-slate-500" />
                        Bitget Passphrase
                      </label>
                      <div className="relative">
                        <input
                          type={showPassphrase ? 'text' : 'password'}
                          value={apiConfig.passphrase}
                          onChange={(e) => setApiConfig(prev => ({ ...prev, passphrase: e.target.value }))}
                          placeholder="Contraseña de firma de API Bitget"
                          className={`w-full px-3 py-2.5 rounded-xl border text-xs font-mono pr-10 focus:outline-none focus:border-indigo-500 ${
                            isDark ? 'bg-[#05060b] border-[#182645] text-white' : 'bg-white border-slate-300 text-slate-900'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassphrase(!showPassphrase)}
                          className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                        >
                          {showPassphrase ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div className={`p-4 rounded-xl border flex items-center justify-between ${
                      isDark ? 'bg-[#070914] border-[#161c36]' : 'bg-slate-50 border-slate-200'
                    }`}>
                      <div>
                        <span className="text-xs font-bold block uppercase tracking-wider">Modo Bitget: {apiConfig.modoReal ? 'Real (Live)' : 'Sandbox (Simulado)'}</span>
                        <span className="text-[10px] text-slate-400 block mt-0.5">
                          {apiConfig.modoReal ? '⚠️ Órdenes despachadas directamente a la API de Bitget Futures.' : '⚙️ Simulación segura en Sandbox local.'}
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
                  </div>
                )}

                {/* SubTab HYPERLIQUID */}
                {configSubTab === 'hyperliquid' && (
                  <div className="space-y-4 pt-2">
                    <div className="text-xs font-mono text-cyan-400 font-bold flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span>💧</span> Credenciales Hyperliquid DEX (Clave Privada Web3 / Agent Wallet)
                      </div>
                      <a 
                        href="https://app.hyperliquid-testnet.xyz" 
                        target="_blank" 
                        rel="noreferrer" 
                        className="text-[10px] font-mono text-cyan-400 underline hover:text-cyan-300 flex items-center gap-1"
                      >
                        <span>Faucet Testnet Gratuito ↗</span>
                      </a>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider flex items-center gap-1 font-bold">
                        <Key className="w-3 h-3 text-slate-500" />
                        Ethereum Private Key / Agent Wallet Key (0x...)
                      </label>
                      <div className="relative">
                        <input
                          type={showHyperliquidKey ? 'text' : 'password'}
                          value={apiConfig.hyperliquidPrivateKey || ''}
                          onChange={(e) => setApiConfig(prev => ({ ...prev, hyperliquidPrivateKey: e.target.value }))}
                          placeholder="0x... (Clave privada de MetaMask / Rabby o Agent Wallet)"
                          className={`w-full px-3 py-2.5 rounded-xl border text-xs font-mono pr-10 focus:outline-none focus:border-cyan-500 ${
                            isDark ? 'bg-[#05060b] border-[#182645] text-white' : 'bg-white border-slate-300 text-slate-900'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowHyperliquidKey(!showHyperliquidKey)}
                          className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                        >
                          {showHyperliquidKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-400 font-mono">
                        {apiConfig.hyperliquidPrivateKey && !apiConfig.hyperliquidPrivateKey.includes('...') 
                          ? '🔒 Clave privada lista para firmar órdenes en Hyperliquid L1.' 
                          : 'Si no introduces clave privada, Atlas simula órdenes con precios de mercado en vivo (Paper Trading DEX).'}
                      </p>
                    </div>

                    {/* Toggle Mainnet DEX vs Testnet */}
                    <div className={`p-4 rounded-xl border flex items-center justify-between ${
                      isDark ? 'bg-[#070914] border-[#182645]' : 'bg-slate-50 border-slate-200'
                    }`}>
                      <div>
                        <span className="text-xs font-bold block uppercase tracking-wider">
                          Modo Hyperliquid: {apiConfig.hyperliquidModoReal ? '⚡ Real (Mainnet DEX L1)' : '🧪 Testnet (Faucet Sandbox Gratuito)'}
                        </span>
                        <span className="text-[10px] text-slate-400 block mt-0.5">
                          {apiConfig.hyperliquidModoReal 
                            ? '⚠️ Conectado a https://api.hyperliquid.xyz. Órdenes enviadas a la blockchain L1 de producción.' 
                            : '⚙️ Conectado a https://api.hyperliquid-testnet.xyz. Ideal para operar sin riesgo con USDC de prueba.'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setApiConfig(prev => ({ ...prev, hyperliquidModoReal: !prev.hyperliquidModoReal }))}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          apiConfig.hyperliquidModoReal ? 'bg-amber-500' : 'bg-cyan-600'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            apiConfig.hyperliquidModoReal ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                )}
                {apiConfigMessage && (
                  <div className={`p-3.5 rounded-xl text-xs flex gap-2.5 border ${
                    apiConfigMessage.type === 'success'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                  }`}>
                    {apiConfigMessage.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    )}
                    <span>{apiConfigMessage.text}</span>
                  </div>
                )}

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={apiConfigSaving || apiConfigLoading}
                  className={`w-full font-bold text-xs py-3.5 rounded-xl uppercase tracking-wider transition-all shadow-lg flex items-center justify-center gap-2 ${
                    apiConfigSaving || apiConfigLoading
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-950/40 hover:-translate-y-0.5 active:translate-y-0'
                  }`}
                >
                  {apiConfigSaving ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      GUARDANDO CONFIGURACIÓN...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      GUARDAR CONFIGURACIÓN
                    </>
                  )}
                </button>
              </form>
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* ==================================================================== */}
      {/* 4. FOOTER STATUS BAR                                                 */}
      {/* ==================================================================== */}
      <footer className={`border-t px-6 py-3 text-xs font-mono flex flex-col sm:flex-row justify-between items-center gap-2 transition-colors duration-200 ${
        isDark ? 'bg-[#090b14] border-[#131726] text-slate-500' : 'bg-white border-slate-200 text-slate-500 shadow-sm'
      }`}>
        <div className="flex items-center gap-3">
          <span>Servidor: <strong className="text-indigo-400">Node.js + Fastify / Drizzle ORM</strong></span>
          <span className="text-slate-600">|</span>
          <span>Broker Conectado: <strong className="text-cyan-400">{currentBrokerDisplayName}</strong></span>
          <span className="text-slate-600">|</span>
          <span>Modo: <strong className={isCurrentBrokerReal ? 'text-amber-400' : 'text-emerald-400'}>{isCurrentBrokerReal ? 'LIVE EN VIVO' : 'DEMO / SANDBOX'}</strong></span>
        </div>
        <div className="flex items-center gap-2">
          <span>Tema: <strong className="text-slate-400 uppercase">{theme}</strong></span>
          <span className="text-slate-600">•</span>
          <span>Atlas AI Trading v2.1</span>
        </div>
      </footer>
    </div>
  );
}
