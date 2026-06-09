-- AlterTable
ALTER TABLE `questions` ADD COLUMN `imageUlr` VARCHAR(255) NULL,
    MODIFY `answer` TEXT NOT NULL,
    MODIFY `question` TEXT NOT NULL;
