-- Keep each vehicle's existing ID so its maintenance and documents stay attached.
UPDATE "GroomingVan"
SET "number" = 12, "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'grooming-van-02' AND "number" = 2;

UPDATE "GroomingVan"
SET "number" = 14, "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'grooming-van-03' AND "number" = 3;
