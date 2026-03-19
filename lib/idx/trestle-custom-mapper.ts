/**
 * lib/idx/trestle-custom-mapper.ts
 * Defensive helpers to lift folded Trestle CustomProperty / Media into the raw object.
 * Uses `any` intentionally to avoid TypeScript signature noise; mapping is best-effort.
 */

export function mapCustomProperties(source: any, target: any): any {
  if (!source || !target) return target;
  try {
    // If CustomProperty is an array of { Name, Value } items or object bags
    if (Array.isArray(source.CustomProperty)) {
      for (const cp of source.CustomProperty) {
        if (!cp || typeof cp !== 'object') continue;
        // shape A: name/value pair
        const name = cp.Name || cp.NameText || cp.PropertyName || cp.PropertyKey || cp.Field || cp.Key;
        const value = cp.Value ?? cp.ValueText ?? cp.PropertyValue ?? cp.Text ?? cp.ValueString ?? null;
        if (name !== undefined && name !== null) {
          const key = String(name);
          if (target[key] === undefined) target[key] = value;
          else {
            if (!Array.isArray(target[key])) target[key] = [target[key]];
            target[key].push(value);
          }
          continue;
        }
        // shape B: bag of keys — merge keys through
        for (const k of Object.keys(cp)) {
          const v = cp[k];
          if (v === undefined) continue;
          if (target[k] === undefined) target[k] = v;
          else {
            if (!Array.isArray(target[k])) target[k] = [target[k]];
            target[k].push(v);
          }
        }
      }
    } else if (source.CustomProperty && typeof source.CustomProperty === 'object') {
      // Some dumps present a single object of key/values
      for (const k of Object.keys(source.CustomProperty)) {
        const v = source.CustomProperty[k];
        if (v === undefined) continue;
        if (target[k] === undefined) target[k] = v;
        else {
          if (!Array.isArray(target[k])) target[k] = [target[k]];
          target[k].push(v);
        }
      }
    }
  } catch (e) {
    // non-fatal — best effort
  }
  return target;
}

export function mapMedia(source: any, target: any): any {
  if (!source || !target) return target;
  try {
    if (Array.isArray(source.Media)) {
      const normalized = source.Media.map((m: any) => {
        const out = { ...m };
        if (!out.MediaURL && (out.URL || out.Url)) out.MediaURL = out.URL || out.Url;
        return out;
      });
      target.Media = normalized;
    } else if (source.Media && typeof source.Media === 'object') {
      // If Media is an object with arrays, find and use first array
      for (const k of Object.keys(source.Media)) {
        if (Array.isArray(source.Media[k])) { target.Media = source.Media[k]; break; }
      }
    }
  } catch (e) {
    // ignore
  }
  return target;
}
