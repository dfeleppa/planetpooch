import { Company, Role } from "@prisma/client";
import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      company: Company | null;
      jobTitle: string | null;
      mustChangePassword: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
    company?: Company | null;
    jobTitle?: string | null;
    mustChangePassword?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    company?: Company | null;
    jobTitle?: string | null;
    mustChangePassword?: boolean;
  }
}
