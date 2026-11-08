/*
  Warnings:

  - A unique constraint covering the columns `[id,sport_id]` on the table `categories` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[id,group_id]` on the table `court_bookings` will be added. If there are existing duplicate values, this will fail.
  - Made the column `payment_method` on table `court_bookings` required. This step will fail if there are existing NULL values in that column.
  - Made the column `payment_status` on table `court_bookings` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "products" DROP CONSTRAINT "products_category_id_fkey";

-- DropIndex
DROP INDEX "court_booking_group_members_group_id_user_id_key";

-- AlterTable
ALTER TABLE "court_bookings" ADD COLUMN     "checkout_id" UUID,
ALTER COLUMN "payment_method" SET NOT NULL,
ALTER COLUMN "payment_method" SET DEFAULT 'CASH',
ALTER COLUMN "payment_status" SET NOT NULL,
ALTER COLUMN "payment_status" SET DEFAULT 'UNPAID';

-- CreateIndex
CREATE UNIQUE INDEX "categories_id_sport_id_key" ON "categories"("id", "sport_id");

-- CreateIndex
CREATE UNIQUE INDEX "court_bookings_id_group_id_key" ON "court_bookings"("id", "group_id");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_sport_id_fkey" FOREIGN KEY ("category_id", "sport_id") REFERENCES "categories"("id", "sport_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- CUSTOM POSTGRESQL EXTENSIONS, PARTIAL INDEXES & EXCLUSION CONSTRAINTS
-- ============================================================================

-- 1. Cài đặt extension btree_gist (hỗ trợ toán tử = cho UUID kết hợp && cho tsrange)
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- 2. Partial Unique Indexes (Những index có điều kiện WHERE)
-- Mỗi sản phẩm chỉ có tối đa 1 ảnh đại diện chính
CREATE UNIQUE INDEX "uq_product_images_one_primary" 
    ON "product_images"("product_id") 
    WHERE "is_primary" = TRUE;

-- Chặn phân công trùng nhân viên vào cùng 1 sân khi phân công cũ chưa kết thúc
CREATE UNIQUE INDEX "uq_active_court_staff_assignment" 
    ON "court_staff_assignments"("user_id", "court_id") 
    WHERE "unassigned_at" IS NULL;

-- Mỗi sân chỉ có tối đa 1 lệnh khóa tạm thời đang có hiệu lực
CREATE UNIQUE INDEX "uq_active_court_lock" 
    ON "court_locks"("court_id") 
    WHERE "released_at" IS NULL;

-- Chỉ chặn trùng thành viên khi đang ở trạng thái JOINED (cho phép rời nhóm rồi vào lại)
CREATE UNIQUE INDEX "uq_group_members_active_user" 
    ON "court_booking_group_members"("group_id", "user_id") 
    WHERE "status" = 'JOINED';

-- Mỗi nhóm chỉ có duy nhất 1 OWNER đang tham gia
CREATE UNIQUE INDEX "uq_group_members_one_owner" 
    ON "court_booking_group_members"("group_id") 
    WHERE "role" = 'OWNER' AND "status" = 'JOINED';

-- 3. Composite FK nâng cao cho phân công sân trong nhóm:
-- Đảm bảo sân được gán cho thành viên phải thuộc đúng group_id đó, 
-- và nếu booking bị xóa thì chỉ set NULL cột assigned_court_booking_id (giữ nguyên group_id)
ALTER TABLE "court_booking_group_members"
    DROP CONSTRAINT IF EXISTS "court_booking_group_members_assigned_court_booking_id_fkey",
    ADD CONSTRAINT "fk_group_members_assigned_booking"
        FOREIGN KEY ("assigned_court_booking_id", "group_id")
        REFERENCES "court_bookings"("id", "group_id")
        ON DELETE SET NULL ("assigned_court_booking_id");

-- 4. CHECK Constraints bảo vệ toàn vẹn nghiệp vụ
ALTER TABLE "product_variants"
    ADD CONSTRAINT "chk_variants_price_non_negative" CHECK ("price" >= 0),
    ADD CONSTRAINT "chk_variants_stock_non_negative" CHECK ("stock_quantity" >= 0);

ALTER TABLE "inventory_transactions"
    ADD CONSTRAINT "chk_inv_tx_stock_non_negative" CHECK ("stock_before" >= 0 AND "stock_after" >= 0),
    ADD CONSTRAINT "chk_inv_tx_math" CHECK ("stock_before" + "quantity" = "stock_after");

ALTER TABLE "court_bookings"
    ADD CONSTRAINT "chk_bookings_time_valid" CHECK ("end_time" > "start_time"),
    ADD CONSTRAINT "chk_bookings_total_amount" CHECK ("total_amount" >= 0),
    ADD CONSTRAINT "chk_bookings_online_user" CHECK ("source" = 'OFFLINE' OR "user_id" IS NOT NULL),
    ADD CONSTRAINT "chk_bookings_group_online" CHECK ("group_id" IS NULL OR "source" = 'ONLINE');

ALTER TABLE "court_booking_groups"
    ADD CONSTRAINT "chk_groups_time_valid" CHECK ("end_time" > "start_time"),
    ADD CONSTRAINT "chk_groups_members_valid" CHECK (
        "required_members" >= 2 AND 
        "current_members" >= 1 AND 
        "current_members" <= "required_members"
    );

ALTER TABLE "court_booking_group_members"
    ADD CONSTRAINT "chk_group_members_status_state" CHECK (
        ("status" = 'JOINED' AND "left_at" IS NULL) OR
        ("status" = 'LEFT' AND "left_at" IS NOT NULL AND "assigned_court_booking_id" IS NULL)
    );

-- 5. EXCLUSION CONSTRAINT: Chống đặt trùng lịch sân tuyệt đối ở mức Engine (Mã lỗi PG: 23P01)
ALTER TABLE "court_bookings"
    ADD CONSTRAINT "excl_court_bookings_no_overlap" EXCLUDE USING gist (
        "court_id" WITH =,
        tsrange("booking_date" + "start_time", "booking_date" + "end_time", '[)') WITH &&
    ) WHERE ("status" IN ('PENDING_CONFIRMATION', 'CONFIRMED'));