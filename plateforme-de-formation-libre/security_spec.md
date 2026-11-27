# Security Specification & Payload TDD (`tedribi`)

## 1. Data Invariants & Access Model
1. **Single Official Admin Invariant**: ONLY `elalyatalebjidou@gmail.com` with `request.auth.token.email_verified == true` holds `isAdmin()` privileges. No client payload can self-assign `role: 'admin'` or create `/admins/{uid}` for any other email.
2. **PII Isolation Invariant**: Email, phone number, wilaya, city, and card metadata are stored strictly in `/users/{userId}/private/{docId}` or owner-scoped `/orders/{orderId}` and `/conversations/{conversationId}`, readable ONLY by `isOwner(uid)` or `isAdmin()`. Blanket `users` list/get reads by non-admins are blocked.
3. **Email Verification Gate**: Standard interactive writes (`lessonProgress`, `notificationReads`, `subscriptions`, `orders`, `conversations`, `messages`, profile updates) require `request.auth.token.email_verified == true`.
4. **Master Gate & Zero-get() List Queries**: Messages under `/conversations/{conversationId}/messages/{messageId}` validate parent conversation existence and owner UID via `get()` on `create`/`get`/`update`, while `allow list` checks `resource.data.conversationOwnerUid == request.auth.uid || isAdmin()` without costly `get()` calls.
5. **Immutable Audit & Ownership Fields**: `uid`, `createdAt`, `conversationOwnerUid`, `senderUid`, `senderRole`, `createdByUid` cannot be forged on create (`== request.auth.uid`, `== request.time`) and cannot be reassigned on update.
6. **Notification Targeting & Future-User Exclusion**: `notifications/{id}` supports `current_users`, `conditional`, `specific_users`, and `all_including_future`. Non-admins cannot read `specific_users` notices unless `request.auth.uid in resource.data.targetUserIds`, and `current_users` notices carry server timestamp `eligibleBefore == createdAt` so future registrations (`user.createdAt > eligibleBefore`) never receive historical `current_users` broadcasts.
7. **Terminal State & Payment Security**: Orders/subscriptions cannot store raw card numbers or CVV, only `cardBrand in ['visa', 'mastercard']` and 4-digit `cardLast4`. Cancelled/failed orders cannot be flipped to `succeeded` by non-admins.

## 2. The "Dirty Dozen" Attack Payloads (All MUST Return `PERMISSION_DENIED`)
1. **Unauthenticated Profile Read**: Anonymous user attempts `get(/users/alice)` or `list(/users)`.
2. **Admin Privilege Escalation via User Profile Create**: Non-admin user (`bob@example.com`, `email_verified: true`) tries `setDoc(/users/bob, { ..., role: 'admin' })`.
3. **Admin Privilege Escalation via User Profile Update**: Non-admin user tries `updateDoc(/users/bob, { role: 'admin' })` or injects ghost field `isAdmin: true`.
4. **Admin Registry Spoofing**: Non-admin (or unverified email) tries `setDoc(/admins/bob, { uid: 'bob', email: 'elalyatalebjidou@gmail.com', ... })`.
5. **Email Spoofing (Unverified Admin Email)**: User signs up with `elalyatalebjidou@gmail.com` with `email_verified: false` and tries to read `/users` or write `/lessons/1`.
6. **Cross-User PII Snooping**: Verified user `bob` attempts `get(/users/alice/private/info)`.
7. **Cross-User Conversation Hijack (List/Get)**: Verified user `bob` tries `get(/conversations/alice)` or `list(/conversations)` without filtering `uid == 'bob'`.
8. **Cross-User Message Injection (Master Gate Bypass)**: Verified user `bob` tries `create(/conversations/alice/messages/m1)` claiming `senderRole: 'admin'` or `conversationOwnerUid: 'bob'`.
9. **Targeted Notification Leakage**: Verified user `bob` tries `get(/notifications/n1)` where `targetScope == 'specific_users'` and `targetUserIds == ['alice']`.
10. **Shadow / Ghost Field Injection**: Verified user `alice` tries `updateDoc(/users/alice, { name: 'Alice', ghostBypass: true, role: 'student' })`.
11. **Timestamp Forgery / Backdating**: Verified user `alice` tries `create(/conversations/alice/messages/m2, { ..., createdAt: backdatedTimestamp })`.
12. **Resource Exhaustion / ID Poisoning**: Verified user `alice` tries `setDoc(/users/alice/lessonProgress/${'x'.repeat(200)}, ...)` or sends a `10KB` text message or an order with raw `cardNumber` field.
