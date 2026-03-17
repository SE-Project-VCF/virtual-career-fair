interface Representative {
  firstName?: string
  lastName?: string
  email: string
}

export function getRepresentativeName(rep: Representative): string {
  if (rep.firstName && rep.lastName) {
    return `${rep.firstName} ${rep.lastName}`
  }
  if (rep.firstName) {
    return rep.firstName
  }
  return rep.email
}
