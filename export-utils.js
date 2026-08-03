(function (global) {
  function backupFilename(date) {
    return "daily-log-" + date + ".json";
  }

  function createBackupBlob(entries, fields) {
    return new Blob([JSON.stringify({ entries, fields }, null, 2)], { type: "application/json" });
  }

  function canShareFile(navigatorRef, file) {
    if (!navigatorRef || typeof navigatorRef.share !== "function") return false;
    if (typeof navigatorRef.canShare !== "function") return false;
    try {
      return navigatorRef.canShare({ files: [file] });
    } catch (e) {
      return false;
    }
  }

  function downloadBlob(documentRef, urlRef, blob, filename) {
    if (!documentRef || typeof documentRef.createElement !== "function") {
      throw new Error("Document download API unavailable");
    }
    if (!urlRef || typeof urlRef.createObjectURL !== "function") {
      throw new Error("Object URL API unavailable");
    }

    const url = urlRef.createObjectURL(blob);
    const a = documentRef.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";

    try {
      if (documentRef.body && typeof documentRef.body.appendChild === "function") {
        documentRef.body.appendChild(a);
      }
      a.click();
    } finally {
      if (typeof a.remove === "function") a.remove();
      if (typeof urlRef.revokeObjectURL === "function") urlRef.revokeObjectURL(url);
    }
  }

  async function exportTrackingData(options) {
    const {
      entries,
      fields,
      date,
      navigatorRef = global.navigator,
      documentRef = global.document,
      urlRef = global.URL
    } = options;

    const filename = backupFilename(date);
    const blob = createBackupBlob(entries, fields);
    const canBuildFile = typeof global.File === "function";
    const file = canBuildFile ? new global.File([blob], filename, { type: "application/json" }) : null;

    if (file && canShareFile(navigatorRef, file)) {
      try {
        await navigatorRef.share({ files: [file], title: "Intuitive Tracker" });
        return { method: "share", filename };
      } catch (e) {}
    }

    downloadBlob(documentRef, urlRef, blob, filename);
    return { method: "download", filename };
  }

  global.IntuitiveTrackerExport = {
    backupFilename,
    createBackupBlob,
    canShareFile,
    downloadBlob,
    exportTrackingData
  };
})(typeof window !== "undefined" ? window : globalThis);
