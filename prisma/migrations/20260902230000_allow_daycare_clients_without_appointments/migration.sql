-- The daycare-tagged client report includes clients even when MoeGo has no
-- appointment history for them, so these reference fields must be nullable.
ALTER TABLE "MoegoDaycareNotActiveRow"
    ALTER COLUMN "lastAppointmentDate" DROP NOT NULL,
    ALTER COLUMN "daysSinceLastAppointment" DROP NOT NULL;
