-- M-Pesa receipts and reconnection codes must never identify multiple payments.
create unique index if not exists payments_mpesa_receipt_unique
  on public.payments (mpesa_receipt_number)
  where mpesa_receipt_number is not null;

create unique index if not exists payments_reconnection_code_unique
  on public.payments (reconnection_code)
  where reconnection_code is not null;
