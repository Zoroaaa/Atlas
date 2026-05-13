type SnakeToCamel<T extends string> = T extends `${infer A}_${infer B}`
  ? `${A}${Capitalize<SnakeToCamel<B>>}`
  : T;

export type CamelCaseKeys<T> = T extends Array<infer U>
  ? Array<CamelCaseKeys<U>>
  : T extends object
    ? { [K in keyof T as SnakeToCamel<K & string>]: CamelCaseKeys<T[K]> }
    : T;

function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

export function camelizeKeys<T>(input: unknown): T {
  if (input === null || input === undefined) {
    return input as T;
  }

  if (Array.isArray(input)) {
    return input.map((item) => camelizeKeys(item)) as T;
  }

  if (typeof input === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      result[toCamelCase(key)] = camelizeKeys(value);
    }
    return result as T;
  }

  return input as T;
}