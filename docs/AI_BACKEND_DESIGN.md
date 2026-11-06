# Ask the guide: AI backend (design only, nothing built or deployed)

Status: design for the owner's approval. Today "Ask the guide" answers from the field registry and the sheet list in the browser (no network, no cost). This document is what an AI-backed version would take.

## What it would add
Free-text questions the registry cannot match ("why is my DSCR below the loan minimum?", "what would a lender think of this rent roll?"), answered from the deal's own numbers, with a link to the page that fixes it. The registry answers stay first; the model is asked only when no topic scores.

## Shape
- **Browser:** sends `{question, context}` to one endpoint. `context` is built in the browser from existing read-only engines: the headline figures, the credit-gate rows, the top Model Checks, the market comparison and the field registry's labels. Nothing is recalculated for the model; it explains what the app already computed.
- **Endpoint:** one small serverless function (a Supabase Edge Function, same project as sign-in). It checks the caller's Supabase session, rate-limits per user, calls the model, returns text plus up to three suggested pages. The function holds the API key.
- **Key handling:** the model API key lives only in the Edge Function's secrets. It is never in the page, the repo or the browser. Rotating it is a secret change.
- **Model:** the current small Claude model for speed and cost; the larger one only on an explicit "think harder" action.

## Privacy
- Only a deal summary (figures and labels the user can already see) is sent, never uploaded documents, rent rolls or tenant names unless the user ticks "include the rent roll".
- A visible line under the box says what is sent. No question or answer is stored by default; an optional log (user id, time, token counts, no text) supports cost control.
- Provider terms: API traffic is not used to train models by default; confirm in the contract before launch.

## Cost
A question is roughly 1,500 input and 300 output tokens. At the small model's list price that is a fraction of a cent. A per-user daily cap (for example 50 questions) and a monthly spend alarm bound the worst case. Estimate to be re-checked against current pricing before launch.

## Safety rules
The answer may not change any input; "apply" buttons still go through the existing confirm-and-apply flows. The answer is labeled as generated, cites the page and figure it relied on, and says when it does not know.

## Steps if approved
1. Create the Edge Function and its secret (owner provides the API key through the Supabase dashboard).
2. Add the context builder and the "Ask AI" fallback to `src/174` (about 150 lines).
3. Add the per-user rate limit table (additive).
4. Test with fixtures; deploy to a preview first; owner reviews questions and answers before it is switched on for everyone.

Nothing above is done. It needs the owner's go-ahead and an API key.
