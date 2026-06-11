import {
  pgTable, uuid, varchar, text, integer, decimal,
  timestamp, boolean, pgEnum,
} from 'drizzle-orm/pg-core';

// Enums
export const contactStatusEnum = pgEnum('contact_status', ['lead', 'activo', 'cliente', 'inactivo']);
export const opportunityStageEnum = pgEnum('opportunity_stage', [
  'nuevo', 'calificado', 'propuesta', 'negociacion', 'ganado', 'perdido',
]);
export const activityTypeEnum = pgEnum('activity_type', [
  'email', 'call', 'meeting', 'note', 'deal',
]);

// Users
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).notNull().default('user'),
  workspaceId: uuid('workspace_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Contacts
export const contacts = pgTable('contacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  company: varchar('company', { length: 255 }),
  status: contactStatusEnum('status').notNull().default('lead'),
  source: varchar('source', { length: 100 }),
  value: decimal('value', { precision: 14, scale: 2 }).default('0'),
  tags: text('tags').array(),
  ownerId: uuid('owner_id').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  lastActivityAt: timestamp('last_activity_at'),
});

// Opportunities
export const opportunities = pgTable('opportunities', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 500 }).notNull(),
  contactId: uuid('contact_id').references(() => contacts.id),
  company: varchar('company', { length: 255 }),
  stage: opportunityStageEnum('stage').notNull().default('nuevo'),
  value: decimal('value', { precision: 14, scale: 2 }).notNull().default('0'),
  probability: integer('probability').notNull().default(10),
  closeDate: timestamp('close_date'),
  ownerId: uuid('owner_id').references(() => users.id),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Activities
export const activities = pgTable('activities', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: activityTypeEnum('type').notNull(),
  description: text('description').notNull(),
  contactId: uuid('contact_id').references(() => contacts.id),
  opportunityId: uuid('opportunity_id').references(() => opportunities.id),
  userId: uuid('user_id').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Webhooks events
export const webhookEvents = pgTable('webhook_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: varchar('site_id', { length: 255 }),
  eventType: varchar('event_type', { length: 100 }).notNull(),
  payload: text('payload'),
  processed: boolean('processed').default(false),
  contactId: uuid('contact_id').references(() => contacts.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
