# Security Specification — F/O Logbook Report

## 1. Data Invariants
1. **Zero-PII Open Shared Workspace**: The shared operational workspace (`/sharedWorkspaces/fo-logbook-main`) and its `/entries/{entryId}` subcollection allow unauthenticated team collaboration without storing any PII (no emails, user IDs, or private tokens). Access is strictly scoped to `workspaceId == 'fo-logbook-main'`, `allow list` on `/sharedWorkspaces` is `false`, `allow delete` on `/sharedWorkspaces` is `false`, and all entries verify parent existence (`exists(...)`) and `resource.data.workspaceId == 'fo-logbook-main'` on list queries.
2. **Legacy & Private Collections Remain Strictly Protected**: `/users/{userId}`, `/logbooks/{logbookId}`, `/logbooks/{logbookId}/entries/{entryId}`, `/invites/{inviteCode}`, and `/invites/{inviteCode}/claims/{userId}` continue to require `request.auth != null && request.auth.token.email_verified == true` and strict ownership/membership verification.
3. **Master Gate Sync**: Every `SharedLogEntry` inside `/sharedWorkspaces/{workspaceId}/entries/{entryId}` cannot exist without an existing parent `/sharedWorkspaces/fo-logbook-main` document.
4. **Temporal & Immutability Integrity**: `createdAt` on creation and `updatedAt` on both creation and update must strictly equal `request.time`. `createdAt` and `workspaceId` are immutable after creation.
5. **Strict Schema & Bounds**: All documents enforce `hasAll` and `hasOnly` key checks, string `.size()` limits, ID regex (`^[a-zA-Z0-9_\-]+$`), date (`YYYY-MM-DD`) and month (`YYYY-MM`) patterns, and bounded lists (units <= 20, reporters <= 50, details <= 4000).

## 2. "Dirty Dozen" Adversarial Payloads (Expected: `PERMISSION_DENIED`)
1. **Unauthenticated Private Read**: Reading `/users/{uid}` or `/logbooks/{logbookId}` with `request.auth == null`.
2. **Shared Workspace Enumeration**: Calling `list` on `/sharedWorkspaces`.
3. **Arbitrary Shared Workspace Creation**: Creating `/sharedWorkspaces/arbitrary-id` where `workspaceId != 'fo-logbook-main'`.
4. **Shared Workspace Deletion**: Calling `delete` on `/sharedWorkspaces/fo-logbook-main`.
5. **Shadow Field Injection**: Creating a `SharedLogEntry` with an extra field `{ isAdmin: true }` not in `hasOnly(...)`.
6. **Client Timestamp Forgery**: Creating or updating a `SharedLogEntry` with a backdated `createdAt` or `updatedAt` not equal to `request.time`.
7. **Oversized ID Poisoning**: Creating a document with an `entryId` exceeding 128 characters or containing `"../../admin"`.
8. **Orphaned SharedLogEntry**: Creating a `SharedLogEntry` under `/sharedWorkspaces/other-ws/entries/e1`.
9. **Immutable Field Tampering**: Updating a `SharedLogEntry` to change `workspaceId`, `createdAt`, or `recordedAt`.
10. **Invalid Enum / Value Poisoning**: Updating `shift` to `"Z"` or `details` to a 5,000-character string exceeding the 4,000-char limit.
11. **Mismatched Date/Month**: Creating a `SharedLogEntry` where `reportDate` is `"2026-11-18"` and `reportMonth` is `"2026-12"`.
12. **Unscoped Entry List Query**: Calling `list` on `/sharedWorkspaces/fo-logbook-main/entries` without matching `workspaceId == 'fo-logbook-main'`.
