-- AlterEnum
ALTER TYPE "CourtBookingStatus" ADD VALUE 'EXPIRED';

-- AlterTable
ALTER TABLE "court_booking_groups" ADD COLUMN     "expires_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "court_bookings" ADD COLUMN     "expires_at" TIMESTAMPTZ(3);
