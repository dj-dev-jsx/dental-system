-- AlterTable
ALTER TABLE "scan_tooth_pins" ADD COLUMN     "neck_x" DOUBLE PRECISION,
ADD COLUMN     "neck_y" DOUBLE PRECISION,
ADD COLUMN     "neck_z" DOUBLE PRECISION;

-- A tooth's neck point is all three coordinates or none.
ALTER TABLE "scan_tooth_pins" ADD CONSTRAINT "scan_tooth_pins_neck_complete"
  CHECK ((neck_x IS NULL AND neck_y IS NULL AND neck_z IS NULL) OR (neck_x IS NOT NULL AND neck_y IS NOT NULL AND neck_z IS NOT NULL));
