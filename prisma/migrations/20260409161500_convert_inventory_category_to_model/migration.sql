-- Drop the old enum if it exists
DROP TYPE IF EXISTS "InventoryCategory" CASCADE;

-- CreateTable InventoryCategory
CREATE TABLE "InventoryCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'bg-gray-100 text-gray-800',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex for unique category names
CREATE UNIQUE INDEX "InventoryCategory_name_key" ON "InventoryCategory"("name");

-- Insert default categories
INSERT INTO "InventoryCategory" ("id", "name", "color", "updatedAt") VALUES
  ('cat-tools', 'Tools', 'bg-purple-100 text-purple-800', CURRENT_TIMESTAMP),
  ('cat-materials', 'Materials', 'bg-blue-100 text-blue-800', CURRENT_TIMESTAMP),
  ('cat-equipment', 'Equipment', 'bg-green-100 text-green-800', CURRENT_TIMESTAMP),
  ('cat-parts', 'Parts', 'bg-orange-100 text-orange-800', CURRENT_TIMESTAMP),
  ('cat-supplies', 'Supplies', 'bg-gray-100 text-gray-800', CURRENT_TIMESTAMP),
  ('cat-other', 'Other', 'bg-slate-100 text-slate-800', CURRENT_TIMESTAMP);

-- Alter InventoryItem table
ALTER TABLE "InventoryItem" DROP COLUMN IF EXISTS "category";
ALTER TABLE "InventoryItem" ADD COLUMN "categoryId" TEXT;
UPDATE "InventoryItem" SET "categoryId" = 'cat-supplies' WHERE "categoryId" IS NULL;
ALTER TABLE "InventoryItem" ALTER COLUMN "categoryId" SET NOT NULL;

-- Add index and foreign key
CREATE INDEX "InventoryItem_categoryId_idx" ON "InventoryItem"("categoryId");
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "InventoryCategory"("id") ON DELETE RESTRICT;
