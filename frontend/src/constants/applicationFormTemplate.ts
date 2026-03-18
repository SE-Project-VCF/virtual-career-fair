import type { ApplicationForm } from "../types/applicationForm";

/**
 * Standard in-house job application template.
 * Field IDs are stable for pre-fill mapping from student profile in JobApplicationFormDialog.
 */
export const STANDARD_APPLICATION_TEMPLATE: ApplicationForm = {
  title: "Job Application",
  description: "Please complete all required fields to apply for this position.",
  status: "draft",
  fields: [
    {
      id: "fullName",
      type: "shortText",
      label: "Full Name",
      required: true,
    },
    {
      id: "email",
      type: "shortText",
      label: "Email",
      required: true,
    },
    {
      id: "phone",
      type: "shortText",
      label: "Phone Number",
      required: false,
    },
    {
      id: "graduationYear",
      type: "shortText",
      label: "Expected Graduation Year",
      required: true,
    },
    {
      id: "major",
      type: "shortText",
      label: "Major / Degree",
      required: false,
    },
    {
      id: "skills",
      type: "longText",
      label: "Skills",
      required: true,
    },
    {
      id: "previousWorkExperience",
      type: "longText",
      label: "Previous Work Experience",
      required: false,
    },
    {
      id: "coverLetter",
      type: "longText",
      label: "Why are you interested in this role?",
      required: false,
    },
  ],
};
