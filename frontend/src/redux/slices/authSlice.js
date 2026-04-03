import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../services/api';

const storedToken = localStorage.getItem('token');
const storedRefreshToken = localStorage.getItem('refreshToken');
const storedUser = localStorage.getItem('user');

const persistSession = (user, tokens = {}) => {
  if (tokens.accessToken) {
    localStorage.setItem('token', tokens.accessToken);
  }

  if (tokens.refreshToken) {
    localStorage.setItem('refreshToken', tokens.refreshToken);
  }

  if (user) {
    localStorage.setItem('user', JSON.stringify(user));
  }
};

const clearSession = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
};

const resolveRequestError = (error, fallback) => {
  if (error?.response?.data?.message) {
    return error.response.data.message;
  }

  if (error?.code === 'ERR_NETWORK' || !error?.response) {
    return 'Request blocked by browser/network. Disable privacy blockers for this site and try again.';
  }

  return fallback;
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
      return rejectWithValue(resolveRequestError(error, 'Login failed'));
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
      return rejectWithValue(resolveRequestError(error, 'Session expired'));
    }
  }
);

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: storedUser ? JSON.parse(storedUser) : null,
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
