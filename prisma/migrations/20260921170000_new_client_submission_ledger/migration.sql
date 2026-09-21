-- A private, durable copy of every new-client form attempt and every status
-- transition. Only the server-side database role may access these records.
CREATE TABLE "WebsiteFormSubmission" (
  "id" UUID NOT NULL,
  "company" "Company" NOT NULL DEFAULT 'RESORT',
  "formKey" TEXT NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "payload" JSONB NOT NULL,
  "requestMetadata" JSONB NOT NULL DEFAULT '{}',
  "firstName" TEXT,
  "lastName" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "pets" JSONB NOT NULL DEFAULT '[]',
  "services" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "marketingConsent" BOOLEAN,
  "attribution" JSONB NOT NULL DEFAULT '{}',
  "status" TEXT NOT NULL DEFAULT 'RECEIVED',
  "lastHttpStatus" INTEGER,
  "lastError" TEXT,
  "moegoLeadId" TEXT,
  "moegoCustomerId" TEXT,
  "moegoPetId" TEXT,
  "moegoSyncedAt" TIMESTAMP(3),
  "attemptCount" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "WebsiteFormSubmission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WebsiteFormSubmissionEvent" (
  "id" TEXT NOT NULL,
  "submissionId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "eventType" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "httpStatus" INTEGER,
  "message" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT "WebsiteFormSubmissionEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WebsiteFormSubmission_company_receivedAt_idx" ON "WebsiteFormSubmission"("company", "receivedAt" DESC);
CREATE INDEX "WebsiteFormSubmission_status_updatedAt_idx" ON "WebsiteFormSubmission"("status", "updatedAt" DESC);
CREATE INDEX "WebsiteFormSubmission_phone_idx" ON "WebsiteFormSubmission"("phone");
CREATE INDEX "WebsiteFormSubmission_email_idx" ON "WebsiteFormSubmission"("email");
CREATE INDEX "WebsiteFormSubmissionEvent_submissionId_createdAt_idx" ON "WebsiteFormSubmissionEvent"("submissionId", "createdAt");
CREATE INDEX "WebsiteFormSubmissionEvent_status_createdAt_idx" ON "WebsiteFormSubmissionEvent"("status", "createdAt" DESC);
ALTER TABLE "WebsiteFormSubmissionEvent" ADD CONSTRAINT "WebsiteFormSubmissionEvent_submissionId_fkey"
  FOREIGN KEY ("submissionId") REFERENCES "WebsiteFormSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WebsiteFormSubmission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WebsiteFormSubmissionEvent" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "WebsiteFormSubmission", "WebsiteFormSubmissionEvent" FROM PUBLIC, anon, authenticated;
