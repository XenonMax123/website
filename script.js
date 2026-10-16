// Send zip to url
function sendZip(url, zipFile) {
  const formData = new FormData();
  formData.append("file", zipFile);

  fetch(url, {
    method: "POST",
    body: formData,
  })
    .then((response) => response.json())
    .then((result) => {
      console.log("Success:", result);
    })
    .catch((error) => {
      console.error("Error:", error);
    });
}

// Read requests
function readRequests(url) {
  fetch(url)
    .then((response) => response.json())
    .then((result) => {
      console.log("Requests:", result);
    })
    .catch((error) => {
      console.error("Error:", error);
    });
}

// If requests givs its current version and there is a newer version available, send zip file
function updateIfNewer(url, currentVersion, zipFile) {
  readRequests(url);
  // Assuming readRequests will return a promise with the result
  fetch(url)
    .then((response) => response.json())
    .then((result) => {
      if (result.version > currentVersion) {
        sendZip(url, zipFile);
      }
    })
    .catch((error) => {
      console.error("Error:", error);
    });
}

// get newest version from release_info.yaml
function getNewestVersion(url) {
  return fetch(url)
    .then((response) => response.json())
    .then((result) => {
      return result.version;
    })
    .catch((error) => {
      console.error("Error:", error);
    });
}
