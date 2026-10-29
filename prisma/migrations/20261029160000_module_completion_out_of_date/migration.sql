ALTER TABLE "LessonCompletion" ADD COLUMN "isOutOfDate" BOOLEAN NOT NULL DEFAULT false;

-- Preserve the previous sign-off date and invalidate in the content edit transaction.
CREATE FUNCTION invalidate_module_completions(module_id TEXT) RETURNS VOID
LANGUAGE SQL AS $$
  UPDATE "LessonCompletion" AS c SET "isCompleted" = false, "isOutOfDate" = true
  FROM "Lesson" AS l JOIN "Subsection" AS s ON s.id = l."subsectionId"
  WHERE c."lessonId" = l.id AND s."moduleId" = module_id AND c."isCompleted" = true;
$$;
CREATE FUNCTION training_content_changed() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE target_module TEXT;
BEGIN
  IF TG_TABLE_NAME = 'Module' THEN
    IF NEW.title IS NOT DISTINCT FROM OLD.title AND NEW.description IS NOT DISTINCT FROM OLD.description THEN RETURN NEW; END IF;
    target_module := NEW.id;
  ELSIF TG_TABLE_NAME = 'Subsection' THEN
    IF TG_OP = 'UPDATE' THEN
      IF NEW.title IS NOT DISTINCT FROM OLD.title AND NEW.description IS NOT DISTINCT FROM OLD.description AND NEW."moduleId" IS NOT DISTINCT FROM OLD."moduleId" THEN RETURN NEW; END IF;
      PERFORM invalidate_module_completions(OLD."moduleId");
    END IF;
    IF TG_OP = 'DELETE' THEN target_module := OLD."moduleId"; ELSE target_module := NEW."moduleId"; END IF;
  ELSE
    IF TG_OP = 'UPDATE' THEN
      IF NEW.title IS NOT DISTINCT FROM OLD.title AND NEW.content IS NOT DISTINCT FROM OLD.content AND NEW."subsectionId" IS NOT DISTINCT FROM OLD."subsectionId" THEN RETURN NEW; END IF;
      PERFORM invalidate_module_completions(s."moduleId") FROM "Subsection" s WHERE s.id = OLD."subsectionId";
    END IF;
    IF TG_OP = 'DELETE' THEN
      SELECT "moduleId" INTO target_module FROM "Subsection" WHERE id = OLD."subsectionId";
    ELSE
      SELECT "moduleId" INTO target_module FROM "Subsection" WHERE id = NEW."subsectionId";
    END IF;
  END IF;
  PERFORM invalidate_module_completions(target_module);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER module_content_changed AFTER UPDATE ON "Module" FOR EACH ROW EXECUTE FUNCTION training_content_changed();
CREATE TRIGGER subsection_content_changed BEFORE UPDATE OR DELETE ON "Subsection" FOR EACH ROW EXECUTE FUNCTION training_content_changed();
CREATE TRIGGER lesson_content_changed BEFORE INSERT OR UPDATE OR DELETE ON "Lesson" FOR EACH ROW EXECUTE FUNCTION training_content_changed();

-- These helpers are internal; do not expose invalidation as a public RPC.
REVOKE EXECUTE ON FUNCTION invalidate_module_completions(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION training_content_changed() FROM PUBLIC, anon, authenticated;
