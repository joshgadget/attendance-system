const debugLog = (...args) => {
  if (process.env.NODE_ENV === 'development') {
    console.log('[LocationService]', ...args);
  }
};

const LocationErrorMessage = {
  HTTPS_REQUIRED: 'Location access requires a secure HTTPS connection.',
  NOT_SUPPORTED: 'Location services are not supported by this browser.',
  PERMISSION_DENIED: 'Location permission is required to create an attendance session. Allow location access in your browser settings and try again.',
  POSITION_UNAVAILABLE: 'We could not determine your current location. Turn on GPS, move closer to an open area, and try again.',
  TIMEOUT: 'Your location is taking longer than expected. Keep GPS enabled and try again.',
  LOW_ACCURACY: 'Your location signal is not accurate enough. Move to an open area and try again.',
  INVALID_COORDINATES: 'Invalid coordinates received. Please try again.',
};

const LOCATION_PROGRESS = {
  CHECKING_PERMISSION: 'checking_permission',
  REQUESTING_CACHED: 'requesting_cached',
  REQUESTING_FRESH: 'requesting_fresh',
  IMPROVING_ACCURACY: 'improving_accuracy',
  VERIFIED: 'verified',
};

const LOCATION_PROGRESS_LABELS = {
  [LOCATION_PROGRESS.CHECKING_PERMISSION]: 'Checking location permission',
  [LOCATION_PROGRESS.REQUESTING_CACHED]: 'Requesting current location',
  [LOCATION_PROGRESS.REQUESTING_FRESH]: 'Requesting current location',
  [LOCATION_PROGRESS.IMPROVING_ACCURACY]: 'Improving GPS accuracy',
  [LOCATION_PROGRESS.VERIFIED]: 'Location verified',
};

const ACCURACY_THRESHOLD_GOOD = 50;
const ACCURACY_THRESHOLD_ACCEPTABLE = 100;

const isSecureContext = () =>
  window.location.protocol === 'https:' ||
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1';

const isGeolocationSupported = () => 'geolocation' in navigator;

const checkPermission = async () => {
  if (navigator.permissions && navigator.permissions.query) {
    try {
      const result = await navigator.permissions.query({ name: 'geolocation' });
      return result.state;
    } catch {
      return 'prompt';
    }
  }
  return 'prompt';
};

const validateCoordinate = (value, type) => {
  if (value === null || value === undefined || typeof value !== 'number') return false;
  if (!Number.isFinite(value)) return false;
  if (type === 'latitude' && (value < -90 || value > 90)) return false;
  if (type === 'longitude' && (value < -180 || value > 180)) return false;
  return true;
};

const validateLocation = (latitude, longitude, accuracy, timestamp) => {
  if (!validateCoordinate(latitude, 'latitude')) return { valid: false, reason: 'Invalid latitude.' };
  if (!validateCoordinate(longitude, 'longitude')) return { valid: false, reason: 'Invalid longitude.' };
  if (accuracy === null || accuracy === undefined || !Number.isFinite(accuracy) || accuracy < 0) {
    return { valid: false, reason: 'Invalid or missing accuracy.' };
  }
  if (!timestamp || !Number.isFinite(timestamp)) {
    return { valid: false, reason: 'Invalid or missing timestamp.' };
  }
  const age = Date.now() - timestamp;
  if (age > 120000) {
    return { valid: false, reason: 'Location data is too old.' };
  }
  return { valid: true };
};

