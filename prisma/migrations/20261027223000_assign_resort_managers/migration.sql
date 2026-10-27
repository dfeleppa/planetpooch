BEGIN;

-- Target verified accounts; never derive authorization from names or job titles.
DO $$
BEGIN
  IF (SELECT count(*) FROM "User"
      WHERE "id" IN ('cmoc059wd000rjr04x03j7h19', 'cmoc0283w000jjr04200pulk3')
        AND "company" = 'RESORT' AND "terminatedAt" IS NULL
        AND "role" IN ('EMPLOYEE', 'MANAGER')) <> 2 THEN
    RAISE EXCEPTION 'Expected two active Pet Resort accounts before assigning Manager';
  END IF;
END $$;

UPDATE "User"
SET "role" = 'MANAGER', "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" IN ('cmoc059wd000rjr04x03j7h19', 'cmoc0283w000jjr04200pulk3');

COMMIT;
