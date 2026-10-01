import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).transform(value => value || null);
const optionalInteger = (max: number) => z.number().int().min(0).max(max).nullable();
const optionalMoney = z.string().refine(value => value === "" || /^\d{1,8}(\.\d{1,2})?$/.test(value), "Enter a valid amount").transform(value => value || null).optional();
const optionalDate = z.string().refine(value => {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Enter a valid date");

export const vanProfileSchema = z.object({
  year: optionalInteger(2100).refine(value => value === null || value >= 1900),
  make: optionalText(100), model: optionalText(100), vin: optionalText(17),
  licensePlate: optionalText(30), mileage: optionalInteger(10_000_000),
  status: z.enum(["ACTIVE", "IN_SERVICE", "OUT_OF_SERVICE"]),
  registrationExpiry: optionalDate, insuranceExpiry: optionalDate, inspectionExpiry: optionalDate,
  insuranceCarrier: optionalText(200),
  insuranceDeductible: optionalMoney,
  insurancePremium: optionalMoney,
  notes: z.string().trim().max(10000),
});

export const vanInsuranceSchema = z.object({
  insuranceCarrier: optionalText(200),
  insuranceDeductible: optionalMoney,
  insurancePremium: optionalMoney,
});

export const vanRecordSchema = z.object({
  serviceDate: optionalDate.refine(Boolean, "Service date is required"),
  category: z.enum(["Routine service", "Oil change", "Tires", "Brakes", "Inspection", "Repair", "Other"]),
  description: z.string().trim().min(1).max(10000),
  mileage: z.union([z.string(), z.number()]).transform(value => value === "" ? null : Number(value))
    .refine(value => value === null || (Number.isInteger(value) && value >= 0 && value <= 10_000_000)),
  vendor: optionalText(200),
  cost: z.string().refine(value => value === "" || (/^\d{1,8}(\.\d{1,2})?$/.test(value) && Number(value) >= 0), "Enter a valid cost"),
  nextDueDate: optionalDate,
  nextDueMileage: z.union([z.string(), z.number()]).transform(value => value === "" ? null : Number(value))
    .refine(value => value === null || (Number.isInteger(value) && value >= 0 && value <= 10_000_000)),
  notes: z.string().trim().max(10000),
  invoiceNumber: optionalText(100).optional(),
  workOrderNumber: optionalText(100).optional(),
  subtotal: optionalMoney,
  tax: optionalMoney,
  amountPaid: optionalMoney,
  balanceDue: optionalMoney,
});

export const dateOrNull = (value: string) => value ? new Date(`${value}T00:00:00Z`) : null;

export const vanDocumentSchema = z.object({
  category: z.enum(["Title", "Registration", "Inspection", "Insurance", "Maintenance", "Other"]),
  title: z.string().trim().min(1).max(200),
  issueDate: optionalDate,
  expiryDate: optionalDate,
  notes: z.string().trim().max(2000),
});
