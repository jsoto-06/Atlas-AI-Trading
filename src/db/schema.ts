import { relations } from 'drizzle-orm';
import { integer, pgTable, serial, text, timestamp, numeric, jsonb } from 'drizzle-orm/pg-core';

// 1. Users Table (Linked with Firebase Auth UID)
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase Auth UID
  email: text('email').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Relationships for Users Table
export const usersRelations = relations(users, ({ many }) => ({
  trades: many(trades),
  settings: many(settings),
}));

// 2. Monitored Assets Table (Symbols configured for trading / monitoring)
export const monitoredAssets = pgTable('monitored_assets', {
  id: serial('id').primaryKey(),
  symbol: text('symbol').notNull().unique(), // e.g. "BTC/USDT", "ETH/USDT"
  exchange: text('exchange').default('bitget').notNull(),
  isActive: text('is_active').default('true').notNull(), // 'true' or 'false'
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 3. Blackboard Snapshots Table (Stores full agent snapshots for auditing and recovery)
export const blackboardSnapshots = pgTable('blackboard_snapshots', {
  id: serial('id').primaryKey(),
  symbol: text('symbol').notNull(),
  timeframe: text('timeframe').notNull(), // e.g., "1m", "5m", "15m", "1h", "4h", "1D"
  data: jsonb('data').notNull(), // Raw blackboard state including all agent scores and assessments
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 4. Signals / Supervisor Decisions Table (Decisions made by the Supervisor Agent)
export const supervisorDecisions = pgTable('supervisor_decisions', {
  id: serial('id').primaryKey(),
  symbol: text('symbol').notNull(),
  timeframe: text('timeframe').notNull(),
  direction: text('direction').notNull(), // "BUY", "SELL", "HOLD", "CLOSE"
  score: integer('score').notNull(), // Overall consensus score (e.g. -100 to 100)
  justification: text('justification').notNull(), // Human-readable rationale
  agentAssessments: jsonb('agent_assessments').notNull(), // Full break-down of agent inputs & weights
  status: text('status').default('PENDING_RISK').notNull(), // "PENDING_RISK", "APPROVED", "REJECTED_BY_RISK", "EXECUTED"
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Relationships for Supervisor Decisions
export const supervisorDecisionsRelations = relations(supervisorDecisions, ({ many }) => ({
  trades: many(trades),
}));

// 5. Trades / Orders Table (Live & paper-trading trade tracking)
export const trades = pgTable('trades', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  decisionId: integer('decision_id')
    .references(() => supervisorDecisions.id),
  symbol: text('symbol').notNull(),
  exchange: text('exchange').default('bitget').notNull(),
  side: text('side').notNull(), // "LONG" or "SHORT"
  positionType: text('position_type').default('futures').notNull(), // "spot" or "futures"
  leverage: integer('leverage').default(1).notNull(),
  entryPrice: numeric('entry_price', { precision: 20, scale: 8 }).notNull(),
  exitPrice: numeric('exit_price', { precision: 20, scale: 8 }),
  quantity: numeric('quantity', { precision: 20, scale: 8 }).notNull(),
  stopLoss: numeric('stop_loss', { precision: 20, scale: 8 }),
  takeProfit: numeric('take_profit', { precision: 20, scale: 8 }),
  status: text('status').default('OPEN').notNull(), // "OPEN", "CLOSED", "CANCELLED"
  pnl: numeric('pnl', { precision: 20, scale: 8 }), // Realized PnL
  pnlPercentage: numeric('pnl_percentage', { precision: 10, scale: 4 }), // PnL %
  entryTime: timestamp('entry_time').defaultNow().notNull(),
  exitTime: timestamp('exit_time'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Relationships for Trades Table
export const tradesRelations = relations(trades, ({ one }) => ({
  user: one(users, {
    fields: [trades.userId],
    references: [users.id],
  }),
  decision: one(supervisorDecisions, {
    fields: [trades.decisionId],
    references: [supervisorDecisions.id],
  }),
}));

// 6. Audit Logs Table (For the Audit Agent)
export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
  level: text('level').default('INFO').notNull(), // "INFO", "WARN", "ERROR", "DEBUG"
  agentName: text('agent_name').notNull(), // e.g. "TechnicalAnalyst", "RiskManager", "Supervisor"
  message: text('message').notNull(),
  payload: jsonb('payload'), // Context data (prompts, responses, stats, errors)
});

// 7. Learning Performance Table (For the Learning Agent to optimize weights/params)
export const learningPerformance = pgTable('learning_performance', {
  id: serial('id').primaryKey(),
  symbol: text('symbol').notNull(),
  agentName: text('agent_name').notNull(), // Agent name being optimized
  parameterKey: text('parameter_key').notNull(), // e.g., "rsi_period", "weight_technical"
  parameterValue: text('parameter_value').notNull(), // Saved value
  performanceMetric: text('performance_metric').notNull(), // "win_rate", "profit_factor", etc.
  metricValue: numeric('metric_value', { precision: 10, scale: 4 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 8. Settings Table (Trading parameters, risk rules, and exchange API references)
export const settings = pgTable('settings', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  key: text('key').notNull().unique(), // e.g. "global_risk_limit", "kelly_multiplier"
  value: jsonb('value').notNull(), // Multi-valued risk settings in structured JSON
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Relationships for Settings Table
export const settingsRelations = relations(settings, ({ one }) => ({
  user: one(users, {
    fields: [settings.userId],
    references: [users.id],
  }),
}));

// 9. Market Candles Table (Historical candlesticks for backtesting and analytics)
export const marketCandles = pgTable('market_candles', {
  id: serial('id').primaryKey(),
  symbol: text('symbol').notNull(),
  timeframe: text('timeframe').notNull(), // e.g. "1m", "5m", "15m"
  open: numeric('open', { precision: 20, scale: 8 }).notNull(),
  high: numeric('high', { precision: 20, scale: 8 }).notNull(),
  low: numeric('low', { precision: 20, scale: 8 }).notNull(),
  close: numeric('close', { precision: 20, scale: 8 }).notNull(),
  volume: numeric('volume', { precision: 20, scale: 8 }).notNull(),
  timestamp: timestamp('timestamp').notNull(),
});

