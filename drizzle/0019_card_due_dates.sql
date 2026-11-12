-- Credit card statements from the bank (Plaid Liabilities): when the payment is due,
-- the statement balance and the minimum, so Pockit can remind people before it's late.
ALTER TABLE pockit.accounts ADD COLUMN IF NOT EXISTS payment_due_date date;
ALTER TABLE pockit.accounts ADD COLUMN IF NOT EXISTS statement_balance_minor bigint;
ALTER TABLE pockit.accounts ADD COLUMN IF NOT EXISTS minimum_payment_minor bigint;
ALTER TABLE pockit.accounts ADD COLUMN IF NOT EXISTS last_payment_date date;
ALTER TABLE pockit.accounts ADD COLUMN IF NOT EXISTS last_statement_date date;
