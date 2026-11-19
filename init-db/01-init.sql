-- Atlas AI Trading v2.0.0 Database Schema Initialization
-- PostgreSQL 15+ compatible

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    uid TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS monitored_assets (
    id SERIAL PRIMARY KEY,
    symbol TEXT NOT NULL UNIQUE,
    exchange TEXT DEFAULT 'bitget' NOT NULL,
    is_active TEXT DEFAULT 'true' NOT NULL,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS blackboard_snapshots (
    id SERIAL PRIMARY KEY,
    symbol TEXT NOT NULL,
    timeframe TEXT NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS blackboard_snapshots_symbol_timeframe_idx 
    ON blackboard_snapshots (symbol, timeframe, created_at);

CREATE TABLE IF NOT EXISTS supervisor_decisions (
    id SERIAL PRIMARY KEY,
    symbol TEXT NOT NULL,
    timeframe TEXT NOT NULL,
    direction TEXT NOT NULL,
    score INTEGER NOT NULL,
    justification TEXT NOT NULL,
    agent_assessments JSONB NOT NULL,
    status TEXT DEFAULT 'PENDING_RISK' NOT NULL,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS supervisor_decisions_symbol_timeframe_idx 
    ON supervisor_decisions (symbol, timeframe, created_at);

CREATE TABLE IF NOT EXISTS trades (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    decision_id INTEGER REFERENCES supervisor_decisions(id),
    symbol TEXT NOT NULL,
    exchange TEXT DEFAULT 'bitget' NOT NULL,
    side TEXT NOT NULL,
    position_type TEXT DEFAULT 'futures' NOT NULL,
    leverage INTEGER DEFAULT 1 NOT NULL,
    entry_price NUMERIC(20, 8) NOT NULL,
    exit_price NUMERIC(20, 8),
    quantity NUMERIC(20, 8) NOT NULL,
    stop_loss NUMERIC(20, 8),
    take_profit NUMERIC(20, 8),
    status TEXT DEFAULT 'OPEN' NOT NULL,
    pnl NUMERIC(20, 8),
    pnl_percentage NUMERIC(10, 4),
    entry_time TIMESTAMP DEFAULT NOW() NOT NULL,
    exit_time TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS trades_user_status_idx ON trades (user_id, status);
CREATE INDEX IF NOT EXISTS trades_symbol_status_idx ON trades (symbol, status);

CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP DEFAULT NOW() NOT NULL,
    level TEXT DEFAULT 'INFO' NOT NULL,
    agent_name TEXT NOT NULL,
    message TEXT NOT NULL,
    payload JSONB
);
CREATE INDEX IF NOT EXISTS audit_logs_timestamp_idx ON audit_logs (timestamp);
CREATE INDEX IF NOT EXISTS audit_logs_agent_name_idx ON audit_logs (agent_name);

CREATE TABLE IF NOT EXISTS learning_performance (
    id SERIAL PRIMARY KEY,
    symbol TEXT NOT NULL,
    agent_name TEXT NOT NULL,
    parameter_key TEXT NOT NULL,
    parameter_value TEXT NOT NULL,
    performance_metric TEXT NOT NULL,
    metric_value NUMERIC(10, 4) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    key TEXT NOT NULL,
    value JSONB NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS settings_user_key_idx ON settings (user_id, key);

CREATE TABLE IF NOT EXISTS market_candles (
    id SERIAL PRIMARY KEY,
    symbol TEXT NOT NULL,
    timeframe TEXT NOT NULL,
    open NUMERIC(20, 8) NOT NULL,
    high NUMERIC(20, 8) NOT NULL,
    low NUMERIC(20, 8) NOT NULL,
    close NUMERIC(20, 8) NOT NULL,
    volume NUMERIC(20, 8) NOT NULL,
    timestamp TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS market_candles_symbol_tf_ts_idx 
    ON market_candles (symbol, timeframe, timestamp);

CREATE TABLE IF NOT EXISTS market_tickers (
    id SERIAL PRIMARY KEY,
    symbol TEXT NOT NULL,
    last_price NUMERIC(20, 8) NOT NULL,
    holding_amount NUMERIC(20, 8) NOT NULL,
    funding_rate NUMERIC(10, 8) NOT NULL,
    timestamp TIMESTAMP DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS market_tickers_symbol_timestamp_idx 
    ON market_tickers (symbol, timestamp);

CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    client_oid TEXT NOT NULL UNIQUE,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL,
    order_type TEXT DEFAULT 'MARKET' NOT NULL,
    size NUMERIC(20, 8) NOT NULL,
    stop_loss NUMERIC(20, 8),
    take_profit NUMERIC(20, 8),
    leverage INTEGER DEFAULT 10 NOT NULL,
    status TEXT DEFAULT 'CREATED' NOT NULL,
    cycle_id TEXT,
    retry_count INTEGER DEFAULT 0 NOT NULL,
    exchange_order_id TEXT,
    error_details TEXT,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS orders_client_oid_idx ON orders (client_oid);
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders (status);
CREATE INDEX IF NOT EXISTS orders_symbol_status_idx ON orders (symbol, status);

-- Seed initial data if not present
INSERT INTO users (id, uid, email)
VALUES (1, 'admin_system', 'admin@atlas.lan')
ON CONFLICT (uid) DO NOTHING;

INSERT INTO monitored_assets (symbol, exchange, is_active)
VALUES 
    ('BTC/USDT', 'bitget', 'true'),
    ('ETH/USDT', 'bitget', 'true'),
    ('SOL/USDT', 'bitget', 'true')
ON CONFLICT (symbol) DO NOTHING;

INSERT INTO settings (user_id, key, value)
VALUES 
    (1, 'global_risk_limit', '{"max_risk_per_trade_pct": 2.0, "max_drawdown_pct": 10.0}'::jsonb),
    (1, 'kelly_multiplier', '{"fraction": 0.25}'::jsonb)
ON CONFLICT DO NOTHING;
