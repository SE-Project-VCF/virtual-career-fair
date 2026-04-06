/**
 * Firestore path helpers for employer → candidates shortlist (single place for collection chain).
 */
function employerCandidatesCollection(db, employerId) {
  return db.collection("employers").doc(employerId).collection("candidates");
}

module.exports = { employerCandidatesCollection };
