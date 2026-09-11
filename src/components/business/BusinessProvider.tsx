"use client";

import { createContext, useContext } from "react";
import type { Business } from "@/lib/business";

const BusinessContext = createContext<Business | null>(null);

export function BusinessProvider({ business, children }: { business: Business; children: React.ReactNode }) {
  return <BusinessContext.Provider value={business}>{children}</BusinessContext.Provider>;
}

export function useBusiness(): Business {
  const business = useContext(BusinessContext);
  if (!business) throw new Error("BusinessProvider is required");
  return business;
}
