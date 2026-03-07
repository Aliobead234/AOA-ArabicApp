# Authentication Test Instructions

## Setup Required
1. Update `src/utils/supabase/info.ts` with your actual Supabase credentials:
   - `projectId`: Your Supabase project ID (e.g., 'abcdefgh123456')
   - `publicAnonKey`: Your Supabase anonymous public key

## Testing Steps
1. Start the dev server: `npm run dev`
2. Navigate to the explore page: `http://localhost:5176/explore`
3. Click "Sign in with Google"
4. Complete Google OAuth flow
5. **Expected**: You should be redirected back to the explore page, then automatically redirected to the flashcard (cards) page
6. Refresh the page - you should remain logged in on the flashcard page
7. Check browser localStorage for persisted session data

## Expected Behavior
- ✅ No redirect loop after Google login
- ✅ Session persists across page refreshes
- ✅ After 30 days, user is prompted to re-login
- ✅ Session stored in localStorage with proper expiration
- ✅ **NEW**: Authenticated users visiting `/explore` are automatically redirected to `/` (flashcard page)
- ✅ Users return to the page they were on after login (if not explore page)

## Debugging
Check browser console for auth-related logs:
- `[Auth] Found hash token, waiting for onAuthStateChange...`
- `[Auth] Initial getSession result:`
- `[Auth] onAuthStateChange:`
- `[Explore] User authenticated, redirecting to flashcards`
