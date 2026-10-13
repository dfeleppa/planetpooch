CREATE TABLE "InventoryCount" (
  "id" TEXT NOT NULL,
  "inventoryItemId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "countedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "countedById" TEXT,
  CONSTRAINT "InventoryCount_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InventoryCount_inventoryItemId_countedAt_idx" ON "InventoryCount"("inventoryItemId", "countedAt");
ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_countedById_fkey" FOREIGN KEY ("countedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Only add the supplied Mobile Grooming catalog. Existing inventory and counts are retained.

INSERT INTO "InventoryCategory" ("id", "name", "color", "company", "createdAt", "updatedAt")
VALUES ('mg-category-shampoos-finishing-spray', 'Shampoos & Finishing Spray', 'bg-blue-100 text-blue-800', 'GROOMING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name", "company") DO NOTHING;

INSERT INTO "InventoryItem" ("id", "name", "description", "categoryId", "unit", "currentQuantity", "minimumThreshold", "company", "createdAt", "updatedAt")
SELECT 'mg-item-best-shot-shampoo', 'Best Shot shampoo', '', "id", 'units', 0, 0, 'GROOMING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "InventoryCategory" WHERE "name" = 'Shampoos & Finishing Spray' AND "company" = 'GROOMING'
  AND NOT EXISTS (SELECT 1 FROM "InventoryItem" WHERE "name" = 'Best Shot shampoo' AND "company" = 'GROOMING');

INSERT INTO "InventoryItem" ("id", "name", "description", "categoryId", "unit", "currentQuantity", "minimumThreshold", "company", "createdAt", "updatedAt")
SELECT 'mg-item-best-shot-conditioner', 'Best Shot conditioner', '', "id", 'units', 0, 0, 'GROOMING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "InventoryCategory" WHERE "name" = 'Shampoos & Finishing Spray' AND "company" = 'GROOMING'
  AND NOT EXISTS (SELECT 1 FROM "InventoryItem" WHERE "name" = 'Best Shot conditioner' AND "company" = 'GROOMING');

INSERT INTO "InventoryItem" ("id", "name", "description", "categoryId", "unit", "currentQuantity", "minimumThreshold", "company", "createdAt", "updatedAt")
SELECT 'mg-item-davis-tearless-shampoo', 'Davis tearless shampoo', '', "id", 'units', 0, 0, 'GROOMING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "InventoryCategory" WHERE "name" = 'Shampoos & Finishing Spray' AND "company" = 'GROOMING'
  AND NOT EXISTS (SELECT 1 FROM "InventoryItem" WHERE "name" = 'Davis tearless shampoo' AND "company" = 'GROOMING');

INSERT INTO "InventoryItem" ("id", "name", "description", "categoryId", "unit", "currentQuantity", "minimumThreshold", "company", "createdAt", "updatedAt")
SELECT 'mg-item-oatmella-shampoo', 'Oatmella shampoo', '', "id", 'units', 0, 0, 'GROOMING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "InventoryCategory" WHERE "name" = 'Shampoos & Finishing Spray' AND "company" = 'GROOMING'
  AND NOT EXISTS (SELECT 1 FROM "InventoryItem" WHERE "name" = 'Oatmella shampoo' AND "company" = 'GROOMING');

INSERT INTO "InventoryItem" ("id", "name", "description", "categoryId", "unit", "currentQuantity", "minimumThreshold", "company", "createdAt", "updatedAt")
SELECT 'mg-item-eucalime-shampoo', 'Eucalime shampoo', '', "id", 'units', 0, 0, 'GROOMING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "InventoryCategory" WHERE "name" = 'Shampoos & Finishing Spray' AND "company" = 'GROOMING'
  AND NOT EXISTS (SELECT 1 FROM "InventoryItem" WHERE "name" = 'Eucalime shampoo' AND "company" = 'GROOMING');

INSERT INTO "InventoryItem" ("id", "name", "description", "categoryId", "unit", "currentQuantity", "minimumThreshold", "company", "createdAt", "updatedAt")
SELECT 'mg-item-nexderma-shampoo', 'Nexderma shampoo', '', "id", 'units', 0, 0, 'GROOMING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "InventoryCategory" WHERE "name" = 'Shampoos & Finishing Spray' AND "company" = 'GROOMING'
  AND NOT EXISTS (SELECT 1 FROM "InventoryItem" WHERE "name" = 'Nexderma shampoo' AND "company" = 'GROOMING');

INSERT INTO "InventoryItem" ("id", "name", "description", "categoryId", "unit", "currentQuantity", "minimumThreshold", "company", "createdAt", "updatedAt")
SELECT 'mg-item-furminator-shampoo', 'Furminator shampoo', '', "id", 'units', 0, 0, 'GROOMING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "InventoryCategory" WHERE "name" = 'Shampoos & Finishing Spray' AND "company" = 'GROOMING'
  AND NOT EXISTS (SELECT 1 FROM "InventoryItem" WHERE "name" = 'Furminator shampoo' AND "company" = 'GROOMING');

INSERT INTO "InventoryItem" ("id", "name", "description", "categoryId", "unit", "currentQuantity", "minimumThreshold", "company", "createdAt", "updatedAt")
SELECT 'mg-item-furminator-conditioner', 'Furminator conditioner', '', "id", 'units', 0, 0, 'GROOMING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "InventoryCategory" WHERE "name" = 'Shampoos & Finishing Spray' AND "company" = 'GROOMING'
  AND NOT EXISTS (SELECT 1 FROM "InventoryItem" WHERE "name" = 'Furminator conditioner' AND "company" = 'GROOMING');

INSERT INTO "InventoryItem" ("id", "name", "description", "categoryId", "unit", "currentQuantity", "minimumThreshold", "company", "createdAt", "updatedAt")
SELECT 'mg-item-alpha-white-shampoo', 'Alpha White shampoo', '', "id", 'units', 0, 0, 'GROOMING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "InventoryCategory" WHERE "name" = 'Shampoos & Finishing Spray' AND "company" = 'GROOMING'
  AND NOT EXISTS (SELECT 1 FROM "InventoryItem" WHERE "name" = 'Alpha White shampoo' AND "company" = 'GROOMING');

INSERT INTO "InventoryItem" ("id", "name", "description", "categoryId", "unit", "currentQuantity", "minimumThreshold", "company", "createdAt", "updatedAt")
SELECT 'mg-item-baby-bark-shampoo', 'Baby Bark shampoo', '', "id", 'units', 0, 0, 'GROOMING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "InventoryCategory" WHERE "name" = 'Shampoos & Finishing Spray' AND "company" = 'GROOMING'
  AND NOT EXISTS (SELECT 1 FROM "InventoryItem" WHERE "name" = 'Baby Bark shampoo' AND "company" = 'GROOMING');

INSERT INTO "InventoryItem" ("id", "name", "description", "categoryId", "unit", "currentQuantity", "minimumThreshold", "company", "createdAt", "updatedAt")
SELECT 'mg-item-hydra-shampoo', 'Hydra shampoo', '', "id", 'units', 0, 0, 'GROOMING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "InventoryCategory" WHERE "name" = 'Shampoos & Finishing Spray' AND "company" = 'GROOMING'
  AND NOT EXISTS (SELECT 1 FROM "InventoryItem" WHERE "name" = 'Hydra shampoo' AND "company" = 'GROOMING');

INSERT INTO "InventoryItem" ("id", "name", "description", "categoryId", "unit", "currentQuantity", "minimumThreshold", "company", "createdAt", "updatedAt")
SELECT 'mg-item-hydra-conditioner', 'Hydra conditioner', '', "id", 'units', 0, 0, 'GROOMING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "InventoryCategory" WHERE "name" = 'Shampoos & Finishing Spray' AND "company" = 'GROOMING'
  AND NOT EXISTS (SELECT 1 FROM "InventoryItem" WHERE "name" = 'Hydra conditioner' AND "company" = 'GROOMING');

INSERT INTO "InventoryItem" ("id", "name", "description", "categoryId", "unit", "currentQuantity", "minimumThreshold", "company", "createdAt", "updatedAt")
SELECT 'mg-item-igroom-charcoal-shampoo', 'iGroom charcoal shampoo', '', "id", 'units', 0, 0, 'GROOMING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "InventoryCategory" WHERE "name" = 'Shampoos & Finishing Spray' AND "company" = 'GROOMING'
  AND NOT EXISTS (SELECT 1 FROM "InventoryItem" WHERE "name" = 'iGroom charcoal shampoo' AND "company" = 'GROOMING');

INSERT INTO "InventoryItem" ("id", "name", "description", "categoryId", "unit", "currentQuantity", "minimumThreshold", "company", "createdAt", "updatedAt")
SELECT 'mg-item-igroom-charcoal-conditioner', 'iGroom charcoal conditioner', '', "id", 'units', 0, 0, 'GROOMING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "InventoryCategory" WHERE "name" = 'Shampoos & Finishing Spray' AND "company" = 'GROOMING'
  AND NOT EXISTS (SELECT 1 FROM "InventoryItem" WHERE "name" = 'iGroom charcoal conditioner' AND "company" = 'GROOMING');

INSERT INTO "InventoryItem" ("id", "name", "description", "categoryId", "unit", "currentQuantity", "minimumThreshold", "company", "createdAt", "updatedAt")
SELECT 'mg-item-seasonal-shampoo', 'Seasonal shampoo', '', "id", 'units', 0, 0, 'GROOMING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "InventoryCategory" WHERE "name" = 'Shampoos & Finishing Spray' AND "company" = 'GROOMING'
  AND NOT EXISTS (SELECT 1 FROM "InventoryItem" WHERE "name" = 'Seasonal shampoo' AND "company" = 'GROOMING');

INSERT INTO "InventoryItem" ("id", "name", "description", "categoryId", "unit", "currentQuantity", "minimumThreshold", "company", "createdAt", "updatedAt")
SELECT 'mg-item-waterless-shampoo', 'Waterless shampoo', '', "id", 'units', 0, 0, 'GROOMING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "InventoryCategory" WHERE "name" = 'Shampoos & Finishing Spray' AND "company" = 'GROOMING'
  AND NOT EXISTS (SELECT 1 FROM "InventoryItem" WHERE "name" = 'Waterless shampoo' AND "company" = 'GROOMING');

INSERT INTO "InventoryItem" ("id", "name", "description", "categoryId", "unit", "currentQuantity", "minimumThreshold", "company", "createdAt", "updatedAt")
SELECT 'mg-item-best-shot-finishing-spray', 'Best Shot finishing spray', '', "id", 'units', 0, 0, 'GROOMING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "InventoryCategory" WHERE "name" = 'Shampoos & Finishing Spray' AND "company" = 'GROOMING'
  AND NOT EXISTS (SELECT 1 FROM "InventoryItem" WHERE "name" = 'Best Shot finishing spray' AND "company" = 'GROOMING');

INSERT INTO "InventoryCategory" ("id", "name", "color", "company", "createdAt", "updatedAt")
VALUES ('mg-category-ear-eye-care', 'Ear & Eye Care', 'bg-sky-100 text-sky-800', 'GROOMING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name", "company") DO NOTHING;

INSERT INTO "InventoryItem" ("id", "name", "description", "categoryId", "unit", "currentQuantity", "minimumThreshold", "company", "createdAt", "updatedAt")
SELECT 'mg-item-nexderma-ear-cleaner', 'Nexderma ear cleaner', '', "id", 'units', 0, 0, 'GROOMING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "InventoryCategory" WHERE "name" = 'Ear & Eye Care' AND "company" = 'GROOMING'
  AND NOT EXISTS (SELECT 1 FROM "InventoryItem" WHERE "name" = 'Nexderma ear cleaner' AND "company" = 'GROOMING');

INSERT INTO "InventoryItem" ("id", "name", "description", "categoryId", "unit", "currentQuantity", "minimumThreshold", "company", "createdAt", "updatedAt")
SELECT 'mg-item-ear-powder', 'Ear powder', '', "id", 'units', 0, 0, 'GROOMING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "InventoryCategory" WHERE "name" = 'Ear & Eye Care' AND "company" = 'GROOMING'
  AND NOT EXISTS (SELECT 1 FROM "InventoryItem" WHERE "name" = 'Ear powder' AND "company" = 'GROOMING');

INSERT INTO "InventoryItem" ("id", "name", "description", "categoryId", "unit", "currentQuantity", "minimumThreshold", "company", "createdAt", "updatedAt")
SELECT 'mg-item-cotton-balls', 'Cotton balls', '', "id", 'units', 0, 0, 'GROOMING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "InventoryCategory" WHERE "name" = 'Ear & Eye Care' AND "company" = 'GROOMING'
  AND NOT EXISTS (SELECT 1 FROM "InventoryItem" WHERE "name" = 'Cotton balls' AND "company" = 'GROOMING');

INSERT INTO "InventoryItem" ("id", "name", "description", "categoryId", "unit", "currentQuantity", "minimumThreshold", "company", "createdAt", "updatedAt")
SELECT 'mg-item-cotton-swabs', 'Cotton swabs', '', "id", 'units', 0, 0, 'GROOMING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "InventoryCategory" WHERE "name" = 'Ear & Eye Care' AND "company" = 'GROOMING'
  AND NOT EXISTS (SELECT 1 FROM "InventoryItem" WHERE "name" = 'Cotton swabs' AND "company" = 'GROOMING');

INSERT INTO "InventoryItem" ("id", "name", "description", "categoryId", "unit", "currentQuantity", "minimumThreshold", "company", "createdAt", "updatedAt")
SELECT 'mg-item-eye-wash', 'Eye wash', '', "id", 'units', 0, 0, 'GROOMING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "InventoryCategory" WHERE "name" = 'Ear & Eye Care' AND "company" = 'GROOMING'
  AND NOT EXISTS (SELECT 1 FROM "InventoryItem" WHERE "name" = 'Eye wash' AND "company" = 'GROOMING');

INSERT INTO "InventoryCategory" ("id", "name", "color", "company", "createdAt", "updatedAt")
VALUES ('mg-category-dental-care', 'Dental Care', 'bg-teal-100 text-teal-800', 'GROOMING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name", "company") DO NOTHING;

INSERT INTO "InventoryItem" ("id", "name", "description", "categoryId", "unit", "currentQuantity", "minimumThreshold", "company", "createdAt", "updatedAt")
SELECT 'mg-item-toothbrushes', 'Toothbrushes', '', "id", 'units', 0, 0, 'GROOMING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "InventoryCategory" WHERE "name" = 'Dental Care' AND "company" = 'GROOMING'
  AND NOT EXISTS (SELECT 1 FROM "InventoryItem" WHERE "name" = 'Toothbrushes' AND "company" = 'GROOMING');

INSERT INTO "InventoryItem" ("id", "name", "description", "categoryId", "unit", "currentQuantity", "minimumThreshold", "company", "createdAt", "updatedAt")
SELECT 'mg-item-toothpaste', 'Toothpaste', '', "id", 'units', 0, 0, 'GROOMING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "InventoryCategory" WHERE "name" = 'Dental Care' AND "company" = 'GROOMING'
  AND NOT EXISTS (SELECT 1 FROM "InventoryItem" WHERE "name" = 'Toothpaste' AND "company" = 'GROOMING');

INSERT INTO "InventoryItem" ("id", "name", "description", "categoryId", "unit", "currentQuantity", "minimumThreshold", "company", "createdAt", "updatedAt")
SELECT 'mg-item-dental-spray', 'Dental spray', '', "id", 'units', 0, 0, 'GROOMING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "InventoryCategory" WHERE "name" = 'Dental Care' AND "company" = 'GROOMING'
  AND NOT EXISTS (SELECT 1 FROM "InventoryItem" WHERE "name" = 'Dental spray' AND "company" = 'GROOMING');

INSERT INTO "InventoryItem" ("id", "name", "description", "categoryId", "unit", "currentQuantity", "minimumThreshold", "company", "createdAt", "updatedAt")
SELECT 'mg-item-dental-chews', 'Dental chews', '', "id", 'units', 0, 0, 'GROOMING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "InventoryCategory" WHERE "name" = 'Dental Care' AND "company" = 'GROOMING'
  AND NOT EXISTS (SELECT 1 FROM "InventoryItem" WHERE "name" = 'Dental chews' AND "company" = 'GROOMING');

INSERT INTO "InventoryCategory" ("id", "name", "color", "company", "createdAt", "updatedAt")
VALUES ('mg-category-nail-paw-care', 'Nail & Paw Care', 'bg-rose-100 text-rose-800', 'GROOMING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name", "company") DO NOTHING;

INSERT INTO "InventoryItem" ("id", "name", "description", "categoryId", "unit", "currentQuantity", "minimumThreshold", "company", "createdAt", "updatedAt")
SELECT 'mg-item-nail-clippers', 'Nail clippers', '', "id", 'units', 0, 0, 'GROOMING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "InventoryCategory" WHERE "name" = 'Nail & Paw Care' AND "company" = 'GROOMING'
  AND NOT EXISTS (SELECT 1 FROM "InventoryItem" WHERE "name" = 'Nail clippers' AND "company" = 'GROOMING');

INSERT INTO "InventoryItem" ("id", "name", "description", "categoryId", "unit", "currentQuantity", "minimumThreshold", "company", "createdAt", "updatedAt")
SELECT 'mg-item-kwik-stop', 'Kwik stop', '', "id", 'units', 0, 0, 'GROOMING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "InventoryCategory" WHERE "name" = 'Nail & Paw Care' AND "company" = 'GROOMING'
  AND NOT EXISTS (SELECT 1 FROM "InventoryItem" WHERE "name" = 'Kwik stop' AND "company" = 'GROOMING');

INSERT INTO "InventoryItem" ("id", "name", "description", "categoryId", "unit", "currentQuantity", "minimumThreshold", "company", "createdAt", "updatedAt")
SELECT 'mg-item-cool-care-spray', 'Cool care spray', '', "id", 'units', 0, 0, 'GROOMING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "InventoryCategory" WHERE "name" = 'Nail & Paw Care' AND "company" = 'GROOMING'
  AND NOT EXISTS (SELECT 1 FROM "InventoryItem" WHERE "name" = 'Cool care spray' AND "company" = 'GROOMING');

INSERT INTO "InventoryItem" ("id", "name", "description", "categoryId", "unit", "currentQuantity", "minimumThreshold", "company", "createdAt", "updatedAt")
SELECT 'mg-item-paw-balm', 'Paw balm', '', "id", 'units', 0, 0, 'GROOMING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "InventoryCategory" WHERE "name" = 'Nail & Paw Care' AND "company" = 'GROOMING'
  AND NOT EXISTS (SELECT 1 FROM "InventoryItem" WHERE "name" = 'Paw balm' AND "company" = 'GROOMING');

INSERT INTO "InventoryItem" ("id", "name", "description", "categoryId", "unit", "currentQuantity", "minimumThreshold", "company", "createdAt", "updatedAt")
SELECT 'mg-item-cucumber-facial', 'Cucumber facial', '', "id", 'units', 0, 0, 'GROOMING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "InventoryCategory" WHERE "name" = 'Nail & Paw Care' AND "company" = 'GROOMING'
  AND NOT EXISTS (SELECT 1 FROM "InventoryItem" WHERE "name" = 'Cucumber facial' AND "company" = 'GROOMING');

INSERT INTO "InventoryItem" ("id", "name", "description", "categoryId", "unit", "currentQuantity", "minimumThreshold", "company", "createdAt", "updatedAt")
SELECT 'mg-item-paw-scrub', 'Paw scrub', '', "id", 'units', 0, 0, 'GROOMING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "InventoryCategory" WHERE "name" = 'Nail & Paw Care' AND "company" = 'GROOMING'
  AND NOT EXISTS (SELECT 1 FROM "InventoryItem" WHERE "name" = 'Paw scrub' AND "company" = 'GROOMING');

INSERT INTO "InventoryCategory" ("id", "name", "color", "company", "createdAt", "updatedAt")
VALUES ('mg-category-miscellaneous', 'Miscellaneous', 'bg-amber-100 text-amber-800', 'GROOMING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name", "company") DO NOTHING;

INSERT INTO "InventoryItem" ("id", "name", "description", "categoryId", "unit", "currentQuantity", "minimumThreshold", "company", "createdAt", "updatedAt")
SELECT 'mg-item-grooming-supplies-other', 'Grooming supplies / other', '', "id", 'units', 0, 0, 'GROOMING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "InventoryCategory" WHERE "name" = 'Miscellaneous' AND "company" = 'GROOMING'
  AND NOT EXISTS (SELECT 1 FROM "InventoryItem" WHERE "name" = 'Grooming supplies / other' AND "company" = 'GROOMING');
