-- Alter guide_documents to add review columns
ALTER TABLE public.guide_documents 
ADD COLUMN IF NOT EXISTS review_interval_months integer DEFAULT 12;

ALTER TABLE public.guide_documents 
ADD COLUMN IF NOT EXISTS next_review_date timestamptz DEFAULT (now() + interval '12 months');

-- Update existing guide_documents to calculate next_review_date from created_at
UPDATE public.guide_documents 
SET 
  review_interval_months = COALESCE(review_interval_months, 12),
  next_review_date = COALESCE(next_review_date, created_at + interval '12 months')
WHERE next_review_date IS NULL;

-- Alter courses to add review columns
ALTER TABLE public.courses 
ADD COLUMN IF NOT EXISTS review_interval_months integer DEFAULT 12;

ALTER TABLE public.courses 
ADD COLUMN IF NOT EXISTS next_review_date timestamptz DEFAULT (now() + interval '12 months');

-- Update existing courses to calculate next_review_date from created_at
UPDATE public.courses 
SET 
  review_interval_months = COALESCE(review_interval_months, 12),
  next_review_date = COALESCE(next_review_date, created_at + interval '12 months')
WHERE next_review_date IS NULL;
