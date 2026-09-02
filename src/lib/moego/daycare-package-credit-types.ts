export const DAYCARE_PACKAGE_RULES = [
  { packageName: "Full Day Daycare 5 pack", expirationWindowDays: 7 },
  { packageName: "Full Day Daycare 10 pack", expirationWindowDays: 14 },
  { packageName: "Full Day Daycare 20 pack", expirationWindowDays: 14 },
] as const;

export const EXPIRED_DAYCARE_PACKAGE_WINDOW_DAYS = 30;

export function getDaycarePackageRule(packageName: string | null | undefined) {
  const normalized = (packageName ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return DAYCARE_PACKAGE_RULES.find(
    (rule) => rule.packageName.toLowerCase() === normalized
  );
}

export function isWithinDaycarePackageExpirationWindow(
  packageName: string | null | undefined,
  daysUntilExpiration: number
): boolean {
  const rule = getDaycarePackageRule(packageName);
  return Boolean(
    rule &&
      daysUntilExpiration >= 0 &&
      daysUntilExpiration <= rule.expirationWindowDays
  );
}

export function isWithinExpiredDaycarePackageWindow(
  packageName: string | null | undefined,
  daysUntilExpiration: number
): boolean {
  return Boolean(
    getDaycarePackageRule(packageName) &&
      daysUntilExpiration < 0 &&
      daysUntilExpiration >= -EXPIRED_DAYCARE_PACKAGE_WINDOW_DAYS
  );
}

export type DaycarePackageCreditReportRow = {
  packageId: string;
  customerId: string;
  customerName: string;
  email: string | null;
  phone: string | null;
  packageName: string;
  remainingCredits: number;
  expirationDate: string;
  purchaseTime: string | null;
  expirationWindowDays: number;
  daysUntilExpiration: number;
};

export type DaycarePackageCreditReport = {
  generatedAt: string;
  customersScanned: number;
  packagesScanned: number;
  matchingPackagesScanned: number;
  packageCount: number;
  totalRemainingCredits: number;
  rows: DaycarePackageCreditReportRow[];
};
