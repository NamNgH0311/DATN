-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'SALES_STAFF', 'FIELD_STAFF', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "InventoryTransactionType" AS ENUM ('IN', 'OUT', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_CONFIRMATION', 'CONFIRMED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('ONLINE', 'POS');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('COD', 'CASH', 'BANK_TRANSFER', 'SANDBOX_GATEWAY');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PAID', 'FAILED');

-- CreateEnum
CREATE TYPE "CourtOperationalStatus" AS ENUM ('AVAILABLE', 'IN_USE', 'MAINTENANCE', 'TEMPORARILY_LOCKED');

-- CreateEnum
CREATE TYPE "CourtBookingStatus" AS ENUM ('PENDING_CONFIRMATION', 'CONFIRMED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CourtBookingSource" AS ENUM ('ONLINE', 'OFFLINE');

-- CreateEnum
CREATE TYPE "CourtBookingCheckoutStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BookingGroupStatus" AS ENUM ('RECRUITING', 'FULL', 'PLAYING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GroupMemberRole" AS ENUM ('OWNER', 'MEMBER');

-- CreateEnum
CREATE TYPE "GroupMemberStatus" AS ENUM ('JOINED', 'LEFT');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "full_name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(20),
    "default_address" TEXT,
    "password_hash" TEXT NOT NULL,
    "refresh_token_hash" TEXT,
    "refresh_token_expires_at" TIMESTAMPTZ(3),
    "role" "UserRole" NOT NULL DEFAULT 'CUSTOMER',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_items" (
    "id" UUID NOT NULL,
    "cart_id" UUID NOT NULL,
    "product_variant_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "court_staff_assignments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "court_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unassigned_at" TIMESTAMPTZ(3),

    CONSTRAINT "court_staff_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sports" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "sport_id" UUID NOT NULL,
    "parent_id" UUID,
    "name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "sport_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(255) NOT NULL,
    "short_description" TEXT,
    "description" TEXT,
    "specs" JSONB,
    "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_images" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "alt_text" VARCHAR(255),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "sku" VARCHAR(100) NOT NULL,
    "name" VARCHAR(255),
    "attributes" JSONB,
    "price" DECIMAL(12,2) NOT NULL,
    "original_price" DECIMAL(12,2),
    "stock_quantity" INTEGER NOT NULL DEFAULT 0,
    "low_stock_threshold" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_transactions" (
    "id" UUID NOT NULL,
    "product_variant_id" UUID NOT NULL,
    "type" "InventoryTransactionType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "stock_before" INTEGER NOT NULL,
    "stock_after" INTEGER NOT NULL,
    "reason" VARCHAR(255) NOT NULL,
    "reference_type" VARCHAR(100),
    "reference_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "order_code" VARCHAR(50) NOT NULL,
    "user_id" UUID,
    "created_by_user_id" UUID,
    "customer_name" VARCHAR(120) NOT NULL,
    "customer_email" VARCHAR(255),
    "phone" VARCHAR(20) NOT NULL,
    "address" TEXT,
    "note" TEXT,
    "payment_method" "PaymentMethod" NOT NULL,
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "payment_transaction_id" VARCHAR(255),
    "payment_checkout_url" TEXT,
    "payment_idempotency_key" VARCHAR(160),
    "guest_cancel_token_hash" VARCHAR(255),
    "guest_cancel_token_expires_at" TIMESTAMPTZ(3),
    "guest_cancel_token_used_at" TIMESTAMPTZ(3),
    "payment_expires_at" TIMESTAMPTZ(3),
    "payment_paid_at" TIMESTAMPTZ(3),
    "payment_confirmed_by_id" UUID,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_CONFIRMATION',
    "source" "OrderSource" NOT NULL DEFAULT 'ONLINE',
    "total_amount" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "product_variant_id" UUID NOT NULL,
    "product_name" VARCHAR(255) NOT NULL,
    "variant_name" VARCHAR(255),
    "sku" VARCHAR(100) NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "line_total" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courts" (
    "id" UUID NOT NULL,
    "sport_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(150) NOT NULL,
    "location" VARCHAR(255),
    "price_per_hour" DECIMAL(12,2) NOT NULL,
    "status" "CourtOperationalStatus" NOT NULL DEFAULT 'AVAILABLE',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "courts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "court_locks" (
    "id" UUID NOT NULL,
    "court_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "locked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_at" TIMESTAMPTZ(3),
    "released_by" UUID,

    CONSTRAINT "court_locks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "court_booking_groups" (
    "id" UUID NOT NULL,
    "group_code" VARCHAR(50) NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "checkout_id" UUID,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "booking_date" DATE NOT NULL,
    "start_time" TIME(0) NOT NULL,
    "end_time" TIME(0) NOT NULL,
    "required_members" INTEGER NOT NULL,
    "current_members" INTEGER NOT NULL DEFAULT 1,
    "status" "BookingGroupStatus" NOT NULL DEFAULT 'RECRUITING',
    "slot_amount" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "court_booking_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "court_booking_group_members" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "GroupMemberRole" NOT NULL DEFAULT 'MEMBER',
    "status" "GroupMemberStatus" NOT NULL DEFAULT 'JOINED',
    "assigned_court_booking_id" UUID,
    "joined_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMPTZ(3),

    CONSTRAINT "court_booking_group_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "court_bookings" (
    "id" UUID NOT NULL,
    "booking_code" VARCHAR(50) NOT NULL,
    "court_id" UUID NOT NULL,
    "user_id" UUID,
    "group_id" UUID,
    "customer_name" VARCHAR(120) NOT NULL,
    "customer_phone" VARCHAR(20) NOT NULL,
    "booking_date" DATE NOT NULL,
    "start_time" TIME(0) NOT NULL,
    "end_time" TIME(0) NOT NULL,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "source" "CourtBookingSource" NOT NULL,
    "status" "CourtBookingStatus" NOT NULL DEFAULT 'PENDING_CONFIRMATION',
    "note" TEXT,
    "payment_method" "PaymentMethod",
    "payment_status" "PaymentStatus",
    "payment_transaction_id" VARCHAR(255),
    "payment_paid_at" TIMESTAMPTZ(3),
    "payment_confirmed_by_id" UUID,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "court_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "court_booking_checkouts" (
    "id" UUID NOT NULL,
    "checkout_code" VARCHAR(50) NOT NULL,
    "user_id" UUID NOT NULL,
    "customer_name" VARCHAR(120) NOT NULL,
    "customer_phone" VARCHAR(20) NOT NULL,
    "status" "CourtBookingCheckoutStatus" NOT NULL DEFAULT 'PENDING',
    "total_amount" DECIMAL(12,2) NOT NULL,
    "provider_transaction_id" VARCHAR(255),
    "checkout_url" TEXT,
    "idempotency_key" VARCHAR(160) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "paid_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "court_booking_checkouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "court_booking_holds" (
    "id" UUID NOT NULL,
    "checkout_id" UUID NOT NULL,
    "court_id" UUID NOT NULL,
    "booking_date" DATE NOT NULL,
    "start_time" TIME(0) NOT NULL,
    "end_time" TIME(0) NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "court_booking_holds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chatbot_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "chatbot_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chatbot_messages" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "model_used" VARCHAR(50) NOT NULL,
    "user_message" TEXT NOT NULL,
    "bot_response" TEXT NOT NULL,
    "token_count" INTEGER,
    "is_helpful" BOOLEAN,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chatbot_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chatbot_message_recommendations" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "product_variant_id" UUID,
    "recommendation_order" INTEGER NOT NULL,
    "snapshot_product_name" VARCHAR(255) NOT NULL,
    "snapshot_variant_name" VARCHAR(255),
    "snapshot_sku" VARCHAR(100),
    "snapshot_price" DECIMAL(12,2),
    "snapshot_product_status" VARCHAR(50) NOT NULL,
    "snapshot_variant_is_active" BOOLEAN,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chatbot_message_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_is_active_idx" ON "users"("role", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "carts_user_id_key" ON "carts"("user_id");

-- CreateIndex
CREATE INDEX "cart_items_product_variant_id_idx" ON "cart_items"("product_variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "cart_items_cart_id_product_variant_id_key" ON "cart_items"("cart_id", "product_variant_id");

-- CreateIndex
CREATE INDEX "court_staff_assignments_user_id_assigned_at_idx" ON "court_staff_assignments"("user_id", "assigned_at");

-- CreateIndex
CREATE INDEX "court_staff_assignments_court_id_assigned_at_unassigned_at_idx" ON "court_staff_assignments"("court_id", "assigned_at", "unassigned_at");

-- CreateIndex
CREATE UNIQUE INDEX "sports_slug_key" ON "sports"("slug");

-- CreateIndex
CREATE INDEX "sports_is_active_idx" ON "sports"("is_active");

-- CreateIndex
CREATE INDEX "categories_parent_id_idx" ON "categories"("parent_id");

-- CreateIndex
CREATE INDEX "categories_sport_id_is_active_sort_order_idx" ON "categories"("sport_id", "is_active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "categories_sport_id_slug_key" ON "categories"("sport_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");

-- CreateIndex
CREATE INDEX "products_sport_id_category_id_status_idx" ON "products"("sport_id", "category_id", "status");

-- CreateIndex
CREATE INDEX "product_images_product_id_sort_order_idx" ON "product_images"("product_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_sku_key" ON "product_variants"("sku");

-- CreateIndex
CREATE INDEX "product_variants_product_id_is_active_idx" ON "product_variants"("product_id", "is_active");

-- CreateIndex
CREATE INDEX "product_variants_stock_quantity_idx" ON "product_variants"("stock_quantity");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_id_product_id_key" ON "product_variants"("id", "product_id");

-- CreateIndex
CREATE INDEX "inventory_transactions_product_variant_id_created_at_idx" ON "inventory_transactions"("product_variant_id", "created_at");

-- CreateIndex
CREATE INDEX "inventory_transactions_type_created_at_idx" ON "inventory_transactions"("type", "created_at");

-- CreateIndex
CREATE INDEX "inventory_transactions_reference_type_reference_id_idx" ON "inventory_transactions"("reference_type", "reference_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_order_code_key" ON "orders"("order_code");

-- CreateIndex
CREATE UNIQUE INDEX "orders_payment_idempotency_key_key" ON "orders"("payment_idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "orders_guest_cancel_token_hash_key" ON "orders"("guest_cancel_token_hash");

-- CreateIndex
CREATE INDEX "orders_user_id_created_at_idx" ON "orders"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "orders_phone_idx" ON "orders"("phone");

-- CreateIndex
CREATE INDEX "orders_source_created_at_idx" ON "orders"("source", "created_at");

-- CreateIndex
CREATE INDEX "orders_status_created_at_idx" ON "orders"("status", "created_at");

-- CreateIndex
CREATE INDEX "orders_payment_status_payment_expires_at_idx" ON "orders"("payment_status", "payment_expires_at");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "order_items_product_id_idx" ON "order_items"("product_id");

-- CreateIndex
CREATE INDEX "order_items_product_variant_id_idx" ON "order_items"("product_variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "courts_slug_key" ON "courts"("slug");

-- CreateIndex
CREATE INDEX "courts_sport_id_is_active_status_idx" ON "courts"("sport_id", "is_active", "status");

-- CreateIndex
CREATE INDEX "court_locks_court_id_locked_at_idx" ON "court_locks"("court_id", "locked_at");

-- CreateIndex
CREATE INDEX "court_locks_court_id_released_at_idx" ON "court_locks"("court_id", "released_at");

-- CreateIndex
CREATE UNIQUE INDEX "court_booking_groups_group_code_key" ON "court_booking_groups"("group_code");

-- CreateIndex
CREATE UNIQUE INDEX "court_booking_groups_checkout_id_key" ON "court_booking_groups"("checkout_id");

-- CreateIndex
CREATE INDEX "court_booking_groups_owner_user_id_created_at_idx" ON "court_booking_groups"("owner_user_id", "created_at");

-- CreateIndex
CREATE INDEX "court_booking_groups_status_booking_date_start_time_idx" ON "court_booking_groups"("status", "booking_date", "start_time");

-- CreateIndex
CREATE INDEX "court_booking_group_members_user_id_status_idx" ON "court_booking_group_members"("user_id", "status");

-- CreateIndex
CREATE INDEX "court_booking_group_members_assigned_court_booking_id_idx" ON "court_booking_group_members"("assigned_court_booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "court_booking_group_members_group_id_user_id_key" ON "court_booking_group_members"("group_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "court_bookings_booking_code_key" ON "court_bookings"("booking_code");

-- CreateIndex
CREATE INDEX "court_bookings_court_id_booking_date_start_time_end_time_idx" ON "court_bookings"("court_id", "booking_date", "start_time", "end_time");

-- CreateIndex
CREATE INDEX "court_bookings_user_id_created_at_idx" ON "court_bookings"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "court_bookings_status_booking_date_idx" ON "court_bookings"("status", "booking_date");

-- CreateIndex
CREATE INDEX "court_bookings_group_id_idx" ON "court_bookings"("group_id");

-- CreateIndex
CREATE INDEX "court_bookings_payment_status_payment_paid_at_idx" ON "court_bookings"("payment_status", "payment_paid_at");

-- CreateIndex
CREATE UNIQUE INDEX "court_booking_checkouts_checkout_code_key" ON "court_booking_checkouts"("checkout_code");

-- CreateIndex
CREATE UNIQUE INDEX "court_booking_checkouts_idempotency_key_key" ON "court_booking_checkouts"("idempotency_key");

-- CreateIndex
CREATE INDEX "court_booking_checkouts_status_expires_at_idx" ON "court_booking_checkouts"("status", "expires_at");

-- CreateIndex
CREATE INDEX "court_booking_checkouts_user_id_created_at_idx" ON "court_booking_checkouts"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "court_booking_checkouts_provider_transaction_id_idx" ON "court_booking_checkouts"("provider_transaction_id");

-- CreateIndex
CREATE INDEX "court_booking_holds_court_id_booking_date_start_time_end_ti_idx" ON "court_booking_holds"("court_id", "booking_date", "start_time", "end_time");

-- CreateIndex
CREATE INDEX "court_booking_holds_checkout_id_idx" ON "court_booking_holds"("checkout_id");

-- CreateIndex
CREATE INDEX "court_booking_holds_expires_at_idx" ON "court_booking_holds"("expires_at");

-- CreateIndex
CREATE INDEX "chatbot_sessions_user_id_updated_at_idx" ON "chatbot_sessions"("user_id", "updated_at");

-- CreateIndex
CREATE INDEX "chatbot_messages_session_id_created_at_idx" ON "chatbot_messages"("session_id", "created_at");

-- CreateIndex
CREATE INDEX "chatbot_message_recommendations_product_id_created_at_idx" ON "chatbot_message_recommendations"("product_id", "created_at");

-- CreateIndex
CREATE INDEX "chatbot_message_recommendations_product_variant_id_idx" ON "chatbot_message_recommendations"("product_variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "chatbot_message_recommendations_message_id_recommendation_o_key" ON "chatbot_message_recommendations"("message_id", "recommendation_order");

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_product_variant_id_fkey" FOREIGN KEY ("product_variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "court_staff_assignments" ADD CONSTRAINT "court_staff_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "court_staff_assignments" ADD CONSTRAINT "court_staff_assignments_court_id_fkey" FOREIGN KEY ("court_id") REFERENCES "courts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_sport_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "sports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_sport_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "sports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_product_variant_id_fkey" FOREIGN KEY ("product_variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_confirmed_by_id_fkey" FOREIGN KEY ("payment_confirmed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_variant_id_fkey" FOREIGN KEY ("product_variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courts" ADD CONSTRAINT "courts_sport_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "sports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "court_locks" ADD CONSTRAINT "court_locks_court_id_fkey" FOREIGN KEY ("court_id") REFERENCES "courts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "court_locks" ADD CONSTRAINT "court_locks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "court_locks" ADD CONSTRAINT "court_locks_released_by_fkey" FOREIGN KEY ("released_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "court_booking_groups" ADD CONSTRAINT "court_booking_groups_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "court_booking_groups" ADD CONSTRAINT "court_booking_groups_checkout_id_fkey" FOREIGN KEY ("checkout_id") REFERENCES "court_booking_checkouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "court_booking_group_members" ADD CONSTRAINT "court_booking_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "court_booking_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "court_booking_group_members" ADD CONSTRAINT "court_booking_group_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "court_booking_group_members" ADD CONSTRAINT "court_booking_group_members_assigned_court_booking_id_fkey" FOREIGN KEY ("assigned_court_booking_id") REFERENCES "court_bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "court_bookings" ADD CONSTRAINT "court_bookings_court_id_fkey" FOREIGN KEY ("court_id") REFERENCES "courts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "court_bookings" ADD CONSTRAINT "court_bookings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "court_bookings" ADD CONSTRAINT "court_bookings_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "court_booking_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "court_bookings" ADD CONSTRAINT "court_bookings_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "court_bookings" ADD CONSTRAINT "court_bookings_payment_confirmed_by_id_fkey" FOREIGN KEY ("payment_confirmed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "court_booking_checkouts" ADD CONSTRAINT "court_booking_checkouts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "court_booking_holds" ADD CONSTRAINT "court_booking_holds_checkout_id_fkey" FOREIGN KEY ("checkout_id") REFERENCES "court_booking_checkouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "court_booking_holds" ADD CONSTRAINT "court_booking_holds_court_id_fkey" FOREIGN KEY ("court_id") REFERENCES "courts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot_sessions" ADD CONSTRAINT "chatbot_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot_messages" ADD CONSTRAINT "chatbot_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "chatbot_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot_message_recommendations" ADD CONSTRAINT "chatbot_message_recommendations_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "chatbot_messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot_message_recommendations" ADD CONSTRAINT "chatbot_message_recommendations_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot_message_recommendations" ADD CONSTRAINT "chatbot_message_recommendations_product_variant_id_fkey" FOREIGN KEY ("product_variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
