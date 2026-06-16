const reportWebVitals = onPerfEntry => {
  if (onPerfEntry && onPerfEntry instanceof Function) {
    import('web-vitals').then((webVitals) => {
      const { getCLS, getFID, getFCP, getLCP, getTTFB, onINP } = webVitals;
      getCLS?.(onPerfEntry);
      onINP?.(onPerfEntry);
      if (!onINP) {
        getFID?.(onPerfEntry);
      }
      getFCP?.(onPerfEntry);
      getLCP?.(onPerfEntry);
      getTTFB?.(onPerfEntry);
    });
  }
};

export default reportWebVitals;
