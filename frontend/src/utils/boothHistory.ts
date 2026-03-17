// src/utils/boothHistory.ts
// Purpose: Centralized helper for recording booth views to Firestore.
// Dual-writes to both the student's history and the booth's visitor subcollection.

import { db } from "../firebase";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";

// We store a small snapshot so the History tab can render fast without extra reads.
// (If you later prefer a normalized approach, you can store only boothId + lastViewedAt.)
type BoothHistoryWrite = {
  boothId: string;
  companyName: string;
  industry?: string;
  location?: string;
  logoUrl?: string;
};

export async function trackBoothView(uid: string, booth: BoothHistoryWrite) {
  // Safety checks to avoid invalid writes
  if (!uid || !booth?.boothId) return;

  // Deduping strategy:
  // Use boothId as the doc ID, so each booth appears only once in history.
  // Viewing the same booth again simply updates lastViewedAt.
  const historyRef = doc(db, "users", uid, "boothHistory", booth.boothId);
  const visitorRef = doc(db, "booths", booth.boothId, "visitors", uid);

  const historyPayload = {
    boothId: booth.boothId,
    companyName: booth.companyName,
    industry: booth.industry ?? null,
    location: booth.location ?? null,
    logoUrl: booth.logoUrl ?? null,

    // serverTimestamp ensures the timestamp is consistent and trusted
    lastViewedAt: serverTimestamp(),
  };

  // Dual-write: student's booth history + booth-level visitor record
  // Promise.all runs both writes in parallel (not sequential) for efficiency.
  // Both use {merge:true} to avoid overwriting unrelated fields.
  await Promise.all([
    setDoc(historyRef, historyPayload, { merge: true }),
    setDoc(visitorRef, { uid, lastViewedAt: serverTimestamp() }, { merge: true }),
  ]);
}
