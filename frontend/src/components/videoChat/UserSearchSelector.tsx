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

export interface UserSearchResult {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  major?: string;
}

interface UserSearchSelectorProps {
  value: UserSearchResult | null;
  onChange: (user: UserSearchResult | null) => void;
  disabled?: boolean;
  label?: string;
  error?: boolean;
  helperText?: string;
  placeholder?: string;
}

async function searchUsers(searchTerm: string): Promise<UserSearchResult[]> {
  try {
    const currentUser = authUtils.getCurrentUser();
    if (!currentUser) {
      return [];
    }

    if (!searchTerm || searchTerm.length < 1) {
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
      console.error('Search failed:', response.statusText);
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
    console.error('Search users error:', err);
    return [];
  }
}

export function UserSearchSelector({
  value,
  onChange,
  disabled = false,
  label = 'Search User',
  error = false,
  helperText = '',
  placeholder = 'Search by name or email (min 1 char)',
}: Readonly<UserSearchSelectorProps>) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<UserSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');

  const handleSearch = useCallback(async (input: string) => {
    if (!input || input.length < 1) {
      setOptions([]);
      return;
    }

    setLoading(true);
    try {
      const results = await searchUsers(input);
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

  const getOptionLabel = (option: UserSearchResult | string) => {
    if (typeof option === 'string') {
      return option;
    }
    const name = `${option.firstName} ${option.lastName}`.trim();
    if (option.email) {
      return `${name} (${option.email})`;
    }
    return name;
  };

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
      getOptionLabel={getOptionLabel}
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
            <Typography variant="body2">
              {option.firstName} {option.lastName}
            </Typography>
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
          placeholder={placeholder}
          error={error}
          helperText={helperText}
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
