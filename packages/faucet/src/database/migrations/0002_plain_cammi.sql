CREATE TYPE "public"."email_verification_status" AS ENUM('pending', 'verified', 'invalidated', 'expired');--> statement-breakpoint
CREATE TABLE "email_verifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"email_address" varchar(254) NOT NULL,
	"otp_code_hash" varchar(64) NOT NULL,
	"status" "email_verification_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "requests" RENAME COLUMN "name" TO "first_name";--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "last_name" varchar(50) DEFAULT '' NOT NULL;