const ProgressiveLocationService = {
  _watcherId: null,
  _timers: [],
  _pending: false,
  _startTime: null,

  _clearTimers() {
    this._timers.forEach((t) => clearTimeout(t));
    this._timers = [];
  },

  _clearWatcher() {
    if (this._watcherId !== null) {
      navigator.geolocation.clearWatch(this._watcherId);
      this._watcherId = null;
    }
  },

  cancel() {
    debugLog('Cancelling location request');
    this._clearTimers();
    this._clearWatcher();
    this._pending = false;
    this._startTime = null;
  },

  start({ onProgress, onSuccess, onError, radius }) {
    if (this._pending) {
      debugLog('Location request already in progress, ignoring duplicate start');
      return () => this.cancel();
    }

    this._pending = true;
    this._startTime = Date.now();
    const cleanup = () => this.cancel();

    if (!isSecureContext()) {
      this._pending = false;
      onError(LocationErrorMessage.HTTPS_REQUIRED);
      return cleanup;
    }

    if (!isGeolocationSupported()) {
      this._pending = false;
      onError(LocationErrorMessage.NOT_SUPPORTED);
      return cleanup;
    }

    onProgress(LOCATION_PROGRESS.CHECKING_PERMISSION);

    checkPermission()
      .then((permissionState) => {
        debugLog('Permission state:', permissionState);

        if (permissionState === 'denied') {
          this._pending = false;
          onError(LocationErrorMessage.PERMISSION_DENIED);
          return;
        }

        this._attemptCachedLocation({ onProgress, onSuccess, onError, radius });
      })
      .catch(() => {
        this._attemptCachedLocation({ onProgress, onSuccess, onError, radius });
      });

    return cleanup;
  },

  _attemptCachedLocation({ onProgress, onSuccess, onError, radius }) {
    debugLog('Step 1: Attempting cached / low-accuracy location');
    onProgress(LOCATION_PROGRESS.REQUESTING_CACHED);

    const timer = setTimeout(() => {
      debugLog('Step 1 timed out, moving to step 2');
      this._attemptFreshLocation({ onProgress, onSuccess, onError, radius });
    }, 15000);
    this._timers.push(timer);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(timer);
        this._clearTimers();
        this._handlePosition(position, { onProgress, onSuccess, onError, radius, cached: true });
      },
      () => {
        clearTimeout(timer);
        this._clearTimers();
        debugLog('Step 1 failed (position unavailable), moving to step 2');
        this._attemptFreshLocation({ onProgress, onSuccess, onError, radius });
      },
      {
        enableHighAccuracy: false,
        timeout: 15000,
        maximumAge: 30000,
      }
    );
  },

  _attemptFreshLocation({ onProgress, onSuccess, onError, radius }) {
    debugLog('Step 2: Attempting fresh high-accuracy location');
    onProgress(LOCATION_PROGRESS.REQUESTING_FRESH);

    const timer = setTimeout(() => {
      debugLog('Step 2 timed out, moving to step 3 (watchPosition)');
      this._attemptWatchPosition({ onProgress, onSuccess, onError, radius });
    }, 30000);
    this._timers.push(timer);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(timer);
        this._clearTimers();
        this._handlePosition(position, { onProgress, onSuccess, onError, radius, cached: false });
      },
      (error) => {
        clearTimeout(timer);
        this._clearTimers();
        if (error.code === 3) {
          debugLog('Step 2 timed out (error code 3), moving to step 3');
          this._attemptWatchPosition({ onProgress, onSuccess, onError, radius });
        } else {
          this._pending = false;
          this._handleErrorCode(error.code, onError);
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 30000,
        maximumAge: 0,
      }
    );
  },

  _attemptWatchPosition({ onProgress, onSuccess, onError, radius }) {
    debugLog('Step 3: watchPosition fallback');
    onProgress(LOCATION_PROGRESS.IMPROVING_ACCURACY);

    const watchMaxTime = 45000;
    const watchTimeout = setTimeout(() => {
      debugLog('Watch position reached maximum time without acceptable accuracy');
      this._clearWatcher();
      this._clearTimers();
      this._pending = false;
      onError(LocationErrorMessage.TIMEOUT);
    }, watchMaxTime);
    this._timers.push(watchTimeout);

    let bestPosition = null;

    this._watcherId = navigator.geolocation.watchPosition(
      (position) => {
        const timeTaken = Date.now() - this._startTime;
        const { latitude, longitude, accuracy } = position.coords;
        const timestamp = position.timestamp;

        debugLog('Watch update - accuracy:', accuracy, 'm, elapsed:', timeTaken, 'ms');

        const validation = validateLocation(latitude, longitude, accuracy, timestamp);
        if (!validation.valid) {
          debugLog('Watch position failed validation:', validation.reason);
          return;
        }

        if (!bestPosition || accuracy < bestPosition.coords.accuracy) {
          bestPosition = position;
        }

        if (accuracy <= ACCURACY_THRESHOLD_GOOD) {
          debugLog('Watch accepted with accuracy:', accuracy);
          clearTimeout(watchTimeout);
          this._clearTimers();
          this._clearWatcher();
          this._handleSuccess(position, { onSuccess, radius, cached: false, timeTaken });
        }
      },
      (error) => {
        debugLog('Watch position error, code:', error.code);
        if (error.code === 3) {
          return;
        }
        clearTimeout(watchTimeout);
        this._clearTimers();
        this._clearWatcher();
        this._pending = false;
        this._handleErrorCode(error.code, onError);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 30000,
      }
    );
  },

  _handlePosition(position, { onProgress, onSuccess, onError, radius, cached }) {
    const timeTaken = Date.now() - this._startTime;
    const { latitude, longitude, accuracy } = position.coords;
    const timestamp = position.timestamp;

    debugLog('Position received - accuracy:', accuracy, 'm, cached:', cached, 'elapsed:', timeTaken, 'ms');

    const validation = validateLocation(latitude, longitude, accuracy, timestamp);
    if (!validation.valid) {
      debugLog('Location validation failed:', validation.reason);
      if (cached) {
        this._attemptFreshLocation({ onProgress, onSuccess, onError, radius });
      } else {
        this._attemptWatchPosition({ onProgress, onSuccess, onError, radius });
      }
      return;
    }

    if (accuracy <= ACCURACY_THRESHOLD_GOOD) {
      this._handleSuccess(position, { onSuccess, radius, cached, timeTaken });
    } else if (cached && accuracy <= ACCURACY_THRESHOLD_ACCEPTABLE) {
      debugLog('Accepting cached location with acceptable accuracy:', accuracy);
      this._handleSuccess(position, { onSuccess, radius, cached, timeTaken });
    } else {
      debugLog('Accuracy insufficient for acceptance, moving to next step');
      if (cached) {
        this._attemptFreshLocation({ onProgress, onSuccess, onError, radius });
      } else {
        this._attemptWatchPosition({ onProgress, onSuccess, onError, radius });
      }
    }
  },

  _handleSuccess(position, { onSuccess, radius, cached, timeTaken }) {
    this._clearTimers();
    this._clearWatcher();
    this._pending = false;

    const { latitude, longitude, accuracy } = position.coords;
    const timestamp = position.timestamp;
    const elapsed = timeTaken !== undefined ? timeTaken : Date.now() - this._startTime;

    debugLog('Location success - lat:', latitude.toFixed(6), 'lng:', longitude.toFixed(6), 'accuracy:', accuracy, 'm, cached:', cached, 'elapsed:', elapsed, 'ms');

    const radiusNum = Number(radius);
    const accuracyWarning =
      radiusNum && accuracy > radiusNum
        ? `The detected location accuracy (${Math.round(accuracy)}m) is worse than the selected attendance radius (${radiusNum}m). Students near the edge may have difficulty checking in.`
        : null;

    onSuccess({
      latitude,
      longitude,
      accuracy,
      timestamp,
      cached,
      accuracyWarning,
      timeTaken: elapsed,
    });
  },

  _handleErrorCode(code, onError) {
    let message;
    switch (code) {
      case 1:
        message = LocationErrorMessage.PERMISSION_DENIED;
        break;
      case 2:
        message = LocationErrorMessage.POSITION_UNAVAILABLE;
        break;
      case 3:
        message = LocationErrorMessage.TIMEOUT;
        break;
      default:
        message = LocationErrorMessage.POSITION_UNAVAILABLE;
    }
    onError(message);
  },
};

