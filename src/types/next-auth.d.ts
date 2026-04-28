import { Company, Role } from "@prisma/client";
import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      company: Company | null;
      mustChangePassword: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
    company?: Company | null;
    mustChangePassword?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    // Optional because the jwt() callback clears it when the underlying user
    // row is deleted, signalling "invalid session" to the session callback.
    id?: string;
    role: Role;
    company?: Company | null;
    mustChangePassword?: boolean;
  }
}
