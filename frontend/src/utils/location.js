const LOCATION_TIMEOUT_MS = 15000;

const LocationErrorMessage = {
  HTTPS_REQUIRED: 'Location access requires a secure HTTPS connection.',
  NOT_SUPPORTED: 'Location services are not supported by this browser.',
  PERMISSION_DENIED: 'Location permission was denied. Enable it in your browser settings.',
  POSITION_UNAVAILABLE: 'Your current location could not be determined.',
  TIMEOUT: 'Location verification timed out. Please try again.',
  LOW_ACCURACY: 'Your location signal is not accurate enough. Move to an open area and try again.',
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
        requestPosition(resolve);
      }).catch(() => {
        requestPosition(resolve);
      });
    } else {
      requestPosition(resolve);
    }
  });

const requestPosition = (resolve) => {
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
      timeout: LOCATION_TIMEOUT_MS,
      maximumAge: 0,
    }
  );
};

export { getVerifiedLocation, LocationErrorMessage };
