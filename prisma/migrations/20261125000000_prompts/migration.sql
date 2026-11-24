-- CreateTable
CREATE TABLE "prompts" (
    "key" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prompts_pkey" PRIMARY KEY ("key")
);
