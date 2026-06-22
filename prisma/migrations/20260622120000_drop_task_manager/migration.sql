-- Drop the standalone Task Manager feature. Maintenance and onboarding task
-- tables remain in place.
DROP TABLE IF EXISTS "TaskComment";
DROP TABLE IF EXISTS "TaskAssignee";
DROP TABLE IF EXISTS "Task";
DROP TABLE IF EXISTS "ProjectMember";
DROP TABLE IF EXISTS "SubProject";
DROP TABLE IF EXISTS "Project";

DROP TYPE IF EXISTS "TaskPriority";
DROP TYPE IF EXISTS "TaskStatus";
