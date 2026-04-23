import { Role } from "@prisma/client";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

export type ModuleWithProgress = {
  id: string;
  title: string;
  description: string;
  order: number;
  icon: string | null;
  totalLessons: number;
  completedLessons: number;
};

export type SubsectionWithLessons = {
  id: string;
  title: string;
  description: string;
  order: number;
  lessons: LessonWithCompletion[];
};

export type LessonWithCompletion = {
  id: string;
  title: string;
  order: number;
  estimatedMinutes: number | null;
  isCompleted: boolean;
  completedAt: Date | null;
};
