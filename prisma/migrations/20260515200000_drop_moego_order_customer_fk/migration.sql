-- Drop the FK constraint from MoegoOrder.customerMoegoId. Chunked sync
-- can land an order slice before the referenced customer is present (or
-- for a customer older than our 2-year backfill window). The column
-- still stores the moegoId — joins happen in application code.

ALTER TABLE "MoegoOrder" DROP CONSTRAINT IF EXISTS "MoegoOrder_customerMoegoId_fkey";
