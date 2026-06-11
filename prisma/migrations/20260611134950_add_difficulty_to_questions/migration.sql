-- AlterTable
ALTER TABLE `questions` ADD COLUMN `difficulty` ENUM('EASY', 'MEDIUM', 'HARD') NOT NULL DEFAULT 'MEDIUM';
