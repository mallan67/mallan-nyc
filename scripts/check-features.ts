import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const l = await prisma.listing.findUnique({ where: { listing_id: 'RLS20071624' } });
  if (!l) { console.log('NOT FOUND'); return; }
  const f = (l.features as Record<string, unknown>) || {};
  const allKeys = Object.keys(f).sort();
  console.log('Total feature keys:', allKeys.length);
  console.log('All keys:', allKeys.join(', '));
  console.log('---');
  console.log('BuildingFeatures:', f.BuildingFeatures ?? 'MISSING');
  console.log('AssociationAmenities:', f.AssociationAmenities ?? 'MISSING');
  console.log('CommunityFeatures:', f.CommunityFeatures ?? 'MISSING');
  console.log('SecurityFeatures:', f.SecurityFeatures ?? 'MISSING');
  console.log('InteriorFeatures:', f.InteriorFeatures ?? 'MISSING');
  console.log('ExteriorFeatures:', f.ExteriorFeatures ?? 'MISSING');
  console.log('Appliances:', f.Appliances ?? 'MISSING');
  console.log('AttendanceType:', f.AttendanceType ?? 'MISSING');
  console.log('LaundryFeatures:', f.LaundryFeatures ?? 'MISSING');
  console.log('ElevatorYN:', f.ElevatorYN ?? 'MISSING');
  console.log('PetsAllowed:', f.PetsAllowed ?? 'MISSING');
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
