import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Switch,
  TextField,
  Typography,
  IconButton,
  Chip,
  Paper,
} from "@mui/material";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import type { DropResult, DroppableProvided, DraggableProvided, DraggableStateSnapshot } from "@hello-pangea/dnd";
import { auth } from "../firebase";
import { API_URL } from "../config";
import type { ApplicationForm, FormField, FormFieldType } from "../types/applicationForm";

interface ApplicationFormBuilderDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly jobId: string;
  readonly jobName: string;
  readonly initialForm?: ApplicationForm;
  readonly onSaved?: (form: ApplicationForm) => void;
}

interface FieldErrors {
  label?: string;
  options?: string;
}

interface FieldCardProps {
  readonly field: FormField;
  readonly index: number;
  readonly errors: FieldErrors;
  readonly onLabelChange: (value: string) => void;
  readonly onTypeChange: (type: FormFieldType) => void;
  readonly onOptionsChange: (value: string) => void;
  readonly onRequiredChange: (checked: boolean) => void;
  readonly onDelete: () => void;
}

function FieldCard({ field, index, errors, onLabelChange, onTypeChange, onOptionsChange, onRequiredChange, onDelete }: FieldCardProps) {
  const optionsValue = (field.options ?? []).join(", ");

  return (
    <Draggable key={field.id} draggableId={field.id} index={index}>
      {(providedDraggable: DraggableProvided, snapshot: DraggableStateSnapshot) => (
        <Paper
          ref={providedDraggable.innerRef}
          {...providedDraggable.draggableProps}
          sx={{
            p: 1.5,
            borderRadius: 1,
            border: "1px solid",
            borderColor: snapshot.isDragging ? "primary.main" : "rgba(0,0,0,0.12)",
            boxShadow: snapshot.isDragging ? "0 4px 12px rgba(56, 133, 96, 0.25)" : "none",
            backgroundColor: "background.paper",
            display: "flex",
            flexDirection: "column",
            gap: 1,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5 }}>
            <Box
              {...providedDraggable.dragHandleProps}
              sx={{
                mt: 0.5,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: snapshot.isDragging ? "primary.main" : "text.disabled",
                cursor: "grab",
              }}
            >
              <DragIndicatorIcon fontSize="small" />
            </Box>

            <Box sx={{ flex: 1, display: "flex", flexDirection: "column", gap: 1 }}>
              <Box sx={{ display: "flex", gap: 1 }}>
                <TextField
                  fullWidth
                  size="small"
                  label="Field label"
                  required
                  value={field.label}
                  onChange={(e) => onLabelChange(e.target.value)}
                  error={!!errors.label}
                  helperText={errors.label}
                />

                <FormControl size="small" sx={{ minWidth: 160 }}>
                  <InputLabel id={`field-type-label-${field.id}`}>Type</InputLabel>
                  <Select
                    labelId={`field-type-label-${field.id}`}
                    label="Type"
                    value={field.type}
                    onChange={(e) => onTypeChange(e.target.value as FormFieldType)}
                  >
                    <MenuItem value="shortText">Short text</MenuItem>
                    <MenuItem value="longText">Long text</MenuItem>
                    <MenuItem value="singleSelect">Single select</MenuItem>
                    <MenuItem value="multiSelect">Multi select</MenuItem>
                    <MenuItem value="checkbox">Checkbox</MenuItem>
                    <MenuItem value="file">File upload</MenuItem>
                  </Select>
                </FormControl>
              </Box>

              {field.type === "file" && (
                <Typography variant="caption" color="text.secondary">
                  Candidates will upload a file in this field.
                </Typography>
              )}

              {(field.type === "singleSelect" || field.type === "multiSelect") && (
                <TextField
                  fullWidth
                  size="small"
                  label="Options (comma-separated)"
                  value={optionsValue}
                  onChange={(e) => onOptionsChange(e.target.value)}
                  error={!!errors.options}
                  helperText={errors.options || "Example: Yes, No, Maybe"}
                />
              )}

              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={field.required}
                      onChange={(e) => onRequiredChange(e.target.checked)}
                    />
                  }
                  label="Required"
                />

                <IconButton
                  size="small"
                  color="error"
                  onClick={onDelete}
                  sx={{ ml: 1 }}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Box>
            </Box>
          </Box>

          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.5 }}>
            <Chip size="small" label={`Question ${index + 1}`} />
            {field.type === "shortText" && (
              <Chip size="small" label="Short text" variant="outlined" />
            )}
            {field.type === "longText" && (
              <Chip size="small" label="Long text" variant="outlined" />
            )}
            {field.type === "singleSelect" && (
              <Chip size="small" label="Single select" variant="outlined" />
            )}
            {field.type === "multiSelect" && (
              <Chip size="small" label="Multi select" variant="outlined" />
            )}
            {field.type === "checkbox" && (
              <Chip size="small" label="Checkbox" variant="outlined" />
            )}
            {field.required && (
              <Chip size="small" color="primary" label="Required" />
            )}
          </Box>
        </Paper>
      )}
    </Draggable>
  );
}

