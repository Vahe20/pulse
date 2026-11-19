# REST API v1

For identified surveys, `GET /api/v1/surveys/:id/invitations` returns a paginated list of invited student names, completion flags and the most recent notification sequence and delivery status. Edu Lead and System Admin may use the list. Anonymous surveys expose aggregate participation on the survey details page.

The interactive OpenAPI explorer is served at /api/v1/docs on the API origin. The JSON document is at /api/v1/docs-json. API clients send JSON. Authenticated requests use Authorization: Bearer followed by the access token. Browser refresh and logout use the same-origin refresh cookie and X-Pulse-Client: web. Authentication returns the user role, name and ID.

| Route under /api/v1 | Operations |
| --- | --- |
| /health | GET checks PostgreSQL and Redis |
| /auth/login, /auth/refresh, /auth/logout | POST, successful responses use HTTP 200 |
| /users, /courses, /groups | GET paginated lists, POST creation subject to role |
| /users/:id, /courses/:id, /groups/:id | PUT updates an account or renames a course or group. Credential and role changes revoke existing sessions |
| /groups/:id/members | POST adds a student to a group |
| /lecturers | GET lecturer profiles. Creating a user with role LECTURER also creates the profile |
| /settings | GET or PUT the absolute score-drop threshold |
| /surveys | GET assigned or authorized surveys, POST creates a draft |
| /surveys/:id | GET details, PUT replaces draft configuration including ordered questions |
| /surveys/:id/publish, /surveys/:id/archive | POST state transitions |
| /surveys/:id/responses | POST answers keyed by question UUID. Choice values are option UUIDs |
| /surveys/:id/analysis | POST queues analysis, GET latest visible version |
| /analyses/:id | PUT reviewed summary and themes, optionally publish |
| /surveys/:id/analytics | GET scoped report |
| /issues, /issues/:id | GET list or detail, POST creates, PUT updates with updatedAt for optimistic concurrency |
| /issues/:id/followup | GET the first later comparable measurement for the source cohort and lecturer |
| /reports, /reports/csv | GET report data or CSV attachment |
| /notifications | GET current user's invitation and reminder history |

List endpoints accept page (starts at 1), limit (1–100), and sort (asc/desc). Directory, survey and issue lists support search. Issues additionally accept status, overdue and surveyId. Reports accept from/to as ISO dates, groupId, courseId, lecturerId, surveyId, and issue status. Sorting uses names for the directory, start dates for surveys, deadlines for issues and creation time for notifications.

Surveys require at least one group, a lecturer, a start/end window, at least three responses for publication of statistics, reminder interval/cap and ordered questions. Optional canonical criteria are validated against their scale and prompt. Manual questions can contribute to category scores. Historical comparisons use canonical IDs. Group and lecturer comparisons align the calendar month and criterion and display response coverage.

Validation errors use HTTP 400, authentication 401, role denial 403, unavailable records 404, conflicts 409 and throttling 429. Error payloads include statusCode and message. Accepted survey submissions return only a confirmation.
