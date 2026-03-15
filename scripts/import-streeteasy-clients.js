/**
 * Import StreetEasy client list into Prisma database.
 *
 * Usage: node scripts/import-streeteasy-clients.js
 *
 * Reads the Excel file, maps to Lead + ClientPreference models,
 * creates real records in the production DB.
 */
const path = require("node:path");
require("dotenv").config({ path: path.resolve(".env.local"), override: true });

const XLSX_PATH = "C:/Users/MayaAllan/Desktop/2026/streeteasy client list.xlsx";

// CSV data parsed from the spreadsheet (embedded to avoid xlsx dependency)
const RAW_CLIENTS = `PLACEHOLDER`;

async function run() {
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();

  // Get Maya's agent ID
  const maya = await prisma.agent.findFirst({ where: { email: "maya@mallan.nyc" } });
  if (!maya) {
    // Try alternate emails
    const alt = await prisma.agent.findFirst({ where: { role: "BROKER" } });
    if (!alt) { console.error("No broker agent found."); process.exit(1); }
    var agentId = alt.id;
    console.log("Using broker agent:", alt.email, "id:", String(alt.id));
  } else {
    var agentId = maya.id;
    console.log("Using Maya agent id:", String(maya.id));
  }

  // Parse CSV data
  const lines = csvData.split("\n").filter(Boolean);
  const headers = lines[0].split("\t");
  const rows = lines.slice(1).map(line => {
    const vals = line.split("\t");
    const obj = {};
    headers.forEach((h, i) => { obj[h.trim()] = (vals[i] || "").trim(); });
    return obj;
  });

  console.log(`\nFound ${rows.length} clients to import.\n`);

  let created = 0, skipped = 0, errors = 0;

  for (const row of rows) {
    const email = (row.Email || "").toLowerCase().trim();
    if (!email || !email.includes("@")) { skipped++; continue; }

    const name = row["CXN Name"] || row.Name || "";
    const nameParts = name.split(" ");
    const firstName = nameParts[0] || email.split("@")[0];
    const lastName = nameParts.slice(1).join(" ") || "";

    const neighborhood = row.Nabe || row.Name || "";
    const borough = row.Boro || "Manhattan";
    const priceStr = (row.Price || "").replace(/[^0-9]/g, "");
    const price = priceStr ? parseInt(priceStr) : null;
    const status = row.Status || "new";
    const note = row.Note || "";
    const buildingType = row["Building Type"] || "";
    const address = (row.Address || "") + (row.Unit ? " " + row.Unit : "");
    const saleType = row["Sale Type Name"] || "Resale";

    // Map StreetEasy status to pipeline_stage
    const statusMap = {
      "In Communication": "contacted",
      "Attempted Contact": "contacted",
      "Nurture": "nurturing",
      "Showing Homes": "showing",
      "Sale Closed": "closed",
      "Unresponsive": "nurturing",
      "Rejected": "past",
      "Spam": "past",
      "Agent Inquiry": "new",
      "Rental Inquiry": "new",
    };
    const pipelineStage = statusMap[status] || "new";

    // Map building type to property_types
    const typeMap = {
      "Coop": "Co-op",
      "Condo": "Condo",
      "Condop": "Condop",
      "Single-Family Townhouse": "Townhouse",
      "Single-Family House": "Townhouse",
      "Rental": "Rental",
      "Hybrid": "Co-op",
    };
    const propertyType = typeMap[buildingType] || buildingType;

    try {
      // Check if client already exists
      const existing = await prisma.lead.findUnique({ where: { email } });
      if (existing) {
        skipped++;
        continue;
      }

      // Create lead
      const lead = await prisma.lead.create({
        data: {
          first_name: firstName,
          last_name: lastName,
          email: email,
          phone: "",
          roles: ["buyer"],
          portal_role: "buyer",
          status: pipelineStage === "past" || pipelineStage === "closed" ? "closed" : "active",
          pipeline_stage: pipelineStage,
          agent_id: agentId,
          source: "streeteasy",
          consent_captured_at: new Date(),
        },
      });

      // Create preferences if we have neighborhood/price data
      if (neighborhood || price) {
        await prisma.clientPreference.create({
          data: {
            lead_id: lead.id,
            neighborhoods: neighborhood ? [neighborhood] : [],
            boroughs: borough ? [borough] : [],
            property_types: propertyType ? [propertyType] : [],
            min_price: price ? Math.round(price * 0.8) : null,
            max_price: price || null,
          },
        });
      }

      // Add note as activity log if exists
      if (note) {
        await prisma.activityLog.create({
          data: {
            lead_id: lead.id,
            activity_type: "note",
            title: "StreetEasy Import Note",
            detail: note,
            actor_type: "system",
          },
        });
      }

      created++;
      if (created % 10 === 0) console.log(`  Created ${created}...`);
    } catch (err) {
      errors++;
      console.error(`  Error for ${email}:`, err.message);
    }
  }

  console.log(`\n════════════════════════════════════`);
  console.log(`  Import Complete`);
  console.log(`  Created: ${created}`);
  console.log(`  Skipped: ${skipped} (duplicate or invalid)`);
  console.log(`  Errors:  ${errors}`);
  console.log(`════════════════════════════════════\n`);

  await prisma.$disconnect();
}

