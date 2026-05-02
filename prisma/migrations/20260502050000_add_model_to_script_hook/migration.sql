-- Stamp the Anthropic model id on each Script + Hook produced by the
-- generator. Null for hand-written rows (and for everything that existed
-- before this column was added).
ALTER TABLE "Script" ADD COLUMN "model" TEXT;
ALTER TABLE "Hook"   ADD COLUMN "model" TEXT;
