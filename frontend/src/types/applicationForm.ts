export type FormFieldType =
  | "shortText"
  | "longText"
  | "singleSelect"
  | "multiSelect"
  | "checkbox";

export interface FormField {
  id: string;
  type: FormFieldType;
  label: string;
  required: boolean;
  options?: string[];
}

export interface ApplicationForm {
  title: string;
  description?: string;
  fields: FormField[];
  status: "draft" | "published";
  fairScheduleId?: string;
  publishedAt?: number | null;
  updatedAt?: number | null;
}

