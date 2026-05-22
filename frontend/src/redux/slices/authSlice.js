import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../services/api';

const hasWindow = typeof window !== 'undefined';

const readStorage = (key) => {
  if (!hasWindow) {
    return null;
  }

  try {
    return window.localStorage.getItem(key);
  } catch (error) {
    return null;
  }
};

const writeStorage = (key, value) => {
  if (!hasWindow) {
    return;
  }

  try {
    window.localStorage.setItem(key, value);
  } catch (error) {
    // Ignore storage write failures so auth state can still proceed in memory.
  }
};

const removeStorage = (key) => {
  if (!hasWindow) {
    return;
  }

  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    // Ignore storage cleanup failures.
  }
};

const parseStoredUser = (rawValue) => {
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue);
  } catch (error) {
    return null;
  }
};

const storedToken = readStorage('token');
const storedRefreshToken = readStorage('refreshToken');
const storedUser = readStorage('user');

const persistSession = (user, tokens = {}) => {
  if (tokens.accessToken) {
    writeStorage('token', tokens.accessToken);
  }

  if (tokens.refreshToken) {
    writeStorage('refreshToken', tokens.refreshToken);
  }

  if (user) {
    writeStorage('user', JSON.stringify(user));
  }
};

const clearSession = () => {
  removeStorage('token');
  removeStorage('refreshToken');
  removeStorage('user');
};

export const login = createAsyncThunk(
  'auth/login',
  async (credentials, { rejectWithValue }) => {
    try {
      const response = await api.post('/auth/login', credentials);
      const payload = response.data.data;
      persistSession(payload.user, payload.tokens);
      return payload;
    } catch (error) {
      return rejectWithValue(error.userMessage || error.response?.data?.message || 'Login failed');
    }
  }
);

export const fetchCurrentUser = createAsyncThunk(
  'auth/fetchCurrentUser',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get('/auth/me');
      const user = response.data.data;
      persistSession(user);
      return user;
    } catch (error) {
      clearSession();
      return rejectWithValue(error.userMessage || error.response?.data?.message || 'Session expired');
    }
  }
);

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: parseStoredUser(storedUser),
    token: storedToken,
    refreshToken: storedRefreshToken,
    isAuthenticated: Boolean(storedToken),
    loading: false,
    error: null,
    bootstrapped: false,
  },
  reducers: {
    hydrateSession: (state, action) => {
      const { user, tokens } = action.payload || {};
      persistSession(user, tokens);
      state.user = user || null;
      state.token = tokens?.accessToken || null;
      state.refreshToken = tokens?.refreshToken || null;
      state.isAuthenticated = Boolean(tokens?.accessToken);
      state.error = null;
      state.bootstrapped = true;
    },
    logout: (state) => {
      clearSession();
      state.user = null;
      state.token = null;
      state.refreshToken = null;
      state.isAuthenticated = false;
      state.error = null;
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload.user;
        state.token = action.payload.tokens.accessToken;
        state.refreshToken = action.payload.tokens.refreshToken;
        state.isAuthenticated = true;
        state.bootstrapped = true;
      })
      .addCase(login.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        state.isAuthenticated = false;
        state.bootstrapped = true;
      })
      .addCase(fetchCurrentUser.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchCurrentUser.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload;
        state.isAuthenticated = true;
        state.bootstrapped = true;
      })
      .addCase(fetchCurrentUser.rejected, (state, action) => {
        state.loading = false;
        state.user = null;
        state.token = null;
        state.refreshToken = null;
        state.isAuthenticated = false;
        state.error = action.payload;
        state.bootstrapped = true;
      });
  },
});

export const { hydrateSession, logout, clearError } = authSlice.actions;
export default authSlice.reducer;
