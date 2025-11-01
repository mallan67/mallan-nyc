// app/api/crm/deals/route.ts
import { NextResponse } from "next/server";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function GET() {
  try {
    const rows = await q(`
      SELECT
        agent_full_name,
        representation_label,
        property_address,
        price_usd,
        -- commission_rate_percent: format numeric, otherwise return text form
        CASE
          WHEN pg_typeof(commission_rate_percent)::text IN ('numeric','double precision','integer','bigint','real')
            THEN TO_CHAR(commission_rate_percent::numeric, 'FM999999990.000')
          ELSE COALESCE(commission_rate_percent::text, 'NULL')
        END AS commission_rate_percent,
        -- split_percent
        CASE
          WHEN pg_typeof(split_percent)::text IN ('numeric','double precision','integer','bigint','real')
            THEN TO_CHAR(split_percent::numeric, 'FM999999990.000')
          ELSE COALESCE(split_percent::text, 'NULL')
        END AS split_percent,
        -- agent_fee_usd
        CASE
          WHEN pg_typeof(agent_fee_usd)::text IN ('numeric','double precision','integer','bigint','real')
            THEN TO_CHAR(agent_fee_usd::numeric, 'FM9999999990')
          ELSE COALESCE(agent_fee_usd::text, 'NULL')
        END AS agent_fee_usd,
        -- company_fee_usd
        CASE
          WHEN pg_typeof(company_fee_usd)::text IN ('numeric','double precision','integer','bigint','real')
            THEN TO_CHAR(company_fee_usd::numeric, 'FM9999999990')
          ELSE COALESCE(company_fee_usd::text, 'NULL')
        END AS company_fee_usd,
        -- gross_commission_usd
        CASE
          WHEN pg_typeof(gross_commission_usd)::text IN ('numeric','double precision','integer','bigint','real')
            THEN TO_CHAR(gross_commission_usd::numeric, 'FM9999999990')
          ELSE COALESCE(gross_commission_usd::text, 'NULL')
        END AS gross_commission_usd,
        -- contract_signed (date/timestamp formatting)
        CASE
          WHEN pg_typeof(contract_signed)::text LIKE '%timestamp%' OR pg_typeof(contract_signed)::text LIKE '%date%'
            THEN TO_CHAR(contract_signed::timestamp, 'MM/DD/YYYY')
          ELSE COALESCE(contract_signed::text, 'NULL')
        END AS contract_signed,
        -- contract_closed
        CASE
          WHEN pg_typeof(contract_closed)::text LIKE '%timestamp%' OR pg_typeof(contract_closed)::text LIKE '%date%'
            THEN TO_CHAR(contract_closed::timestamp, 'MM/DD/YYYY')
          ELSE COALESCE(contract_closed::text, 'NULL')
        END AS contract_closed
      FROM agent_deals_v
      ORDER BY contract_signed NULLS LAST, agent_full_name
    `);
    return NextResponse.json(rows);
  } catch (e:any) {
    return NextResponse.json(
      { ok: false, reason: "deals query failed", error: String(e?.message ?? e) },
      { status: 200 }
    );
  }
}
