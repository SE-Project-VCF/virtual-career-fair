import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Rating,
  TextField,
  Typography,
} from "@mui/material"

interface ResubmitReviewDialogProps {
  open: boolean
  onClose: () => void
  resubmitValue: number | null
  setResubmitValue: (v: number | null) => void
  resubmitComment: string
  setResubmitComment: (v: string) => void
  submittingRating: boolean
  onSubmit: (value: number | null, comment: string, onSuccess: () => void) => void
}

export default function ResubmitReviewDialog({
  open,
  onClose,
  resubmitValue,
  setResubmitValue,
  resubmitComment,
  setResubmitComment,
  submittingRating,
  onSubmit,
}: Readonly<ResubmitReviewDialogProps>) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Resubmit Review</DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>New rating</Typography>
          <Rating value={resubmitValue} onChange={(_, v) => setResubmitValue(v)} size="large" />
          <TextField
            label="Comment (optional)"
            value={resubmitComment}
            onChange={(e) => setResubmitComment(e.target.value)}
            fullWidth multiline rows={3} size="small"
            sx={{ mt: 2 }}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!resubmitValue || submittingRating}
          onClick={() => onSubmit(resubmitValue, resubmitComment, onClose)}
        >
          {submittingRating ? "Submitting..." : "Submit"}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
