-- CreateTable
CREATE TABLE "featured_configs" (
    "id" BIGSERIAL NOT NULL,
    "pinned_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "filters" JSONB NOT NULL DEFAULT '{}',
    "sort" TEXT NOT NULL DEFAULT 'price-desc',
    "display_limit" INTEGER NOT NULL DEFAULT 6,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_by" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "featured_configs_pkey" PRIMARY KEY ("id")
);
