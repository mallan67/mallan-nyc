declare module "soda" {
  /**
   * Generic soda helper. Returns an array of T (most usages expect an array).
   * Accepts an options object like { resource, where, order, limit } or a string.
   */
  export default function soda<T = any>(opts?: any): Promise<T[]>;
}

declare module "soda-js" {
  // If some code imports "soda-js", export an any fallback
  const s: any;
  export default s;
}