const getVerifiedLocation = () =>
  new Promise((resolve) => {
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const isHttps = window.location.protocol === 'https:';
    if (!isLocalhost && !isHttps) {
      resolve({ success: false, error: LocationErrorMessage.HTTPS_REQUIRED });
      return;
    }

    if (!navigator.geolocation) {
      resolve({ success: false, error: LocationErrorMessage.NOT_SUPPORTED });
      return;
    }

    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'geolocation' }).then((permission) => {
        if (permission.state === 'denied') {
          resolve({ success: false, error: LocationErrorMessage.PERMISSION_DENIED });
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (position) => {
            resolve({
              success: true,
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              timestamp: position.timestamp,
            });
          },
          (error) => {
            const code = error.code;
            if (code === 1) {
              resolve({ success: false, error: LocationErrorMessage.PERMISSION_DENIED });
            } else if (code === 2) {
              resolve({ success: false, error: LocationErrorMessage.POSITION_UNAVAILABLE });
            } else if (code === 3) {
              resolve({ success: false, error: LocationErrorMessage.TIMEOUT });
            } else {
              resolve({ success: false, error: LocationErrorMessage.POSITION_UNAVAILABLE });
            }
          },
          {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0,
          }
        );
      }).catch(() => {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            resolve({
              success: true,
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              timestamp: position.timestamp,
            });
          },
          () => resolve({ success: false, error: LocationErrorMessage.POSITION_UNAVAILABLE }),
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
      });
    } else {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            success: true,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp,
          });
        },
        () => resolve({ success: false, error: LocationErrorMessage.POSITION_UNAVAILABLE }),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    }
  });

const getSingleLocation = () =>
  new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ success: false, error: LocationErrorMessage.NOT_SUPPORTED });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          success: true,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        });
      },
      () => resolve({ success: false }),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  });

const getSampledLocation = async (sampleCount = 2) => {
  const primary = await getVerifiedLocation();
  if (!primary.success || (primary.accuracy !== null && primary.accuracy < 100)) {
    return primary;
  }

  const samples = [primary];
  for (let i = 1; i < sampleCount; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const sample = await getSingleLocation();
    if (sample.success) samples.push(sample);
  }

  samples.sort((a, b) => (a.accuracy ?? Infinity) - (b.accuracy ?? Infinity));
  return samples[0];
};

export { ProgressiveLocationService, getVerifiedLocation, getSingleLocation, getSampledLocation, LocationErrorMessage, LOCATION_PROGRESS, LOCATION_PROGRESS_LABELS };
