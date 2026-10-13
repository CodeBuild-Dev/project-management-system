CREATE TYPE "public"."work_mode" AS ENUM('remote', 'on_site', 'hybrid');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "job_title" varchar(120);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "work_mode" "work_mode";