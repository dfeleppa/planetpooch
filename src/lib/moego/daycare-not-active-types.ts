export const DAYCARE_INACTIVITY_DAYS = 30;

export type DaycareNotActiveReportRow = {
  customerId: string;
  customerName: string;
  email: string | null;
  phone: string | null;
  lastAppointmentDate: string;
  nextAppointmentDate: string | null;
  daysSinceLastAppointment: number;
  preferredBusinessId: string | null;
  tags: string[];
};

export type DaycareNotActiveReport = {
  generatedAt: string;
  cutoffDate: string;
  inactivityDays: number;
  customersScanned: number;
  daycareCustomersScanned: number;
  customerCount: number;
  rows: DaycareNotActiveReportRow[];
};
