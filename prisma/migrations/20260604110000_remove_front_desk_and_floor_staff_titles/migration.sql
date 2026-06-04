-- Remove retired job titles from org structure, module visibility, and users.
DELETE FROM "ModuleJobTitleAssignment"
WHERE "jobTitle" IN ('Front Desk Staff', 'Floor Staff');

UPDATE "User"
SET "jobTitle" = NULL
WHERE "jobTitle" IN ('Front Desk Staff', 'Floor Staff');

DELETE FROM "OrgPosition"
WHERE "title" IN ('Front Desk Staff', 'Floor Staff');
