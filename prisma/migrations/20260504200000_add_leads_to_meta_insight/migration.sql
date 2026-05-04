-- Lead conversions, summed across all of Meta's lead action_types
-- (Instant Forms, pixel lead, on-site/off-site grouped, and any custom
-- conversion configured as a lead). Default 0 so existing rows stay
-- valid; the next sync will overwrite with real values.
ALTER TABLE "MetaAdInsight" ADD COLUMN "leads" INTEGER NOT NULL DEFAULT 0;
