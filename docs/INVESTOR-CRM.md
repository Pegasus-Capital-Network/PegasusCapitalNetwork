# Pegasus Investor CRM — development-only implementation
This adds an owner-admin interface at `/admin-investor-crm.html` backed by the EXISTING `public.pn_capital_pipeline` table in the Pegasus Lenders Group Supabase project. No migrations, secrets, production deploy, investor-data import, email sending, or new billing.
## Safety contract
- UI requires a live session and a fresh `profiles.is_admin = true` server read before data access. Database table has RLS enabled with admin-only policy. Never relax that policy.
- Database stays the truth; don't store real investor data in a public repo or static JSON. No service-role key in browser.
- Records require candidate, classification and linked source. Separate deal volume from minimum cheque; unknown remains unknown.
- Manual statuses only; no automatic sent/replied transitions. Email drafts stored as data; interface cannot send.
- RWA educational outreach only until securities counsel has reviewed the selected offering exemption, cross-border marketing, sanctions/KYC and CFIUS as relevant. Do not promise liquidity or yield.
- Existing `pn_capital_pipeline` fields are reused; future follow-ups and dedupe should use verified source data and a dedicated transaction/audit design, not fake email activity.
## Review
Review source and test with a signed-in admin on a Netlify deploy preview. Verify unauthenticated and normal members redirect without seeing data; admin can add/edit a nonpersonal TEST record and remove it by an authorized DB cleanup procedure. Do not use real outside contacts for QA. No production publish without separate explicit owner approval.
