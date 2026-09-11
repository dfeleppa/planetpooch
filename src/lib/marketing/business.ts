import { getActiveBusiness } from "@/lib/business-server";

export async function marketingCompanyWhere() {
  return { company: (await getActiveBusiness()).company };
}

export async function marketingChildWhere() {
  return { idea: await marketingCompanyWhere() };
}

export async function marketingHookWhere() {
  return { script: await marketingChildWhere() };
}
