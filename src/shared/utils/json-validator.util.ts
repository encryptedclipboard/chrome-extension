import type { StorageItem } from "../types/storage-item.type";

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  data?: any;
}

export interface JsonSchema {
  type: string;
  properties?: { [key: string]: any };
  required?: string[];
  additionalProperties?: boolean;
  [key: string]: any;
}

export class JsonValidator {
  /**
   * Validate JSON string
   */
  validate(jsonString: string, schema?: JsonSchema): ValidationResult {
    try {
      // Parse JSON
      const data = JSON.parse(jsonString);

      if (!schema) {
        return {
          isValid: true,
          errors: [],
          data,
        };
      }

      // Basic schema validation
      const errors = this.validateAgainstSchema(data, schema);

      return {
        isValid: errors.length === 0,
        errors,
        data,
      };
    } catch (parseError) {
      return {
        isValid: false,
        errors: [
          `Invalid JSON: ${parseError instanceof Error ? parseError.message : "Parse error"}`,
        ],
      };
    }
  }

  /**
   * Basic schema validation
   */
  private validateAgainstSchema(
    data: any,
    schema: JsonSchema,
    path = "root",
  ): string[] {
    const errors: string[] = [];

    // Type validation
    if (schema.type) {
      const actualType = Array.isArray(data) ? "array" : typeof data;
      if (actualType !== schema.type) {
        errors.push(`${path}: Expected ${schema.type}, got ${actualType}`);
        return errors;
      }
    }

    // Object validation
    if (schema.type === "object" && typeof data === "object" && data !== null) {
      // Required properties
      if (schema.required) {
        for (const reqProp of schema.required) {
          if (!(reqProp in data)) {
            errors.push(`${path}: Missing required property '${reqProp}'`);
          }
        }
      }

      // Property validation
      if (schema.properties) {
        for (const [propName, propSchema] of Object.entries(
          schema.properties,
        )) {
          if (propName in data) {
            const propErrors = this.validateAgainstSchema(
              data[propName],
              propSchema,
              `${path}.${propName}`,
            );
            errors.push(...propErrors);
          }
        }
      }
    }

    return errors;
  }

  /**
   * Validate storage item value
   */
  validateStorageItem(
    item: StorageItem,
    schema?: JsonSchema,
  ): ValidationResult {
    if (!schema) {
      // Basic validation without schema
      try {
        const parsed = JSON.parse(item.value);
        return {
          isValid: true,
          errors: [],
          data: parsed,
        };
      } catch {
        // Not JSON, treat as string
        return {
          isValid: true,
          errors: [],
          data: item.value,
        };
      }
    }

    return this.validate(item.value, schema);
  }

  /**
   * Generate basic schema from data
   */
  generateSchema(data: any): JsonSchema {
    if (typeof data === "string") {
      return { type: "string" };
    }

    if (typeof data === "number") {
      return { type: "number" };
    }

    if (typeof data === "boolean") {
      return { type: "boolean" };
    }

    if (Array.isArray(data)) {
      const itemType = data.length > 0 ? typeof data[0] : "string";
      return {
        type: "array",
        items: { type: itemType },
      };
    }

    if (typeof data === "object" && data !== null) {
      const properties: { [key: string]: any } = {};
      const required: string[] = [];

      Object.keys(data).forEach((key) => {
        properties[key] = this.generateSchema(data[key]);
        required.push(key);
      });

      return {
        type: "object",
        properties,
        required,
        additionalProperties: false,
      };
    }

    return { type: "string" };
  }

  /**
   * Common validation schemas
   */
  static getCommonSchemas(): { [name: string]: JsonSchema } {
    return {
      "User Profile": {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          email: { type: "string" },
          age: { type: "number" },
        },
        required: ["id", "name", "email"],
        additionalProperties: false,
      },
      "API Response": {
        type: "object",
        properties: {
          data: { type: "object" },
          message: { type: "string" },
        },
        additionalProperties: true,
      },
      Settings: {
        type: "object",
        properties: {
          theme: { type: "string" },
          notifications: { type: "boolean" },
          language: { type: "string" },
        },
        additionalProperties: true,
      },
    };
  }
}

export const jsonValidator = new JsonValidator();
