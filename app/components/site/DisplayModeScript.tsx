import Script from "next/script";

export function DisplayModeScript({
  enhancedMinDeviceMemory,
  enhancedMinHardwareConcurrency,
}: {
  enhancedMinDeviceMemory: number;
  enhancedMinHardwareConcurrency: number;
}) {
  const script = `
    (function() {
      var key = "multiscatter-display-mode";
      var params = new URLSearchParams(window.location.search);
      var queryOverride = params.get("displayMode");
      var stored = window.localStorage.getItem(key);
      var mode = queryOverride === "reduced" || queryOverride === "enhanced" || queryOverride === "auto"
        ? queryOverride
        : stored === "reduced" || stored === "enhanced" || stored === "auto"
          ? stored
          : "auto";
      var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      var connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      var saveData = !!(connection && connection.saveData);
      var deviceMemory = navigator.deviceMemory || 8;
      var hardwareConcurrency = navigator.hardwareConcurrency || 8;
      var effective = "enhanced";
      if (mode === "reduced") effective = "reduced";
      if (mode === "enhanced") effective = "enhanced";
      if (mode === "auto") {
        if (reduceMotion || saveData || deviceMemory < ${enhancedMinDeviceMemory} || hardwareConcurrency < ${enhancedMinHardwareConcurrency}) {
          effective = "reduced";
        }
      }
      document.documentElement.dataset.displayPreference = mode;
      document.documentElement.dataset.displayMode = effective;
      if (queryOverride !== "reduced" && queryOverride !== "enhanced" && queryOverride !== "auto") {
        window.localStorage.setItem(key, mode);
      }
    })();
  `;

  return <Script id="display-mode-init" strategy="beforeInteractive">{script}</Script>;
}
