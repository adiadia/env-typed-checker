export type EnvDoctorIssue =
  | { key: string; kind: "missing"; message: string }
  | { key: string; kind: "invalid"; message: string };

export class EnvDoctorError extends Error {
  public readonly issues: EnvDoctorIssue[];

  constructor(issues: EnvDoctorIssue[]) {
    const header = "ENV validation failed";
    const lines = issues.map((i) => `- ${i.key}: ${i.message}`);
    super([header, ...lines].join("\n"));
    this.name = "EnvDoctorError";
    this.issues = issues;
  }
}
