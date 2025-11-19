/* Minimal local fallback declaration for 'pg'
   This prevents "Could not find a declaration file for module 'pg'." in CI.
   It's intentionally tiny and does not change runtime behavior.
*/
declare module 'pg' {
  export interface QueryResultRow { [key: string]: any; }
  export interface QueryResult<T = any> { rows: T[]; }
  export class Pool {
    constructor(opts?: any);
    query(text: string, params?: any[]): Promise<QueryResult<any>>;
    connect(): Promise<any>;
    end(): Promise<void>;
  }
  const exported: { Pool: typeof Pool };
  export default exported;
  export = exported;
}
