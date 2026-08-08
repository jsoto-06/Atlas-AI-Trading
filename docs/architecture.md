# Institutional-Grade AI Algorithmic Trading Platform (Blackboard Architecture)
## System Architecture & Folder Structure Specification

---

## 1. Executive Architectural Analysis & Critique

Before writing any implementation code, we perform a senior-level architectural analysis of the proposed multi-agent system. 

### 1.1 Identified Bottlenecks & Strategic Solutions

| Bottleneck / Risk | Description | Mitigation Strategy / Solution |
| :--- | :--- | :--- |
| **Network I/O Latency** | Agents fetching data from multiple external sources (Exchange APIs, social sentiment, on-chain scrapers, news sources) will suffer from concurrent network blocks. | **Non-blocking Reactive Async Engine**: Agents operate as isolated asynchronous micro-services. All external fetches use non-blocking HTTP pooling, aggressive caching (Redis/In-Memory), and circuit breakers (`opossum`). |
| **Cascade Failure** | A single malfunctioning or rate-limited agent (e.g., Sentiment/News) blocking the decision flow of the entire system. | **Decoupled Blackboard (Blackboard Pattern)**: Agents never communicate directly. They push and subscribe to a central, event-driven state container (Blackboard). The Supervisor decides based on available, highly-fresh data, scaling down weights for degraded agents. |
| **Data Integrity & Consistency** | High-frequency telemetry, prompts, and audit trails could choke database writing performance. | **Buffered Async Loggers**: All audit logs are written to an in-memory buffer and flushed in batches to the persistent database (PostgreSQL/Cloud SQL). This prevents synchronous DB locks from stalling execution. |
| **API Rate Limits** | Severe rate-limits on Twitter/X, News APIs, and CoinDesk when scaled 24/7. | **Staggered Pollers & Cache Layer**: The platform implements deterministic cache keys. Frequency of execution is managed via cron-based pollers rather than on-demand fetches. |
| **Over-fitting in Backtesting** | The Backtesting agent relying purely on standard static periods may suggest strategies that fail in live regimes. | **Walk-Forward Analysis (WFA)**: The Backtesting agent performs sliding-window optimizations to ensure parameter stability across diverse market conditions before approval. |

---

## 2. Platform Paradigm: Event-Driven Blackboard Pattern

### 2.1 The Core Blackboard Engine
The **Blackboard** is the system's central memory. It acts as an asynchronous, thread-safe, reactive state store.

```
       ┌────────────────────────┐
       │   Technical Analyst    ├────────┐
       └────────────────────────┘        │
       ┌────────────────────────┐        │     ┌────────────────────────┐
       │      Sentiment         ├────────┼────►│                        │
       └────────────────────────┘        │     │                        │
       ┌────────────────────────┐        ├────►│       BLACKBOARD       │
       │       On-Chain         ├────────┼────►│     (Central State)    │
       └────────────────────────┘        │     │                        │
       ┌────────────────────────┐        │     │                        │
       │     ... (All Agents)   ├────────┘     └───────────┬────────────┘
       └────────────────────────┘                          │
                                                           ▼
                                               ┌────────────────────────┐
                                               │    Supervisor Agent    │
                                               └───────────┬────────────┘
                                                           │ (Approved?)
                                                           ▼
                                               ┌────────────────────────┐
                                               │   Risk Manager Agent   │
                                               └───────────┬────────────┘
                                                           │ (Under Limits?)
                                                           ▼
                                               ┌────────────────────────┐
                                               │    Execution Agent     │
                                               └────────────────────────┘
```

### 2.2 Core Operational Flow
1. **Ingress**: Schedulers trigger the individual **Data Ingestion Pollers**.
2. **Analysis**: Agents processes raw ingestion data, interact with LLM models (via Google Gemini for advanced context analysis like chart pattern interpretation or sentiment classification), and write standardized JSON evaluations directly to the **Blackboard**.
3. **State Change**: Writing to the Blackboard fires state events.
4. **Supervision**: The **Supervisor Agent** evaluates the collective board status. Once a predetermined quorum of agents has written fresh assessments, the Supervisor scores the asset.
5. **Risk Inspection**: If the Supervisor triggers a signal, the **Risk Manager Agent** inspects structural criteria (volatility, position size, Stop-Loss/Take-Profit calculations, ATR bounds, Kelly Criterion) to authorize or block.
6. **Execution**: The **Execution Agent** places orders via CCXT (Bitget Testnet/Live).
7. **Post-Trade Loops**: The **Learning Agent** records outcomes for hyperparameter auto-tuning, the **Audit Agent** indexes the complete decision tree, and the **Notification Agent** alerts channels (Telegram/Discord).

---

## 3. High-Performance Runtime Environment

Our environment is optimized for Node.js (Vite + Express + React). We will construct this system using an institutional-grade TypeScript/Node.js full-stack framework.

### 3.1 Why TypeScript/Node.js is Superior for this Trading Engine:
1. **Asynchronous Parallelism**: Node's event loop handles thousands of concurrent WebSocket connections and API calls (Bitget, Sentiment, News) with extremely low CPU overhead compared to Python's multi-threading or multi-processing limits.
2. **Unified Stack**: React-based quantitative UI dashboards integrate seamlessly with the Express backend using high-performance Shared Memory structures, WebSockets, and Server-Sent Events (SSE).
3. **Type Safety**: TypeScript provides compilation-time guarantees for financial objects (Order, Position, Tick, Signal), preventing runtime errors.
4. **Google Gemini SDK**: Node.js natively supports the official high-performance `@google/genai` library, facilitating real-time multimodal chart analysis and reasoning.

