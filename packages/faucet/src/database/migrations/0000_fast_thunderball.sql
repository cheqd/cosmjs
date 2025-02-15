CREATE TABLE "requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(50) NOT NULL,
	"company" varchar(150),
	"email_address" varchar(254) NOT NULL,
	"from_address" varchar(44) NOT NULL,
	"to_address" varchar(44) NOT NULL,
	"hash" varchar(64) NOT NULL,
	"marketing_optin" boolean DEFAULT false NOT NULL,
	"amount" bigint NOT NULL,
	"denom" varchar(20) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"country" varchar(2) DEFAULT 'XX' NOT NULL
);
