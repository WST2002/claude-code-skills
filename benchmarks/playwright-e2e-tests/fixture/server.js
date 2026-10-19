// POST /login {email,password} -> sets cookie, redirects /notes (qa@example.com / secret-pass); wrong password -> 401 and #error 'Invalid email or password'
// GET /notes requires cookie; POST /api/notes {title} -> 201 and the note appears in the list; empty title -> 422 'Title is required'
