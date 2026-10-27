-- Requested corporate chain: Andy -> Daniel -> Brianna -> division heads.
-- Match assigned people, since position titles can be edited independently.
-- Fresh databases without these assignments use the updated seed instead.
DO $$
DECLARE
  andy_id TEXT;
  daniel_id TEXT;
  brianna_id TEXT;
BEGIN
  SELECT min(p.id) INTO andy_id
  FROM "OrgPosition" p JOIN "User" u ON u.id = p."assignedUserId"
  WHERE lower(trim(u.name)) = 'anderson gonzaga'
  HAVING count(*) = 1;

  SELECT min(p.id) INTO daniel_id
  FROM "OrgPosition" p JOIN "User" u ON u.id = p."assignedUserId"
  WHERE lower(trim(u.name)) = 'daniel feleppa'
  HAVING count(*) = 1;

  SELECT min(p.id) INTO brianna_id
  FROM "OrgPosition" p JOIN "User" u ON u.id = p."assignedUserId"
  WHERE lower(trim(u.name)) = 'brianna carbone'
  HAVING count(*) = 1;

  IF andy_id IS NOT NULL AND daniel_id IS NOT NULL AND brianna_id IS NOT NULL THEN
    UPDATE "OrgPosition"
    SET "parentPositionId" = NULL, company = NULL, "updatedAt" = CURRENT_TIMESTAMP
    WHERE id = andy_id;

    UPDATE "OrgPosition"
    SET "parentPositionId" = andy_id, company = NULL, "updatedAt" = CURRENT_TIMESTAMP
    WHERE id = daniel_id;

    UPDATE "OrgPosition"
    SET "parentPositionId" = daniel_id, company = NULL, "updatedAt" = CURRENT_TIMESTAMP
    WHERE id = brianna_id;

    -- Only move division roots; keep every internal reporting line intact.
    UPDATE "OrgPosition" division
    SET "parentPositionId" = brianna_id, "updatedAt" = CURRENT_TIMESTAMP
    WHERE division.company IN ('RESORT', 'GROOMING')
      AND (
        division."parentPositionId" IS NULL
        OR EXISTS (
          SELECT 1 FROM "OrgPosition" parent
          WHERE parent.id = division."parentPositionId"
            AND parent.company IS DISTINCT FROM division.company
        )
      );
  END IF;
END $$;
