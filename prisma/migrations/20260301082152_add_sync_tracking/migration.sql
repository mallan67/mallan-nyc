-- AlterTable
ALTER TABLE "listings" ADD COLUMN     "last_synced_from_trestle" TIMESTAMP(3),
ADD COLUMN     "sync_status" TEXT DEFAULT 'pending';