---

## 4. Phase 2: Complete Folder Structure Specification

To enforce complete decoupling, domain isolation, and modularity, we define the following directory design. This layout allows adding exchanges (e.g. Binance, OKX) or new agents without modifying the core orchestrator or other modules.

```
/
├── .env.example                       # Reference environment configuration
├── .gitignore                         # Build and credentials exclusions
├── index.html                         # Entry point for Vite Single Page Application
├── metadata.json                      # Application metadata and capabilities
├── package.json                       # Core dependencies (Express, @google/genai, React, etc.)
├── tsconfig.json                      # Compiler options
├── vite.config.ts                     # Bundling & HMR controls
│
├── docs/                              # System Architecture, Schemas, & Setup docs
│   └── architecture.md                # [THIS FILE] System architectural blueprint
│
├── src/                               # Main Source Root
│   ├── main.tsx                       # Frontend React entry point
│   ├── index.css                      # Global Tailwind styling
│   ├── App.tsx                        # Frontend App root
│   │
│   ├── types.ts                       # Shared typescript interfaces, enums, & financial types
│   │
│   ├── server.ts                      # Full-stack backend launcher (Express + Vite server)
│   │
│   ├── core/                          # Core Execution & Storage Engine
│   │   ├── blackboard.ts              # Thread-safe in-memory Blackboard state container
│   │   ├── orchestrator.ts            # State-machine that drives step-by-step agent triggers
│   │   └── scheduler.ts               # Cron & polling system for multi-timeframe agent triggers
│   │
│   ├── db/                            # Persistent Database Layer
│   │   ├── index.ts                   # Drizzle pool configuration (Object-method)
│   │   ├── schema.ts                  # Relational tables (Users, Trades, AuditLogs, Parameters)
│   │   └── users.ts                   # Safe user registration helper (onConflictUpsert)
│   │
│   ├── integrations/                  # Third-party Infrastructure Adapters
│   │   ├── exchange/                  # Exchange connection wrappers
│   │   │   ├── base-exchange.ts       # Abstract interface defining Spot/Futures capabilities
│   │   │   ├── bitget.ts              # Bitget exchange adapter implementing base-exchange
│   │   │   └── exchange-factory.ts    # Factory pattern to support future exchanges dynamically
│   │   │
│   │   ├── gemini.ts                  # Safe server-side Gemini client wrapper
│   │   └── notifications.ts           # Standardized Telegram, Discord, and Email gateway
│   │
│   ├── agents/                        # Autonomous Decision Agents
│   │   ├── base-agent.ts              # Abstract base class defining common agent lifecycles
│   │   │
│   │   ├── technical-analyst/         # 1. Technical Analyst Agent
│   │   │   ├── index.ts               # Core logic (indicators + Gemini multimodal chart analysis)
│   │   │   └── indicators.ts          # Pure math functions: RSI, MACD, EMA, VWAP, ATR
│   │   │
│   │   ├── news/                      # 2. News Agent (Sentiment scoring of rss/scrap feeds)
│   │   ├── sentiment/                 # 3. Sentiment Agent (X/Reddit/Fear & Greed scraper)
│   │   ├── on-chain/                  # 4. On-Chain Agent (Inflows, outflows, whale trackers)
│   │   ├── order-flow/                # 5. Order Flow Agent (DOM, CVD, Funding Rates)
│   │   ├── correlation/               # 6. Correlation Agent (Beta analysis with DXY, SP500, Gold)
│   │   ├── backtesting/               # 7. Backtesting Agent (Walk-Forward simulations)
│   │   ├── risk-manager/              # 8. Risk Manager Agent (Kelly Criterion, Stop sizing, SL/TP)
│   │   ├── divergence/                # 9. Divergence Agent (RSI/MACD structural mismatches)
│   │   ├── liquidation/               # 10. Liquidation Agent (Squeeze and Stop-Hunting hunting)
│   │   ├── supervisor/                # 11. Supervisor Agent (Blackboard consensus evaluator)
│   │   ├── execution/                 # 12. Execution Agent (Orders routing and state mapping)
│   │   ├── learning/                  # 13. Learning Agent (Operation outcome optimization)
│   │   ├── audit/                     # 14. Audit Agent (Traceable system logging)
│   │   └── notification-agent/        # 15. Notification Agent (Dispatching triggers)
│   │
│   └── components/                    # High-fidelity dashboard UI Components
│       ├── Layout.tsx                 # Base App frame
│       ├── BlackboardMonitor.tsx      # Real-time state matrix visualization
│       ├── AgentConsole.tsx           # Telemetry and reasoning output logs
│       ├── TradeTerminal.tsx          # Real-time manual / semi-auto trading controls
│       └── SystemMetrics.tsx          # CPU, latency, error rate, and wallet health metrics
```

---

## 5. Next Planned Action (Phase 3: Database & ORM Schema)

Upon receiving user approval for this structural blueprint and architectural analysis:
1. We will install the required database packages (`drizzle-orm`, `drizzle-kit`, `pg`, `@types/pg`).
2. We will initialize the complete PostgreSQL Drizzle schema inside `src/db/schema.ts` supporting full multi-tenant security, audit logs, trade tracking, and learning metrics.
3. We will write `src/db/index.ts` containing the object-method connection pool and `src/db/users.ts` for registration.

---

*This document defines the complete architectural foundation. Please review and provide your authorization to proceed with Phase 3.*
