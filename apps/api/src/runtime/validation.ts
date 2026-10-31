import type { PropertyValidators } from "convex/values";
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function validate(schema: unknown, value: unknown, path: string): void {
  if (!record(schema)) throw new Error("Invalid validator");
  const fail = () => {
    throw new Error(`Invalid ${path}`);
  };
  switch (schema.type) {
    case "string":
    case "id":
      if (
        typeof value === "string" &&
        (schema.type !== "id" || value.length > 0)
      )
        return;
      break;
    case "number":
      if (typeof value === "number" && Number.isFinite(value)) return;
      break;
    case "boolean":
      if (typeof value === "boolean") return;
      break;
    case "null":
      if (value === null) return;
      break;
    case "literal":
      if (value === schema.value) return;
      break;
    case "array":
      if (Array.isArray(value) && value.length <= 8192) {
        value.forEach((item, i) =>
          validate(schema.value, item, `${path}[${i}]`),
        );
        return;
      }
      break;
    case "union":
      if (Array.isArray(schema.value))
        for (const option of schema.value) {
          try {
            validate(option, value, path);
            return;
          } catch {}
        }
      break;
    case "object":
      if (record(value) && record(schema.value)) {
        for (const key of Object.keys(value))
          if (!Object.hasOwn(schema.value, key)) fail();
        for (const [key, field] of Object.entries(schema.value)) {
          if (!record(field)) fail();
          const definition = field as Record<string, unknown>;
          if (value[key] === undefined && definition.optional) continue;
          validate(definition.fieldType, value[key], `${path}.${key}`);
        }
        return;
      }
      break;
  }
  fail();
}
export function validateArgs(fields: PropertyValidators, value: unknown) {
  validate(
    {
      type: "object",
      value: Object.fromEntries(
        Object.entries(fields).map(([key, validator]) => [
          key,
          {
            fieldType: (validator as unknown as { json: unknown }).json,
            optional: validator.isOptional === "optional",
          },
        ]),
      ),
    },
    value,
    "request",
  );
}
