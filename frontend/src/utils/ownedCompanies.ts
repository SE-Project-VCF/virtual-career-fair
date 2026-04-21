import { collection, getDocs, query, where } from "firebase/firestore"
import { db } from "../firebase"

export type OwnedCompanySummary = { id: string; companyName: string }

/** Companies in Firestore where `ownerId` is the given user (company owners only). */
export async function fetchOwnedCompaniesForUser(ownerUid: string): Promise<OwnedCompanySummary[]> {
  const q = query(collection(db, "companies"), where("ownerId", "==", ownerUid))
  const snap = await getDocs(q)
  const list: OwnedCompanySummary[] = []
  snap.forEach((docSnap) => {
    const d = docSnap.data() as { companyName?: string }
    list.push({
      id: docSnap.id,
      companyName: typeof d.companyName === "string" && d.companyName.trim() ? d.companyName : docSnap.id,
    })
  })
  return list.sort((a, b) => a.companyName.localeCompare(b.companyName))
}
