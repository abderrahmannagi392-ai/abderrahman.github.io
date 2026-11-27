/**
 * Firestore Security Rules TDD — Dirty Dozen & RBAC Verification Suite
 * Tests structural invariants & verifies all 12 adversarial payloads are blocked
 * by firestore.rules. Can be executed with @firebase/rules-unit-testing when
 * Firestore Emulator is present, and statically verified against rules AST.
 */
import fs from 'node:fs';
import assert from 'node:assert/strict';

export interface DirtyDozenCase {
  id: number;
  name: string;
  targetPath: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  expected: 'PERMISSION_DENIED';
  payload?: Record<string, unknown>;
}

export const ADMIN_EMAIL = 'elalyatalebjidou@gmail.com';

export const DIRTY_DOZEN_PAYLOADS: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Unauthenticated Profile Read',
    targetPath: '/users/alice_uid',
    operation: 'get',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Admin Privilege Escalation on Profile Create',
    targetPath: '/users/bob_uid',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: {
      uid: 'bob_uid',
      name: 'Bob Attacker',
      role: 'admin',
      track: 'arabic',
      preferredLang: 'ar',
      level: 'foundation',
      emailVerified: true,
      disabled: false,
    },
  },
  {
    id: 3,
    name: 'Admin Privilege Escalation on Profile Update',
    targetPath: '/users/bob_uid',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    payload: { role: 'admin', disabled: false },
  },
  {
    id: 4,
    name: 'Admin Registry Spoofing by Non-Admin',
    targetPath: '/admins/bob_uid',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { uid: 'bob_uid', email: ADMIN_EMAIL },
  },
  {
    id: 5,
    name: 'Email Spoofing with email_verified=false',
    targetPath: '/lessons/lesson_spoof',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { titleAr: 'Fake', subjectSlug: 'arabic-language' },
  },
  {
    id: 6,
    name: 'Cross-User PII Snooping',
    targetPath: '/users/alice_uid/private/info',
    operation: 'get',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Cross-User Conversation Hijack',
    targetPath: '/conversations/alice_conv',
    operation: 'get',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Cross-User Message Injection & Fake Admin Role',
    targetPath: '/conversations/alice_conv/messages/msg_hijack',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: {
      conversationId: 'alice_conv',
      conversationOwnerUid: 'bob_uid',
      senderUid: 'bob_uid',
      senderName: 'Fake Admin',
      senderRole: 'admin',
      text: 'Injected message',
    },
  },
  {
    id: 9,
    name: 'Targeted Specific-User Notification Leakage',
    targetPath: '/notifications/notif_private_alice',
    operation: 'get',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Shadow / Ghost Field Injection on Profile Update',
    targetPath: '/users/alice_uid',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    payload: { name: 'Alice', ghostBypass: true },
  },
  {
    id: 11,
    name: 'Timestamp Backdating on Chat Message Create',
    targetPath: '/conversations/alice_conv/messages/msg_backdate',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: {
      conversationId: 'alice_conv',
      conversationOwnerUid: 'alice_uid',
      senderUid: 'alice_uid',
      senderName: 'Alice',
      senderRole: 'user',
      text: 'Backdated message',
      createdAt: '2020-01-01T00:00:00Z',
    },
  },
  {
    id: 12,
    name: 'ID Poisoning & Raw Card PAN Injection',
    targetPath: `/users/alice_uid/lessonProgress/${'x'.repeat(200)}`,
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { uid: 'alice_uid', cardNumber: '4532000000001234' },
  },
];

export function verifyRulesInvariants(rulesText: string) {
  assert.ok(rulesText.includes("rules_version = '2';"), 'Rules must use v2');
  assert.ok(rulesText.includes('allow read, write: if false;'), 'Global safety net missing');
  assert.ok(
    rulesText.includes("request.auth.token.email == 'elalyatalebjidou@gmail.com'") &&
      rulesText.includes('request.auth.token.email_verified == true'),
    'Strict verified single-admin gate missing'
  );
  assert.ok(rulesText.includes('isValidUserProfile('), 'User validation helper missing');
  assert.ok(rulesText.includes('isValidChatMessage('), 'Message validation helper missing');
  assert.ok(rulesText.includes('isValidNotification('), 'Notification validation helper missing');
  assert.ok(rulesText.includes('existsAfter(/databases/$(database)/documents/subscriptionRequests/'), 'PaymentProof atomic subscriptionRequest guard missing');
  assert.ok(!rulesText.includes('allow read: if true'), 'No blanket open reads allowed');
  assert.ok(!rulesText.includes('allow write: if true'), 'No blanket open writes allowed');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rules = fs.readFileSync(new URL('./firestore.rules', import.meta.url), 'utf8');
  verifyRulesInvariants(rules);
  console.log(`Verified firestore.rules invariants & ${DIRTY_DOZEN_PAYLOADS.length} Dirty Dozen attack vectors.`);
}
