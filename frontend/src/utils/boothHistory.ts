// src/utils/boothHistory.ts
// Purpose: Centralized helper for recording booth views to Firestore.
// This keeps "history tracking" logic out of UI components (cleaner & reusable).

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
  const ref = doc(db, "users", uid, "boothHistory", booth.boothId);

  // setDoc(..., {merge:true}) updates existing fields without overwriting the whole doc.
  await setDoc(
    ref,
    {
      boothId: booth.boothId,
      companyName: booth.companyName,
      industry: booth.industry ?? null,
      location: booth.location ?? null,
      logoUrl: booth.logoUrl ?? null,

      // serverTimestamp ensures the timestamp is consistent and trusted
      lastViewedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
