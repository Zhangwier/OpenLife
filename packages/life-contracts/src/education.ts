export const EducationComponents = {
  student: "education.student_status",
  level: "education.level",
} as const;

export const EducationRelations = {
  enrolledAt: "education.enrolled_at",
} as const;

export const EducationKinds = {
  school: "education.school",
} as const;

export const EducationLevels = ["none", "primary", "secondary", "higher"] as const;
export type EducationLevel = (typeof EducationLevels)[number];

export function educationLevelOf(
  components: Record<string, Record<string, unknown>>,
): EducationLevel {
  const level = components[EducationComponents.level] as { level?: string } | undefined;
  const value = level?.level;
  return (EducationLevels as readonly string[]).includes(value ?? "")
    ? (value as EducationLevel)
    : "none";
}
