export type BoothCardItem = {
  id: string
  companyName: string
  industry: string
  companySize: string
  location: string
  description: string
  logoUrl?: string
  companyId?: string
}

export const INDUSTRY_LABELS: Record<string, string> = {
  software: "Software Development",
  data: "Data Science & Analytics",
  healthcare: "Healthcare Technology",
  finance: "Financial Services",
  energy: "Renewable Energy",
  education: "Education Technology",
  retail: "Retail & E-commerce",
  manufacturing: "Manufacturing",
  other: "Other",
}

// Firestore 'in' queries support a maximum of 30 values per query.
export const FIRESTORE_IN_QUERY_LIMIT = 30
