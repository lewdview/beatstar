DO $$
BEGIN
    REVOKE EXECUTE ON FUNCTION public.claim_token_pack_atomic(UUID, TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.claim_token_pack_atomic(UUID, TEXT, TEXT, INTEGER, INTEGER) TO authenticated, service_role;
END $$;
