export type EnvBaseType =
  | "string"
  | "number"
  | "boolean"
  | "json"
  | "url"
  | "email";

export type EnvStringSpec = EnvBaseType | `${EnvBaseType}?`;

// Object-style specs (for JSON-friendly advanced validators)
export type EnumSpec<T extends readonly string[] = readonly string[]> = {
  type: "enum";
  values: T;
  optional?: boolean;
};

export type RegexSpec = {
  type: "regex";
  pattern: string;
  flags?: string;
  optional?: boolean;
};

export type PrimitiveObjectSpec = {
  type: EnvBaseType; // "string" | "number" | ...
  optional?: boolean;
  default?: unknown; // default value if missing
};

export type EnvSchemaValue =
  | EnvStringSpec
  | EnumSpec
  | RegexSpec
  | PrimitiveObjectSpec;

export type EnvDoctorSchema = Record<string, EnvSchemaValue>;

export type EnvDoctorOptions = {
  loadDotEnv?: boolean;
  env?: Record<string, string | undefined>;
  strict?: boolean; // placeholder
};

/** ---- Type inference ---- */
type StripOptional<S extends string> = S extends `${infer T}?` ? T : S;

type InferBase<T extends EnvBaseType> = T extends "string"
  ? string
  : T extends "number"
    ? number
    : T extends "boolean"
      ? boolean
      : T extends "json"
        ? unknown
        : T extends "url"
          ? string
          : T extends "email"
            ? string
            : never;

type InferFromStringSpec<S extends EnvStringSpec> = InferBase<
  StripOptional<S> & EnvBaseType
>;

type InferFromValue<V> = V extends EnvStringSpec
  ? InferFromStringSpec<V>
  : V extends EnumSpec<infer T>
    ? T[number]
    : V extends RegexSpec
      ? string
      : never;

type IsOptional<V> = V extends `${string}?`
  ? true
  : V extends { optional: true }
    ? true
    : false;

type HasDefault<V> = V extends { default: any } ? true : false;

export type EnvDoctorResult<TSchema extends EnvDoctorSchema> = {
  [K in keyof TSchema]: HasDefault<TSchema[K]> extends true
    ? InferFromValue<TSchema[K]>
    : IsOptional<TSchema[K]> extends true
      ? InferFromValue<TSchema[K]> | undefined
      : InferFromValue<TSchema[K]>;
};