function getUpdatedOptions(field: FormField, newType: FormFieldType): string[] | undefined {
  if (newType !== "singleSelect" && newType !== "multiSelect") return undefined;
  return field.options && field.options.length > 0 ? field.options : [""];
}

export default function ApplicationFormBuilderDialog({
  open,
  onClose,
  jobId,
  jobName,
  initialForm,
  onSaved,
}: ApplicationFormBuilderDialogProps) {
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [fields, setFields] = useState<FormField[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, FieldErrors>>({});
  const [formStatus, setFormStatus] = useState<"draft" | "published">("draft");

  const hasExistingForm = useMemo(() => !!initialForm, [initialForm]);

  useEffect(() => {
    if (open) {
      if (initialForm) {
        setFormTitle(initialForm.title);
        setFormDescription(initialForm.description ?? "");
        setFields(initialForm.fields ?? []);
        setFormStatus(initialForm.status ?? "draft");
      } else {
        setFormTitle(`Application for ${jobName}`);
        setFormDescription("");
        setFields([
          {
            id: crypto.randomUUID(),
            type: "shortText",
            label: "",
            required: true,
          },
        ]);
        setFormStatus("draft");
      }
      setError("");
      setFieldErrors({});
    }
  }, [open, initialForm, jobName]);

  const handleAddField = () => {
    setFields((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        type: "shortText",
        label: "",
        required: false,
      },
    ]);
  };

  const handleDeleteField = (id: string) => {
    setFields((prev) => prev.filter((field) => field.id !== id));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleFieldChange = <K extends keyof FormField>(id: string, key: K, value: FormField[K]) => {
    setFields((prev) => prev.map((field) => (field.id === id ? { ...field, [key]: value } : field)));
    if (key === "label" || key === "options") {
      setFieldErrors((prev) => ({
        ...prev,
        [id]: {
          ...prev[id],
          [key === "label" ? "label" : "options"]: undefined,
        },
      }));
    }
  };

  const handleFieldTypeChange = (id: string, type: FormFieldType) => {
    setFields((prev) =>
      prev.map((field) =>
        field.id === id
          ? { ...field, type, options: getUpdatedOptions(field, type) }
          : field,
      ),
    );
    setFieldErrors((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        options: undefined,
      },
    }));
  };

  const handleOptionsChange = (id: string, value: string) => {
    const options = value.split(",").map((opt) => opt.trim());
    handleFieldChange(id, "options", options);
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const newFields = Array.from(fields);
    const [moved] = newFields.splice(result.source.index, 1);
    newFields.splice(result.destination.index, 0, moved);
    setFields(newFields);
  };

  const validateForm = () => {
    const trimmedTitle = formTitle.trim();
    if (!trimmedTitle) {
      setError("Form title is required.");
      return false;
    }

    if (fields.length === 0) {
      setError("Add at least one field to your application form.");
      return false;
    }

    const newFieldErrors: Record<string, FieldErrors> = {};
    let hasError = false;

    fields.forEach((field) => {
      const currentErrors: FieldErrors = {};

      if (!field.label.trim()) {
        currentErrors.label = "Field label is required.";
        hasError = true;
      }

      if (field.type === "singleSelect" || field.type === "multiSelect") {
        const options = (field.options ?? []).map((opt) => opt.trim()).filter((opt) => opt.length > 0);
        if (options.length === 0) {
          currentErrors.options = "Provide at least one option.";
          hasError = true;
        }
      }

      if (Object.keys(currentErrors).length > 0) {
        newFieldErrors[field.id] = currentErrors;
      }
    });

    setFieldErrors(newFieldErrors);

    if (hasError) {
      if (!error) {
        setError("Please fix the highlighted fields before saving.");
      }
      return false;
    }

    setError("");
    return true;
  };

  const handleSave = async () => {
    if (saving) return;

    const isValid = validateForm();
    if (!isValid) {
      return;
    }

    const now = Date.now();
    const formToSave: ApplicationForm = {
      title: formTitle.trim(),
      status: formStatus,
      ...(formDescription.trim() ? { description: formDescription.trim() } : {}),
      ...(formStatus === "published" ? { publishedAt: now } : {}),
      fields: fields.map((field) => {
        const base: FormField = {
          id: field.id,
          type: field.type,
          label: field.label.trim(),
          required: field.required,
        };
        if (field.type === "singleSelect" || field.type === "multiSelect") {
          base.options = (field.options ?? [])
            .map((opt) => opt.trim())
            .filter((opt) => opt.length > 0);
        }
        return base;
      }),
      updatedAt: now,
    };

    try {
      setSaving(true);
      setError("");

      const token = await auth.currentUser?.getIdToken();
      const response = await fetch(
        `${API_URL}/api/jobs/${jobId}/form`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(formToSave),
        },
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save application form.");
      }

      if (onSaved) {
        onSaved(formToSave);
      }
      onClose();
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error("Error saving application form:", err);
      setError(err?.message || "Failed to save application form. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    if (saving) return;
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      slotProps={{
        paper: { sx: { maxHeight: "90vh" } },
      }}
    >
      <DialogTitle>
        <Typography variant="h6" component="div">
          Application Form
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {jobName}
        </Typography>
      </DialogTitle>

      <DialogContent dividers>
        <Box sx={{ mb: 2, display: "flex", alignItems: "flex-start", gap: 1.5 }}>
          <InfoOutlinedIcon sx={{ color: "text.secondary", mt: 0.5 }} fontSize="small" />
          <Typography variant="body2" color="text.secondary">
            Define the questions candidates will answer when applying to this job during the virtual career fair.
            {hasExistingForm
              ? " You can edit, reorder, or remove existing fields at any time."
              : " Start by customizing the title and your first question."}
          </Typography>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
            {error}
          </Alert>
        )}

        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mb: 3 }}>
          <TextField
            fullWidth
            label="Form title"
            required
            value={formTitle}
            onChange={(e) => setFormTitle(e.target.value)}
          />
          <TextField
            fullWidth
            multiline
            minRows={2}
            label="Form description (optional)"
            value={formDescription}
            onChange={(e) => setFormDescription(e.target.value)}
            placeholder="Share context or instructions for candidates about this application."
          />
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
          <FormControlLabel
            control={
              <Switch
                checked={formStatus === "published"}
                onChange={(e) => {
                  setFormStatus(e.target.checked ? "published" : "draft");
                }}
                color="primary"
              />
            }
            label={formStatus === "published" ? "Published" : "Draft"}
          />
        </Box>

        <Divider sx={{ mb: 2 }} />

        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
          <Typography variant="subtitle1" fontWeight="bold">
            Fields
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Drag to reorder questions. Required questions are marked with an asterisk.
          </Typography>
        </Box>

        <Box
          sx={{
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 1,
            p: 1,
            maxHeight: 360,
            overflow: "auto",
            bgcolor: "#fafafa",
          }}
        >
          {fields.length === 0 ? (
            <Box sx={{ p: 3, textAlign: "center" }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                No fields yet.
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Use the{" "}
                <Box component="span" sx={{ fontWeight: 600 }}>
                  Add field
                </Box>{" "}
                button below to start building your form.
              </Typography>
            </Box>
          ) : (
            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="application-form-fields">
                {(providedDroppable: DroppableProvided) => (
                  <Box ref={providedDroppable.innerRef} {...providedDroppable.droppableProps} sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    {fields.map((field, index) => (
                      <FieldCard
                        key={field.id}
                        field={field}
                        index={index}
                        errors={fieldErrors[field.id] || {}}
                        onLabelChange={(value) => handleFieldChange(field.id, "label", value)}
                        onTypeChange={(type) => handleFieldTypeChange(field.id, type)}
                        onOptionsChange={(value) => handleOptionsChange(field.id, value)}
                        onRequiredChange={(checked) => handleFieldChange(field.id, "required", checked)}
                        onDelete={() => handleDeleteField(field.id)}
                      />
                    ))}
                    {providedDroppable.placeholder}
                  </Box>
                )}
              </Droppable>
            </DragDropContext>
          )}
        </Box>

        <Box sx={{ mt: 2, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={handleAddField}
            sx={{
              textTransform: "none",
              borderRadius: 999,
              px: 2,
              background: "linear-gradient(135deg, #388560 0%, #2d6b4d 100%)",
              color: "white",
              "&:hover": {
                background: "linear-gradient(135deg, #2d6b4d 0%, #388560 100%)",
              },
            }}
          >
            Add field
          </Button>

          <Typography variant="caption" color="text.secondary">
            {fields.length} field{fields.length === 1 ? "" : "s"} configured
          </Typography>
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={saving}
          sx={{
            background: "linear-gradient(135deg, #388560 0%, #2d6b4d 100%)",
            "&:hover": {
              background: "linear-gradient(135deg, #2d6b4d 0%, #388560 100%)",
            },
          }}
        >
          {saving ? "Saving..." : "Save form"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
