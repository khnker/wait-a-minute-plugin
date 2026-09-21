export function validateConfig(config, schema) {
  const errors = [];

  function validatePath(value, sub, path) {
    if (sub.type === 'object' && sub.properties) {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        if (sub.required) errors.push(`${path}: expected object`);
        return;
      }
      for (const key of Object.keys(sub.properties)) {
        const childSchema = sub.properties[key];
        validatePath(value[key], childSchema, path ? `${path}.${key}` : key);
      }
      // Reject extra keys if additionalProperties is explicitly false.
      if (sub.additionalProperties === false) {
        for (const key of Object.keys(value)) {
          if (!(key in sub.properties)) {
            errors.push(`${path ? path + '.' : ''}${key}: unexpected property`);
          }
        }
      }
      return;
    }

    const isPresent = value !== undefined;
    if (sub.required && !isPresent) {
      errors.push(`${path}: required`);
      return;
    }
    if (!isPresent) return;

    switch (sub.type) {
      case 'string':
        if (typeof value !== 'string') {
          errors.push(`${path}: expected string`);
        } else {
          if (sub.minLength !== undefined && value.length < sub.minLength) {
            errors.push(`${path}: shorter than minLength ${sub.minLength}`);
          }
          if (sub.maxLength !== undefined && value.length > sub.maxLength) {
            errors.push(`${path}: longer than maxLength ${sub.maxLength}`);
          }
          if (sub.pattern !== undefined && !sub.pattern.test(value)) {
            errors.push(`${path}: does not match pattern`);
          }
          if (sub.enum && !sub.enum.includes(value)) {
            errors.push(`${path}: must be one of ${sub.enum.join(', ')}`);
          }
        }
        break;
      case 'number':
        if (typeof value !== 'number' || Number.isNaN(value)) {
          errors.push(`${path}: expected number`);
        } else {
          if (sub.minimum !== undefined && value < sub.minimum) {
            errors.push(`${path}: below minimum ${sub.minimum}`);
          }
          if (sub.maximum !== undefined && value > sub.maximum) {
            errors.push(`${path}: above maximum ${sub.maximum}`);
          }
        }
        break;
      case 'integer': {
        if (typeof value !== 'number' || !Number.isInteger(value)) {
          errors.push(`${path}: expected integer`);
        } else {
          if (sub.minimum !== undefined && value < sub.minimum) {
            errors.push(`${path}: below minimum ${sub.minimum}`);
          }
          if (sub.maximum !== undefined && value > sub.maximum) {
            errors.push(`${path}: above maximum ${sub.maximum}`);
          }
        }
        break;
      }
      case 'boolean':
        if (typeof value !== 'boolean') errors.push(`${path}: expected boolean`);
        break;
      case 'array':
        if (!Array.isArray(value)) {
          errors.push(`${path}: expected array`);
        } else {
          if (sub.minItems !== undefined && value.length < sub.minItems) {
            errors.push(`${path}: fewer than minItems ${sub.minItems}`);
          }
          if (sub.maxItems !== undefined && value.length > sub.maxItems) {
            errors.push(`${path}: more than maxItems ${sub.maxItems}`);
          }
          if (sub.items) {
            value.forEach((item, i) => validatePath(item, sub.items, `${path}[${i}]`));
          }
        }
        break;
      default:
        // Unknown type — pass through (lenient).
        break;
    }
  }

  validatePath(config, schema, '');
  return { valid: errors.length === 0, errors };
}
