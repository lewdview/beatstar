-- Drop policy if exists
DROP POLICY IF EXISTS "Users can update their own gameplay records" ON public.gameplay_records;

-- Create policy to allow users to update their own gameplay records (needed for high score upsert conflicts)
CREATE POLICY "Users can update their own gameplay records" 
ON public.gameplay_records 
FOR UPDATE 
TO public 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);
