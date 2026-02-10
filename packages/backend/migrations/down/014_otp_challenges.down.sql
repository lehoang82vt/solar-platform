-- Rollback PUB-03: drop otp_challenges
DROP POLICY IF EXISTS otp_challenges_org_policy ON otp_challenges;
DROP POLICY IF EXISTS otp_challenges_insert_policy ON otp_challenges;

DROP TABLE IF EXISTS otp_challenges CASCADE;

SELECT '014 Rollback: otp_challenges dropped' AS status;
