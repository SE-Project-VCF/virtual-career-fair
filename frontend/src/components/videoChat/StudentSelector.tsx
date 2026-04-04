import { useState, useEffect, useCallback } from 'react';
import {
  TextField,
  Autocomplete,
  CircularProgress,
  Box,
  Typography,
  Chip,
} from '@mui/material';
import { authUtils } from '../../utils/auth';

export interface Student {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  major?: string;
}

interface StudentSelectorProps {
  value: Student | null;
  onChange: (student: Student | null) => void;
  disabled?: boolean;
  label?: string;
  error?: boolean;
  helperText?: string;
}

// Mock API call - in a real app, this would call your backend
// For now, we'll use a basic fetch from a students endpoint
async function fetchStudents(searchTerm: string): Promise<Student[]> {
  try {
    const currentUser = authUtils.getCurrentUser();
    if (!currentUser) {
      return [];
    }

    const token = await authUtils.getIdToken();
    const response = await fetch(
      `/api/students?search=${encodeURIComponent(searchTerm)}&userId=${encodeURIComponent(currentUser.uid)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return (data.students || []).map((student: any) => ({
      id: student.id,
      firstName: student.firstName || '',
      lastName: student.lastName || '',
      email: student.email || '',
      major: student.major || '',
    }));
  } catch (err) {
    console.error('Fetch students error:', err);
    return [];
  }
}

export function StudentSelector({
  value,
  onChange,
  disabled = false,
  label = 'Select Student',
  error = false,
  helperText = '',
}: StudentSelectorProps) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');

  const handleSearch = useCallback(async (input: string) => {
    if (!input || input.length < 2) {
      setOptions([]);
      return;
    }

    setLoading(true);
    try {
      const results = await fetchStudents(input);
      setOptions(results);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      handleSearch(searchText);
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [searchText, handleSearch]);

  return (
    <Autocomplete
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      value={value}
      onChange={(_, newValue) => onChange(newValue)}
      inputValue={searchText}
      onInputChange={(_, newInput) => setSearchText(newInput)}
      options={options}
      loading={loading}
      disabled={disabled}
      getOptionLabel={(option) => `${option.firstName} ${option.lastName}${option.email ? ` (${option.email})` : ''}`}
      isOptionEqualToValue={(option, compareValue) => option.id === compareValue?.id}
      renderOption={(props, option) => (
        <Box
          component="li"
          {...props}
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            py: 1,
          }}
        >
          <Box>
            <Typography variant="body2">{option.firstName} {option.lastName}</Typography>
            {option.email && (
              <Typography variant="caption" sx={{ color: '#666' }}>
                {option.email}
              </Typography>
            )}
            {option.major && (
              <Chip
                label={option.major}
                size="small"
                variant="outlined"
                sx={{ ml: 1, mt: 0.5 }}
              />
            )}
          </Box>
        </Box>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder="Search name or email (min 2 chars)"
          error={error}
          helperText={helperText || 'Type to search for a student'}
          slotProps={{
            input: {
              ...params.InputProps,
              endAdornment: (
                <>
                  {loading ? <CircularProgress color="inherit" size={20} /> : null}
                  {params.InputProps.endAdornment}
                </>
              ),
            },
          }}
        />
      )}
    />
  );
}
