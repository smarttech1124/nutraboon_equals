-- A subscription belongs to exactly one user or one organisation (ADR-062).
-- Prisma does not manage CHECK constraints, so this is written by hand.
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_one_subject"
  CHECK (("userId" IS NULL) <> ("organizationId" IS NULL));
