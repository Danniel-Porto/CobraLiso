ALTER TABLE "transactions" ADD COLUMN "attachment_name" varchar(255);--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "attachment_mime_type" varchar(100);--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "attachment_base64" text;