<div align="center">

# ⚡ ATLAS AI TRADING v2.0.0
### *INSTITUTIONAL-GRADE ADAPTIVE MULTI-AGENT TRADING SYSTEM*

[![TypeScript](https://img.shields.io/badge/TypeScript-5.8+-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.0+-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![React](https://img.shields.io/badge/React-19.0+-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://reactjs.org/)
[![Vitest](https://img.shields.io/badge/Vitest-3.0+-6E9F18?style=for-the-badge&logo=vitest&logoColor=white)](https://vitest.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15%2F18-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle-ORM-C5F74F?style=for-the-badge&logo=drizzle&logoColor=black)](https://orm.drizzle.team/)
[![Bitget API](https://img.shields.io/badge/Bitget-Futures_V2-00F2FE?style=for-the-badge&logo=crypto&logoColor=black)](https://www.bitget.com/)
[![Google Gemini](https://img.shields.io/badge/Google_Gemini-2.4-8E75B2?style=for-the-badge&logo=googleai&logoColor=white)](https://ai.google.dev/)
[![License](https://img.shields.io/badge/License-Apache_2.0-green?style=for-the-badge)](LICENSE)

**Plataforma de Trading Algorítmico Cuantitativo Autónomo para Criptomonedas (BTC, ETH, SOL)**  
*Impulsada por Consenso Multi-Agente Desacoplado (Patrón Blackboard), Aprendizaje Bayesiano Dinámico, Firewall de Riesgo Kelly Fraccional y Persistencia Fail-Closed.*

[Visitar Repositorio GitHub](https://github.com/jsoto-06/Atlas-AI-Trading.git) • [Reportar un Bug](https://github.com/jsoto-06/Atlas-AI-Trading/issues)

</div>

---

## 📑 Tabla de Contenidos
- [📌 Descripción General](#-descripción-general)
- [🛡️ Estado de Auditoría e Integridad del Código](#️-estado-de-auditoría-e-integridad-del-código)
- [🐘 Configuración e Integración con PostgreSQL](#-configuración-e-integración-con-postgresql)
- [🏛️ Arquitectura del Sistema Multi-Agente](#️-arquitectura-del-sistema-multi-agente)
- [🔬 Agentes Especialistas y Fórmulas Matemáticas](#-agentes-especialistas-y-fórmulas-matemáticas)
  - [1. Motor de Aprendizaje Bayesiano (`LearningAgent`)](#1-motor-de-aprendizaje-bayesiano-learningagent)
  - [2. Firewall de Riesgo Cuantitativo (`RiskManager`)](#2-firewall-de-riesgo-cuantitativo-riskmanager)
  - [3. Orquestador de Consenso (`SupervisorAgent`)](#3-orquestador-de-consenso-supervisoragent)
- [👥 Tabla Detallada de Agentes del Sistema](#-tabla-detallada-de-agentes-del-sistema)
- [⚡ Integración Bitget Futures V2 API](#-integración-bitget-futures-v2-api)
- [📊 Benchmarks de Backtesting Walk-Forward](#-benchmarks-de-backtesting-walk-forward)
- [📡 Referencia de API REST](#-referencia-de-api-rest)
- [🗂️ Estructura del Proyecto](#️-estructura-del-proyecto)
- [🚀 Instalación y Despliegue](#-instalación-y-despliegue)
- [📜 Licencia](#-licencia)

---

## 📌 Descripción General

**ATLAS AI TRADING** es un ecosistema institucional desacoplado de trading algorítmico diseñado para operar contratos de futuros perpetuos en criptomonedas (**BTC/USDT**, **ETH/USDT**, **SOL/USDT**). 

A diferencia de los bots tradicionales basados en reglas estáticas, ATLAS emplea una **red de 11 agentes autónomos especialistas** que evalúan el mercado de manera simultánea e independiente desde múltiples ángulos: análisis de estructura Smart Money Concepts (SMC/ICT), flujo de órdenes (*orderbook imbalance*), mapas de calor de liquidaciones, divergencias en osciladores, sentimiento del mercado e impacto cualitativo de noticias impulsado por **Google Gemini AI**.

El sistema opera bajo el principio estricto de **Fail Closed → NO TRADE**: ante cualquier inconsistencia de red, falla de base de datos o ausencia de datos históricos en entornos de producción/prueba, la orden es inmediatamente bloqueada para garantizar la protección del capital.

---

## 🛡️ Estado de Auditoría e Integridad del Código

En agosto de 2026, el proyecto fue sometido a la **Auditoría Forense Completa v4** resolviendo al 100% las 13 vulnerabilidades críticas (C01 - C13):

- **Puntuación Pre-Auditoría:** `15/100` (NOT PRODUCTION READY)
- **Puntuación Post-Auditoría Forense v4:** `92/100` (READY FOR PAPER / BITGET DEMO)
- **Pruebas Automatizadas:** 17/17 pruebas unitarias e integrales pasadas exitosamente (Vitest).

### Correcciones Forenses Destacadas (v4):
1. **Persistencia Estricta y Fail-Closed DB (`clientOid` Binding C01/C02):** `1 Intención Lógica = 1 clientOid` registrado obligatoriamente en PostgreSQL antes de enviar cualquier orden por red. Si PostgreSQL falla o está desconectado en entorno real/test, el despacho se aborta inmediatamente.
2. **Máquina de Estados de Arranque (C03):** Reconciliación estricta al inicio (`STARTING` $\rightarrow$ `RECONCILING` $\rightarrow$ `READY` $\rightarrow$ `TRADING`). Ante errores críticos, pasa a `FAILED_SAFE` bloqueando el trading.
3. **Bloqueo de Bypass de Riesgo (C04):** `/test-order` devuelve `403 Forbidden` en producción y ejecuta obligatoriamente el `RiskManagerAgent`.
4. **Backtesting Walk-Forward sin Look-ahead Bias (C06):** Precios alineados de forma justa (Señal en Vela N $\rightarrow$ Ejecución en Precio Open de Vela N+1).
5. **Aislamiento de Concurrencia y Ciclos (C07/C08):** Pizarra rechaza datos expirados (`STALE_DATA_REJECTED`) y aplica cerrojos (`symbolLocks`) por activo.

---

## 🐘 Configuración e Integración con PostgreSQL

ATLAS AI TRADING utiliza **PostgreSQL** para la persistencia auditada de órdenes, ejecuciones, decisiones del supervisor y logs de telemetría mediante **Drizzle ORM**.

### Pasos de Configuración en Windows / Local:

1. **Instalar PostgreSQL y pgAdmin 4:**
   - Descarga e instala PostgreSQL 15 o superior.
   - En la pantalla final de Stack Builder, haz clic en **Cancel** (ya tienes pgAdmin 4 y el servidor de BD instalados).

2. **Crear la Base de Datos en pgAdmin 4:**
   - Abre **pgAdmin 4** desde el menú Inicio.
   - Despliega **Servers** $\rightarrow$ **PostgreSQL**.
   - Haz clic derecho en **Databases** $\rightarrow$ **Create** $\rightarrow$ **Database...**
   - Nombre de la base de datos: **`atlas_trading`**. Haz clic en **Save**.

3. **Configurar el Archivo `.env`:**
   Configura tus credenciales en el archivo `.env`:
   ```env
   SQL_HOST="localhost"
   SQL_USER="postgres"
   SQL_PASSWORD="tu_password_real"
   SQL_DB_NAME="atlas_trading"
   ```

4. **Ejecutar las Migraciones de Tablas (Drizzle Kit):**
   ```powershell
   npx drizzle-kit push:pg
   ```
   Esto creará automáticamente las tablas: `orders`, `trades`, `audit_logs`, `supervisor_decisions` y `settings`.

---

## 🏛️ Arquitectura del Sistema Multi-Agente

```mermaid
flowchart TD
    subgraph Capa1["Capa 1: Agentes Analistas Especialistas (FAST / SLOW)"]
        TA["TechnicalAnalyst\n(SMC/ICT, Session VWAP, RSI, MACD)"]
        OF["OrderFlowAnalyst\n(Bid/Ask Imbalance & Book Depth)"]
        CO["CorrelationAnalyst\n(Cross Correlation BTC/ETH/SOL)"]
        DV["DivergenceAnalyst\n(Bullish/Bearish Regular & Hidden)"]
        LQ["LiquidationAnalyst\n(Liquidity Pools & Squeezes)"]
        ST["SentimentAnalyst\n(Fear & Greed Index Live)"]
        NW["NewsAnalyst\n(Cointelegraph RSS + Gemini AI)"]
    end

    subgraph Capa2["Capa 2: Tuning Bayesiano y Orquestación de Consenso"]
        LA["LearningAgent\n(Beta Conjugate Prior & Laplace Smoothing)"]
        SA["SupervisorAgent\n(Consenso Ponderado [-100, +100])"]
    end

    subgraph Capa3["Capa 3: Gobernanza de Riesgo y Persistencia Fail-Closed"]
        RM["RiskManager\n(Quarter-Kelly, ATR Stop Loss, Max 2% Risk)"]
        OM["OrderManager & PostgreSQL\n(Fail-Closed clientOid & StateMachine)"]
        EX["OrderRouter / BitgetBroker\n(Bitget Futures V2 REST & WebSocket)"]
    end

    Capa1 -->|Señales & Confianza| LA
    LA -->|Pesos Adaptados 0.70x - 1.40x| SA
    SA -->|Decisión BUY / SELL / HOLD| RM
    RM -->|Orden Validada con TP/SL| OM
    OM -->|Persistencia DB Fail-Closed| EX
```

---

## 🔬 Agentes Especialistas y Fórmulas Matemáticas

### 1. Motor de Aprendizaje Bayesiano (`LearningAgent`)
El `LearningAgent` implementa un modelo de distribución **Beta Conjunta con Suavizado de Laplace** para medir la fiabilidad de cada analista basándose en sus operaciones ganadas ($w$) y perdidas ($l$):

$$\text{Expectativa Posterior } E[\theta_i] = \frac{w_i + 1}{w_i + l_i + 2}$$

A partir de esta expectativa posterior, se calcula un **Multiplicador Bayesiano Dinámico** ($M_i$) acotado entre $0.70\times$ y $1.40\times$:

$$M_i = \text{clamp}\left(0.70, \frac{E[\theta_i]}{\text{Benchmark Base}}, 1.40\right)$$

### 2. Firewall de Riesgo Cuantitativo (`RiskManager`)
El cálculo del tamaño de posición utiliza la fórmula de **Quarter-Kelly**:

$$f^* = \frac{1}{4} \cdot \left( p - \frac{1 - p}{b} \right)$$

*Donde:*
* $p$ = Tasa de acierto **empírica real** desde la base de datos (mínimo 20 operaciones).
* $b$ = Ratio Riesgo/Beneficio estimado ($RRR \ge 2.0$).
* **Hard Cap de Riesgo:** Máximo **2.0% del capital total expuesto** por operación. Si no hay suficiente historial, aplica un sizing conservador predeterminado del **1.0%**.

### 3. Orquestador de Consenso (`SupervisorAgent`)
El `SupervisorAgent` normaliza y pondera los votos de todos los analistas activos aplicando los multiplicadores Bayesianos:

$$\text{Score Final} = \frac{\sum_{i=1}^{N} \text{Score}_i \cdot \text{Confianza}_i \cdot M_i}{\sum_{i=1}^{N} \text{Confianza}_i \cdot M_i}$$

* **Score > +25**: Genera señal de compra (**BUY / LONG**).
* **Score < -25**: Genera señal de venta (**SELL / SHORT**).
* **-25 ≤ Score ≤ +25**: Mantiene posición (**HOLD / NEUTRAL**).

---

## 👥 Tabla Detallada de Agentes del Sistema

| Agente | Tipo | Métrica / Enfoque | Descripción y Función |
| :--- | :---: | :---: | :--- |
| **`TechnicalAnalyst`** | `FAST` | SMC / ICT / Session VWAP | Identifica bloques de orden (*Order Blocks*), vacíos de liquidez (*FVG*) y VWAP anclado. |
| **`OrderFlow`** | `FAST` | Bid/Ask Imbalance | Escanea la profundidad del libro de órdenes para medir la presión compradora/vendedora. |
| **`Correlation`** | `FAST` | Matriz de Correlación | Analiza desacoples y convergencias de precios entre BTC/USDT, ETH/USDT y SOL/USDT. |
| **`Divergence`** | `FAST` | RSI / MACD | Detecta divergencias alcistas/bajistas (regulares y ocultas) anticipando giros de tendencia. |
| **`Liquidation`** | `FAST` | Pools de Liquidez | Mapea zonas de stop-loss masivos e identifica niveles candidatos a *short/long squeezes*. |
| **`Sentiment`** | `SLOW` | Fear & Greed Index | Mide el sentimiento cuantitativo del mercado en tiempo real. |
| **`NewsAnalyst`** | `SLOW` | Cointelegraph / Gemini AI | Escanea noticias en tiempo real e interpreta su impacto cualitativo en el precio usando IA. |
| **`LearningAgent`** | `TUNING` | Laplace / Beta Prior | Ajusta los pesos de votación de los agentes entre **0.70x y 1.40x** según su rendimiento histórico. |
| **`SupervisorAgent`** | `MASTER` | Consenso Ponderado | Consolida las señales en una puntuación normalizada `[-100, +100]` y define la dirección final. |
| **`RiskManager`** | `CONTROL` | Quarter-Kelly / ATR | Firewall de riesgo con Hard Cap del 2%, Stop-Loss ATR y Trailing Stop. |
| **`BitgetBroker`** | `EXECUTION` | Bitget API V2 | Ejecuta órdenes en **Bitget Futures V2 API** en modo **Demo (SBTCSUSDT/SUSDT)** o **Real (BTCUSDT/USDT)**. |

---

## ⚡ Integración Bitget Futures V2 API

El sistema incluye un conector nativo para **Bitget Futures V2 API**:

* **Autenticación HMAC-SHA256**: Firmado dinámico de cabeceras (`ACCESS-KEY`, `ACCESS-SIGN`, `ACCESS-TIMESTAMP`, `ACCESS-PASSPHRASE`).
* **Sincronización Dual de Entornos**:
  * **Modo Demo (Sandbox)**: `BITGET_MODO_REAL="false"`, usa contratos `SUSDT-FUTURES` y pares simulados como `SBTCSUSDT`.
  * **Modo Real**: `BITGET_MODO_REAL="true"`, usa contratos `USDT-FUTURES` y pares reales como `BTCUSDT`.
* **Filtrado Estricto de Posiciones:** Previene colisiones consultando exactamente la posición correspondiente al símbolo solicitado.
* **Actualización 2026‑08‑12:** Se añadió `marginCoin` y `reduceOnly` al payload de cierre de posición para garantizar idempotencia y correcto funcionamiento en modo Demo y Real.

---

## 📊 Benchmarks de Backtesting Walk-Forward

Resultados deterministas sobre datos históricos reales (Capital Inicial: **$10,000 USD**):

| Par | Ventana | Trades | Win Rate | Profit Factor | Max Drawdown | Estado |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **BTC/USDT** | **30 Días** | 9 | **44.4%** | **1.96** | **-4.88%** | 🟢 Ganador |
| **SOL/USDT** | **30 Días** | 20 | **40.0%** | **1.45** | **-4.84%** | 🟢 Ganador |
| **ETH/USDT** | **30 Días** | 19 | **36.8%** | **1.26** | **-4.03%** | 🟢 Ganador |
| **SOL/USDT** | **14 Días** | 10 | **40.0%** | **1.56** | **-3.67%** | 🟢 Ganador |
| **ETH/USDT** | **14 Días** | 11 | **36.4%** | **1.29** | **-4.07%** | 🟢 Ganador |

---

## 📡 Referencia de API REST

El servidor expone endpoints REST en **Fastify** (Puerto 3001) accesibles desde el Frontend o clientes externos:

### 1. Health Check de Base de Datos y Motor
```http
GET /health
```
```json
{
  "status": "HEALTHY",
  "database": "CONNECTED",
  "uptime": 142.5,
  "timestamp": 1786359431000
}
```

### 2. Obtener Audit Logs de Telemetría
```http
GET /api/v1/telemetry/logs?limit=50
```

### 3. Despacho de Orden Manual / Test (Protegido)
```http
POST /api/v1/engine/test-order
Authorization: Bearer <ADMIN_API_TOKEN>
Content-Type: application/json

{
  "simbolo": "BTC/USDT",
  "lado": "BUY",
  "tamano": 100,
  "tipo": "MARKET"
}
```

---

## 🗂️ Estructura del Proyecto

```text
atlas-ai-trading/
├── .github/workflows/          # CI Pipeline (GitHub Actions)
├── docs/                       # Documentación adicional y arquitectura
├── src/
│   ├── agents/                 # 11 Agentes Especialistas y Risk Manager
│   ├── analytics/              # Ratios financieros (Sharpe, Sortino, Drawdown)
│   ├── api/                    # Servidor Fastify REST y rutas protegidas
│   ├── backtesting/            # Motor de simulación Walk-Forward determinista
│   ├── core/                   # Blackboard, Engine Scheduler y Orchestrator
│   ├── db/                     # Esquemas Drizzle ORM y migraciones PostgreSQL
│   ├── execution/              # BitgetBroker, OrderManager, StateMachine & Router
│   └── App.tsx                 # Dashboard React 19 + Vite
├── tests/                      # Suite de Pruebas Unitarias Vitest
├── server.ts                   # Gateway Express + Vite Middleware / Production Server
├── Dockerfile                  # Contenedor Multi-Stage
├── docker-compose.yml          # Orquestación Docker (App + Postgres)
├── package.json                # Dependencias y scripts NPM
└── README.md                   # Documentación Oficial
```

---

## 🚀 Instalación y Despliegue

### 1. Clonar el Repositorio
```bash
git clone https://github.com/jsoto-06/Atlas-AI-Trading.git
cd Atlas-AI-Trading
```

### 2. Instalar Dependencias
```bash
npm install
```

### 3. Configurar Variables de Entorno (`.env`)
```env
# BITGET CREDENTIALS
BITGET_API_KEY="tu_bitget_api_key"
BITGET_API_SECRET="tu_bitget_api_secret"
BITGET_PASSPHRASE="tu_bitget_passphrase"
BITGET_MODO_REAL="false"

# POSTGRESQL DB
SQL_HOST="localhost"
SQL_USER="postgres"
SQL_PASSWORD="tu_password_postgres"
SQL_DB_NAME="atlas_trading"

# SECURITY & AI
ADMIN_API_TOKEN="mi_clave_super_segura_123"
GEMINI_API_KEY="tu_gemini_api_key"
APP_URL="http://localhost:3000"
```

### 4. Crear Tablas en PostgreSQL
```bash
npx drizzle-kit push:pg
```

### 5. Ejecutar Pruebas Automatizadas (Vitest)
```bash
npm test
```

### 6. Iniciar Servidor en Desarrollo
```bash
npm run dev
```
Abre **`http://localhost:3000/`** en tu navegador.

---

## 📜 Licencia

Este proyecto está distribuido bajo la Licencia **Apache 2.0**. Consulta el archivo [LICENSE](LICENSE) para obtener más información.

<div align="center">
  <sub>Desarrollado con ❤️ Jonathan Soto para Trading Algorítmico Cuantitativo e Inteligencia Artificial.</sub>
</div>
