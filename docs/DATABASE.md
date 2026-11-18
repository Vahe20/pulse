# PostgreSQL data model

The authoritative schema lives in apps/api/prisma/schema.prisma. Migrations include the Prisma-generated schema, additional integrity triggers, and a partial unique index for active analysis jobs.

| Entities | Relationship and constraint |
| --- | --- |
| Role, User, Lecturer | Accounts have one role. Each lecturer profile identifies one account. Emails and profile user IDs are unique. |
| Course, StudentGroup, GroupMembership | Courses contain groups. Membership is unique per student and group. |
| Survey, SurveyTarget, SurveyQuestion, SurveyOption | A survey targets one or more groups and one lecturer. Positions determine question and choice order. Published questions are locked. |
| SurveyInvitation, Notification | Publishing snapshots distinct target members. Each student receives one invitation per survey. Notification sequence zero is the invitation. Higher sequences are reminders. |
| SurveyResponse, Answer | Responses use random UUIDs. Answers belong to one response and question. The database checks that both belong to the same survey. |
| AIAnalysis, Theme, ThemeComment | Analysis versions retain theme provenance. Supporting links reference actual answers. A published theme can be used by multiple issues. |
| Issue, IssueLink, IssueHistory | Issues have one source survey, an optional source theme, an owner, a deadline, and an actor-attributed event log. Related pairs are ordered and unique. |
| RefreshSession, AuditLog, Setting | Sessions contain token digests. Audit events record publication and review. Settings persist the score-drop threshold. |

Anonymous responses have no student reference or submission timestamp. Answer rows omit timestamps as well. These exceptions to the general timestamp convention reduce correlation risk. Completing an anonymous invitation clears its precise update time. There is no invitation-to-response foreign key. The API withholds anonymous ratings and analysis until closing, and excludes cells below the configured minimum. Multi-group surveys are omitted from single-group comparisons because the response cannot be assigned safely to a group.

For the local Compose installation, run `pnpm db:backup data/backups/pulse.dump` with a new filename each time. The command streams a PostgreSQL custom-format archive, checks that pg_restore can read its contents, and publishes the file only after validation. Store a protected copy outside the installation. Practice full restores into a separate empty database using `pg_restore --exit-on-error --no-owner --dbname=<target> pulse.dump`. Production administrators can use pg_dump directly against their managed PostgreSQL endpoint. Keep backups and logs under the academy's retention policy.