// ── Embedded CSV data (tab-separated) ──
const csvData = `Email\tCXN Name\tAddress\tUnit\tBoro\tName\tNabe\tPrice\tStatus\tNote\tSale Type Name\tBuilding Type
sstarna@deloitte.com\tstefanie starna\t128 WEST 95th STREET\t\tManhattan\tAll Upper West Side\tUpper West Side\t4300000\tUnresponsive\tattempted contact no response\tResale\tSingle-Family Townhouse
yasminetawil@gmail.com\tYasmine Tawil\t48 WEST 69 STREET\t\tManhattan\tUpper West Side\tLincoln Square\t85000000\tIn Communication\tI finally spoke to her, she and her fiancé live abroad\tResale\tSingle-Family Townhouse
polovetsstan@gmail.com\tStan\t311 WEST 74 STREET\t\tManhattan\tAll Upper West Side\tUpper West Side\t11500000\tNurture\tI showed and tried to schedule another showing\tResale\tSingle-Family House
brianna.scarda@gmail.com\tBrianna Scarda\t315 WEST 71 STREET\t\tManhattan\tUpper West Side\tLincoln Square\t4195000\tIn Communication\t\tResale\tRental
houck.joseph@gmail.com\tJoseph Houck\t123 WEST 74 STREET\t#4C\tManhattan\tAll Upper West Side\tUpper West Side\t1200000\tAttempted Contact\t\tResale\tCoop
mjvolpe2@gmail.com\tMathew Volpe\t148 BANK STREET\t#3B\tManhattan\tAll Downtown\tWest Village\t1500000\tAttempted Contact\t\tResale\tCoop
michysy@gmail.com\tMichelle Sy\t160 EAST 38 STREET\t#15D\tManhattan\tMidtown East\tMurray Hill\t1190000\tNurture\tNeeds to see if she will have funds\tResale\tCoop
mustafa.gandhi9@gmail.com\tMustafa Gandhi\t160 EAST 38 STREET\t#6A\tManhattan\tMidtown East\tMurray Hill\t1325000\tAttempted Contact\tI have emailed, called and texted several times\tResale\tCoop
jb@neosophic.com\tJay Bhattacharya\t160 EAST 38 STREET\t#15B\tManhattan\tMidtown East\tMurray Hill\t985000\tIn Communication\t\tResale\tCoop
chopram@gmail.com\tMona Chopra\t160 EAST 38 STREET\t#18E\tManhattan\tMidtown East\tMurray Hill\t1295000\tNurture\tSent Monthly listings out\tResale\tCoop
kahliloppenheimer@gmail.com\tKahlil Oppenheimer\t169 WEST 73 STREET\t#6\tManhattan\tAll Upper West Side\tUpper West Side\t724000\tIn Communication\tHe provided some information, sent him listings\tResale\tCoop
corrieostrander@gmail.com\tCorrie Ostrander\t236 EAST 28 STREET\t#5B\tManhattan\tMidtown East\tKips Bay\t450000\tIn Communication\tI have followed up with corrie\tResale\tCoop
mdlnmontgomery@gmail.com\tMadeline Montgomery\t24 WEST 83 STREET\t#5R\tManhattan\tAll Upper West Side\tUpper West Side\t999999\tIn Communication\tattempted contact. emailed and texted.\tResale\tCoop
charliepaige@gmail.com\tCharlotte Eisenberg\t24 WEST 83 STREET\t#5R\tManhattan\tAll Upper West Side\tUpper West Side\t999999\tNurture\t\tResale\tCoop
queenieyi7@gmail.com\tYi\t350 WEST 42 STREET\t#12C\tManhattan\tMidtown West\tHell's Kitchen\t880000\tIn Communication\t\tResale\tCondo
zkosmond@gmail.com\tZoe Osmond\t350 WEST 42 STREET\t#14L\tManhattan\tMidtown West\tHell's Kitchen\t1295000\tNurture\t\tResale\tCondo
tiffanylin276@gmail.com\tTiffany Lin\t333 EAST 46 STREET\t#8H\tManhattan\tMidtown East\tTurtle Bay\t699999\tNurture\tI spoke to Tiffany, her parents need to decide\tResale\tCondop
n.alvo23@gmail.com\tN Alvo\t333 EAST 46 STREET\t#PHA\tManhattan\tMidtown East\tTurtle Bay\t1375000\tIn Communication\t\tResale\tCondop
sales@hod.live\tArihant Jain\t100 UNITED NATIONS PLAZA\t#35E\tManhattan\tMidtown East\tTurtle Bay\t1375000\tIn Communication\tI have made contact with the buyer\tResale\tCondo
arunnaikmd@yahoo.com\tArun Naik\t100 UNITED NATIONS PLAZA\t#35A\tManhattan\tMidtown East\tTurtle Bay\t2450000\tNurture\tShowing a few apartments\tResale\tCondo
lgerkis@gmail.com\tLaura Gerkis\t300 EAST 71 STREET\t#4M\tManhattan\tUpper East Side\tLenox Hill\t1395000\tIn Communication\t\tResale\tCoop
benhen@chartior.com\tBen\t250 EAST 65 STREET\t#11A\tManhattan\tUpper East Side\tLenox Hill\t1650000\tNurture\tTried to contact him again no response\tResale\tCondo
grant.chen77@gmail.com\tGrant Chen\t250 EAST 65 STREET\t#5E\tManhattan\tUpper East Side\tLenox Hill\t2650000\tNurture\tThe phone number he has is not his\tResale\tCondo
nsimone21@gmail.com\tNicholas Simone\t400 EAST 90 STREET\t#6F\tManhattan\tUpper East Side\tYorkville\t795000\tNurture\t\tResale\tCondo
kristapontzer@gmail.com\tKrista Pontzer\t166 PERRY STREET\t#3B\tManhattan\tAll Downtown\tWest Village\t2590000\tShowing Homes\tSent another list of listings\tResale\tCondo
linda33johnson@gmail.com\tLinda Johnson\t166 PERRY STREET\t#4A\tManhattan\tAll Downtown\tWest Village\t2495000\tSale Closed\tContract out on 166 Perry Street unit 4A\tResale\tCondo
omdalleva@gmail.com\tOlivia Dalleva\t712 WASHINGTON STREET\t#3A\tManhattan\tAll Downtown\tWest Village\t1050000\tNurture\tSent Monthly listings out\tResale\tCoop
fongtinyik@gmail.com\tIan Fang\t425 PARK AVENUE SOUTH\t#14B\tManhattan\tFlatiron\tNoMad\t1125000\tNurture\tSent hi update on some listings\tResale\tCoop
angelachoksi@gmail.com\tAngela Choksi\t425 PARK AVENUE SOUTH\t#3C\tManhattan\tFlatiron\tNoMad\t975000\tUnresponsive\tThe client has cancelled the appointment\tResale\tCoop`;

run().catch((e) => { console.error(e); process.exit(1); });
