# 🧠 Atlas AI Trading

**Plataforma de trading algorítmico multi-agente para criptomonedas**, construida sobre una arquitectura *Blackboard* donde 10 agentes especializados analizan el mercado en tiempo real y un Supervisor cognitivo, respaldado por un firewall de riesgo determinista, decide si una operación es segura antes de ejecutarla en Bitget.

> ⚠️ **Este proyecto opera con dinero real cuando `BITGET_MODO_REAL=true`.** Lee la sección [Seguridad y modo real](#-seguridad-y-modo-real) antes de activarlo.

---

## 📋 Tabla de contenidos

- [¿Qué hace este bot?](#-qué-hace-este-bot)
- [Arquitectura](#-arquitectura)
- [Los agentes](#-los-agentes)
- [Stack tecnológico](#-stack-tecnológico)
- [Puesta en marcha](#-puesta-en-marcha)
- [Variables de entorno](#-variables-de-entorno)
- [Base de datos](#-base-de-datos)
- [Ejecución](#-ejecución)
- [Seguridad y modo real](#-seguridad-y-modo-real)
- [Roadmap](#-roadmap)

---

## 🎯 ¿Qué hace este bot?

Atlas AI Trading vigila uno o varios pares de criptomonedas en Bitget Futures y, en cada ciclo de análisis:

1. **Recoge datos reales de mercado** — velas OHLC, order book, funding rate, open interest, correlaciones macro, índice de miedo/codicia, noticias y métricas on-chain.
2. **Distribuye ese contexto entre 10 agentes especializados**, cada uno con su propia lógica cuantitativa y, en los agentes cognitivos, razonamiento asistido por Gemini.
3. **Consolida todos los diagnósticos en un Supervisor** que pondera los scores de cada agente según pesos calibrables y el régimen de mercado detectado.
4. **Pasa la decisión final por un firewall de riesgo determinista** (`RiskManagerAgent`) que calcula tamaño de posición, stop-loss y take-profit con Kelly Criterion — y que **bloquea la operación** si no puede verificar drawdown, spread o precio reales.
5. **Ejecuta (o no) la orden en Bitget**, con soporte para cuenta demo y cuenta real completamente separadas.

Todo el proceso queda auditado: cada assessment de cada agente se escribe en un *Blackboard* compartido y persiste en Postgres para trazabilidad histórica.

---

## 🏗️ Arquitectura

```
                    ┌─────────────────────────────┐
                    │   Frontend (React 19 + Vite) │
                    │   Dashboard de Telemetría     │
                    └───────────────┬──────────────┘
                                    │
                    ┌───────────────▼──────────────┐
                    │   Gateway Express (:3000)     │
                    │   Sirve frontend + proxy /api │
                    └───────────────┬──────────────┘
                                    │
                    ┌───────────────▼──────────────┐
                    │  Backend Fastify (:3001)      │
                    │  API de Telemetría v1         │
                    │  (protegida con Bearer token)  │
                    └───────────────┬──────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
┌───────▼────────┐        ┌─────────▼─────────┐       ┌─────────▼─────────┐
│   Orchestrator   │        │     Blackboard      │       │   Execution Layer   │
│  (Fast/Slow Loop) │◄──────►│  (Estado compartido) │◄─────►│  BitgetBroker (real) │
└───────┬────────┘        └─────────────────────┘       └─────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────────────┐
│                         10 Agentes Especializados                      │
│  Technical · OrderFlow · Liquidation · Sentiment · Correlation ·        │
│  Divergence · News · OnChain · RiskManager · Supervisor                 │
└───────────────────────────────────────────────────────────────────────┘
```

El sistema separa dos velocidades de ejecución:

- **Fast-Loop** — agentes cuantitativos deterministas (Technical, OrderFlow, Divergence, Correlation) que corren cada pocos segundos sobre datos numéricos puros.
- **Slow-Loop** — agentes cognitivos (Sentiment, News, OnChain, Liquidation, Supervisor) que invocan a Gemini para razonar sobre el contexto, con timeout de seguridad para no bloquear el ciclo.

---

## 🤖 Los agentes

| Agente | Tipo | Fuente de datos real | Qué hace |
|---|---|---|---|
| **TechnicalAnalyst** | Fast-Loop | Velas OHLC de Bitget (klines API v2) | RSI, MACD, Bollinger, ADX, VWAP + análisis cognitivo de estructura de mercado (Wyckoff, SMC/ICT) sobre la serie real |
| **OrderFlow** | Fast-Loop | Order book y ticker de Bitget | Imbalance de liquidez, CVD, tendencia de Open Interest, detección de stop-hunting |
| **Divergence** | Fast-Loop | Velas reales (reutilizadas del Technical) | Detección de divergencias alcistas/bajistas (regulares y ocultas) sobre pivotes reales de RSI, MACD, OBV y volumen |
| **Correlation** | Fast-Loop | Yahoo Finance (BTC, ETH, NASDAQ, SP500, DXY, VIX, Oro) | Correlación de Pearson y Beta de mercado, alineadas por fecha real, con alertas de desacople anómalo |
| **Liquidation** | Slow-Loop | Order book real de Bitget + Gemini | Estimación de pools de liquidación por apalancamiento retail y riesgo de short/long squeeze (Wyckoff Spring/Upthrust) |
| **Sentiment** | Slow-Loop | Fear & Greed Index (alternative.me) + Gemini | Psicología de masas, detección de sesgos (FOMO, pánico) |
| **News** | Slow-Loop | RSS de Cointelegraph + Gemini | Impacto de noticias macro (FED, SEC, regulación) sobre el activo |
| **OnChain** | Slow-Loop | blockchain.info (solo BTC) + Gemini | Actividad de red, congestión de mempool, señales NVT |
| **RiskManager** | Firewall | Tabla `trades` (Postgres) + order book real | Drawdown real, spread real, Kelly Criterion, stop-loss/take-profit por ATR. **Bloquea la operación si no puede verificar los datos** |
| **Supervisor** | Consenso | Scores ponderados de todos los agentes + Gemini | Consenso final BUY/SELL/HOLD con comité cognitivo de veto |

Cada agente escribe su assessment (`score`, `confidence`, `dataSource`, `justificación`) en el Blackboard. Ningún agente sustituye un dato real ausente por un valor inventado: si una fuente falla, el agente se marca como `UNAVAILABLE` con confianza baja en lugar de generar una señal falsa.

---

## 🛠️ Stack tecnológico

- **Frontend:** React 19, Vite 6, TailwindCSS 4, Framer Motion, Lucide Icons
- **Backend:** Express (gateway) + Fastify (API de telemetría), TypeScript, tsx
- **Base de datos:** PostgreSQL + Drizzle ORM
- **IA:** Google Gemini (`@google/genai`)
- **Exchange:** Bitget Futures API v2 (REST, firma HMAC)
- **Autenticación:** Firebase Auth (opcional) + Bearer token administrativo

---

## 🚀 Puesta en marcha

### Requisitos previos

- Node.js 20+
- PostgreSQL 14+ (local o en contenedor)
- Una API key de [Google AI Studio](https://aistudio.google.com/) (Gemini)
- (Opcional) Credenciales de API de Bitget si vas a operar, aunque sea en modo demo

### Instalación

```bash
git clone https://github.com/jsoto-06/Atlas-AI-Trading.git
cd Atlas-AI-Trading
npm install
```

### Configuración

Copia el archivo de ejemplo y rellena tus valores:

```bash
cp .env.example .env
```

---

## 🔑 Variables de entorno

| Variable | Obligatoria | Descripción |
|---|---|---|
| `GEMINI_API_KEY` | ✅ | API key de Google AI Studio para los agentes cognitivos |
| `DATABASE_URL` | ✅ | Cadena de conexión Postgres, formato `postgres://usuario:password@host:5432/nombre_bd` |
| `ADMIN_API_TOKEN` | ✅ | Token largo y aleatorio para proteger los endpoints administrativos. Genéralo con `openssl rand -hex 32` y **nunca lo compartas ni lo subas al repositorio** |
| `BITGET_API_KEY` / `BITGET_API_SECRET` / `BITGET_PASSPHRASE` | Opcional | Credenciales de Bitget. Necesarias para operar (incluso en modo demo) |
| `BITGET_MODO_REAL` | Opcional | `false` (por defecto) para cuenta demo de Bitget, `true` para dinero real |
| `CORS_ALLOWED_ORIGINS` | Opcional | Orígenes permitidos, separados por coma. `*` en desarrollo |
| `APP_URL` | Opcional | URL pública de la aplicación si se despliega en Cloud Run u otro servicio |

---

## 🗄️ Base de datos

El proyecto usa Drizzle ORM. Aplica el esquema con:

```bash
npx drizzle-kit push
```

Tablas principales: `users`, `trades`, `supervisorDecisions`, `auditLogs`, `learningPerformance`, `marketCandles`, `marketTickers`, `settings`.

---

## ▶️ Ejecución

**Desarrollo** (levanta el gateway Express + Fastify + Vite en modo dev):

```bash
npm run dev
```

La aplicación queda disponible en `http://localhost:3000`. El backend de telemetría corre internamente en el puerto `3001` y se accede vía proxy en `/api`.

**Producción:**

```bash
npm run build
npm start
```

---

## 🔐 Seguridad y modo real

- Los endpoints administrativos (`POST /api/v1/telemetry/config`, `GET /config`, `GET /balances`) requieren el header `Authorization: Bearer <ADMIN_API_TOKEN>`. Sin ese token configurado, el acceso queda bloqueado por defecto (fail-safe).
- El `RiskManagerAgent` es el último guardián antes de cualquier operación: si no puede verificar el drawdown real, el spread real o el precio de mercado real, **rechaza la operación automáticamente**, sin excepciones.
- Recomendación: opera en modo demo (`BITGET_MODO_REAL=false`) durante un periodo prolongado, revisando las decisiones del dashboard, antes de considerar activar el modo real.
- Ninguno de los agentes genera datos sintéticos como sustituto de una fuente real caída — todos se marcan como `UNAVAILABLE` para que el Supervisor y el RiskManager operen con información honesta sobre lo que sí y no se sabe en cada ciclo.

---

## 🗺️ Roadmap

- [ ] Integración on-chain para activos distintos de BTC
- [ ] Fuentes de sentimiento social reales (X/Twitter, Reddit) cuando haya presupuesto para APIs de pago
- [ ] Mapa de liquidaciones con datos de proveedores especializados (Coinglass o similar)
- [ ] Backtesting histórico contra el motor de agentes actual

---

<p align="center">Construido con TypeScript, Drizzle, Fastify y un firewall de riesgo que no se fía de nada que no pueda verificar.</p>
