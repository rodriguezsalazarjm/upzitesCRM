-- El rubro es opcional para conservar todos los perfiles existentes. La
-- modalidad de venta permanece en business_type y no se infiere desde aquí.
ALTER TABLE "workspace_profiles"
ADD COLUMN "industry" TEXT,
ADD COLUMN "industry_other" TEXT;
