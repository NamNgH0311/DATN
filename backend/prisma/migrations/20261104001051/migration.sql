-- DropForeignKey
ALTER TABLE "court_booking_group_members" DROP CONSTRAINT "fk_group_members_assigned_booking";

-- AddForeignKey
ALTER TABLE "court_booking_group_members" ADD CONSTRAINT "court_booking_group_members_assigned_court_booking_id_fkey" FOREIGN KEY ("assigned_court_booking_id") REFERENCES "court_bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
