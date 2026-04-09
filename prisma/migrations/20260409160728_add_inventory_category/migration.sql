-- CreateEnum
CREATE TYPE "InventoryCategory" AS ENUM ('TOOLS', 'MATERIALS', 'EQUIPMENT', 'PARTS', 'SUPPLIES', 'OTHER');

-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN     "category" "InventoryCategory" NOT NULL DEFAULT 'SUPPLIES';
