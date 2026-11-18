ALTER TABLE "Survey" ADD CONSTRAINT survey_dates CHECK ("startAt" < "endAt"), ADD CONSTRAINT survey_policy CHECK ("minimum" >= 3 AND "reminderHours" > 0 AND "maxReminders" BETWEEN 0 AND 20);
CREATE UNIQUE INDEX one_active_analysis ON "AIAnalysis" ("surveyId") WHERE status IN ('QUEUED','PROCESSING');
CREATE UNIQUE INDEX one_identified_response ON "SurveyResponse" ("surveyId","studentId") WHERE "studentId" IS NOT NULL;
CREATE FUNCTION pulse_response_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (SELECT anonymous FROM "Survey" WHERE id=NEW."surveyId") <> (NEW."studentId" IS NULL) THEN
   RAISE EXCEPTION 'Response identity does not match survey mode';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER response_identity BEFORE INSERT OR UPDATE ON "SurveyResponse" FOR EACH ROW EXECUTE FUNCTION pulse_response_identity();
CREATE FUNCTION pulse_answer_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (SELECT "surveyId" FROM "SurveyQuestion" WHERE id=NEW."questionId") IS DISTINCT FROM (SELECT "surveyId" FROM "SurveyResponse" WHERE id=NEW."responseId") THEN
   RAISE EXCEPTION 'Question and response must belong to the same survey';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER answer_scope BEFORE INSERT OR UPDATE ON "Answer" FOR EACH ROW EXECUTE FUNCTION pulse_answer_scope();
ALTER TABLE "Theme" ADD CONSTRAINT theme_confidence CHECK ("confidence" BETWEEN 0 AND 1), ADD CONSTRAINT nonnegative_mentions CHECK ("mentions" >= 0);
ALTER TABLE "IssueLink" ADD CONSTRAINT ordered_issue_link CHECK ("fromId" < "toId");
