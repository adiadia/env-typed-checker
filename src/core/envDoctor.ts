import * as dotenv from "dotenv";
import { validateAndParse } from "./runner";
import type { EnvDoctorOptions, EnvDoctorResult, EnvDoctorSchema } from "../types";

export type { EnvDoctorOptions, EnvDoctorSchema } from "../types";
export { EnvDoctorError } from "../errors/EnvDoctorError";

export function envDoctor<TSchema extends EnvDoctorSchema>(
  schema: TSchema,
  options: EnvDoctorOptions = {}
): EnvDoctorResult<TSchema> {
  const { loadDotEnv = true, env = process.env } = options;

  if (loadDotEnv) dotenv.config();

  return validateAndParse(schema, env);
}
