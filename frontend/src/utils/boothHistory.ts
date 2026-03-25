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

  const historyPayload = {
    boothId: booth.boothId,
    companyName: booth.companyName,
    industry: booth.industry ?? null,
    location: booth.location ?? null,
    logoUrl: booth.logoUrl ?? null,

    // serverTimestamp ensures the timestamp is consistent and trusted
    lastViewedAt: serverTimestamp(),
  };

  try {
    // Write only to the user's booth history
    // Visitor record is written by the backend API (/api/booth/:boothId/track-view)
    // which has admin permissions and can write to any subcollection
    await setDoc(historyRef, historyPayload, { merge: true });
    console.log(`[BOOTH-HISTORY] Tracked booth view for ${booth.boothId}`);
  } catch (err) {
    console.error(`[BOOTH-HISTORY] Failed to write user history:`, err);
    throw err;
  }
}
