// Global variables to store extraction state
let isExtracting = false;
let jobData = [];
let currentPage = 1;
let totalPages = 1;
let currentTabId = null;

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "startExtraction") {
    startExtraction(sender.tab?.id || message.tabId);
    sendResponse({ status: "started" });
  } else if (message.action === "stopExtraction") {
    stopExtraction();
    sendResponse({ status: "stopped" });
  } else if (message.action === "getStatus") {
    sendResponse({
      isExtracting,
      currentPage,
      totalPages,
      jobCount: jobData.length
    });
  } else if (message.action === "exportData") {
    exportData(message.format);
    sendResponse({ status: "exported" });
  } else if (message.action === "addJobData") {
    jobData = jobData.concat(message.data);
    sendResponse({ status: "added", count: jobData.length });
  } else if (message.action === "updateProgress") {
    currentPage = message.currentPage;
    totalPages = message.totalPages;
    sendResponse({ status: "updated" });
  } else if (message.action === "resetData") {
    resetData();
    sendResponse({ status: "reset" });
  }
  return true; // Keep the message channel open for async responses
});

// Function to start the extraction process
function startExtraction(tabId) {
  isExtracting = true;
  jobData = [];
  currentPage = 1;
  currentTabId = tabId;
  
  // Send message to content script to start extraction
  chrome.tabs.sendMessage(tabId, { action: "extract" });
}

// Function to stop the extraction process
function stopExtraction() {
  isExtracting = false;
  
  // Send message to content script to stop extraction
  if (currentTabId) {
    chrome.tabs.sendMessage(currentTabId, { action: "stop" });
  }
}

// Function to reset all data
function resetData() {
  isExtracting = false;
  jobData = [];
  currentPage = 1;
  totalPages = 1;
  currentTabId = null;
}

// Function to export data in the specified format
function exportData(format) {
    console.log("Export requested in format:", format);
    
    if (jobData.length === 0) {
      console.error("No data to export - jobData is empty");
      return;
    }
    
    console.log(`Preparing to export ${jobData.length} job records`);
    
    try {
      let content, filename, mimeType;
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      
      if (format === "json") {
        content = JSON.stringify(jobData, null, 2);
        filename = `job_data_${timestamp}.json`;
        mimeType = "application/json";
      } else if (format === "csv") {
        content = convertToCSV(jobData);
        filename = `job_data_${timestamp}.csv`;
        mimeType = "text/csv";
      } else if (format === "excel") {
        // For Excel, we'll generate a CSV that Excel can open
        content = convertToCSV(jobData);
        filename = `job_data_${timestamp}.csv`; // Changed to .csv for better compatibility
        mimeType = "text/csv";
      } else {
        // Default to CSV if format is not recognized
        content = convertToCSV(jobData);
        filename = `job_data_${timestamp}.csv`;
        mimeType = "text/csv";
      }
      
      console.log(`Created ${content.length} bytes of ${mimeType} data`);
      
      // Create a data URL directly (works in service workers)
      const base64Content = btoa(unescape(encodeURIComponent(content)));
      const dataUrl = `data:${mimeType};base64,${base64Content}`;
      
      // Create an HTML page with the download link
      const htmlContent = `
  <!DOCTYPE html>
  <html>
  <head>
    <title>Download Job Data</title>
    <meta charset="utf-8">
    <style>
      body {
        font-family: Arial, sans-serif;
        text-align: center;
        margin: 0;
        padding: 20px;
        background-color: #f5f5f5;
      }
      .container {
        max-width: 600px;
        margin: 0 auto;
        background-color: white;
        border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        padding: 30px;
      }
      h1 {
        color: #4285F4;
        margin-top: 0;
      }
      .btn {
        display: inline-block;
        background-color: #4285F4;
        color: white;
        text-decoration: none;
        padding: 12px 24px;
        border-radius: 4px;
        font-weight: bold;
        margin-top: 20px;
        transition: background-color 0.2s;
      }
      .btn:hover {
        background-color: #3367d6;
      }
      .info {
        margin-top: 20px;
        color: #666;
        font-size: 14px;
      }
      .count {
        font-weight: bold;
        color: #4285F4;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>Job Data Extractor</h1>
      <p>Your file has been prepared and is ready to download.</p>
      <p>You extracted <span class="count">${jobData.length}</span> jobs.</p>
      <a href="${dataUrl}" download="${filename}" class="btn" id="download-link">Download ${filename}</a>
      <p class="info">If the download doesn't start automatically, click the button above.</p>
    </div>
    <script>
      // Auto-trigger download after a short delay
      setTimeout(function() {
        document.getElementById('download-link').click();
      }, 1000);
    </script>
  </body>
  </html>`;
      
      // Convert the HTML to a data URL
      const base64Html = btoa(unescape(encodeURIComponent(htmlContent)));
      const htmlDataUrl = `data:text/html;base64,${base64Html}`;
      
      // Open the HTML in a new tab
      chrome.tabs.create({ url: htmlDataUrl }, (tab) => {
        console.log("Download page opened in tab:", tab.id);
      });
    } catch (error) {
      console.error("Error in export function:", error);
      // Try a simpler approach if the above fails
      emergencyExport(format);
    }
  }

// Emergency fallback export method for when all else fails
function emergencyExport(format) {
    try {
      let content, filename;
      
      if (format === "json") {
        content = JSON.stringify(jobData, null, 2);
        filename = "job_data.json";
      } else {
        // Default to simple CSV
        const essentialFields = ['jobTitle', 'companyName', 'location', 'employmentType', 'salaryRange', 'jobUrl'];
        content = essentialFields.join(",") + "\n";
        
        for (const job of jobData) {
          const values = essentialFields.map(field => {
            const value = job[field] || "";
            return `"${String(value).replace(/"/g, '""').replace(/\n/g, ' ')}"`;
          });
          content += values.join(",") + "\n";
        }
        filename = "job_data.csv";
      }
      
      // Create a very simple data URL
      const base64 = btoa(unescape(encodeURIComponent(content)));
      const dataUrl = `data:text/plain;base64,${base64}`;
      
      // Open in new tab
      chrome.tabs.create({ url: dataUrl }, (tab) => {
        console.log("Emergency data export opened in tab:", tab.id);
        
        // Inject instructions
        setTimeout(() => {
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: () => {
              const div = document.createElement('div');
              div.innerHTML = `
                <div style="position:fixed;top:0;left:0;right:0;background:#4285F4;color:white;padding:15px;text-align:center;z-index:9999;font-family:Arial,sans-serif;">
                  <h3>Please right-click on this page and select "Save as..." to download your data</h3>
                  <p>Then save with the filename: job_data.csv (or .json)</p>
                </div>
              `;
              document.body.prepend(div);
            }
          });
        }, 500);
      });
    } catch (finalError) {
      console.error("Emergency export failed:", finalError);
      // At this point, we've tried everything possible
      alert("Export failed. Please try again or contact support.");
    }
  }
// Function to directly download using a temporary HTML file
function directDownload(content, filename, type) {
  // Create the download HTML
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>Downloading ${filename}</title>
  <meta charset="utf-8">
  <style>
    body {
      font-family: Arial, sans-serif;
      text-align: center;
      background-color: #f5f5f5;
      padding: 20px;
    }
    .container {
      background-color: white;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      padding: 20px;
      max-width: 500px;
      margin: 0 auto;
    }
    h2 {
      color: #4285F4;
    }
    button {
      background-color: #4285F4;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 16px;
      margin-top: 20px;
    }
    button:hover {
      background-color: #3367d6;
    }
  </style>
</head>
<body>
  <div class="container">
    <h2>Job Data Extractor</h2>
    <p>Your file is ready to download.</p>
    <button id="download-btn">Download ${filename}</button>
  </div>
  
  <script>
    // Store the data in a blob
    const data = ${JSON.stringify(content)};
    const blob = new Blob([data], { type: "${type}" });
    const url = URL.createObjectURL(blob);
    
    // Set up download when button is clicked
    document.getElementById('download-btn').addEventListener('click', function() {
      const a = document.createElement('a');
      a.href = url;
      a.download = "${filename}";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });
    
    // Auto-download after 1 second
    setTimeout(function() {
      document.getElementById('download-btn').click();
    }, 1000);
  </script>
</body>
</html>
  `;
  
  // Create a blob for the HTML
  const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
  const htmlUrl = URL.createObjectURL(htmlBlob);
  
  // Open the HTML in a new tab
  chrome.tabs.create({ url: htmlUrl }, (tab) => {
    console.log("Download page opened in tab:", tab.id);
    
    // Clean up the URL after a delay
    setTimeout(() => {
      URL.revokeObjectURL(htmlUrl);
    }, 5000);
  });
}

// Helper function to convert data to CSV format
function convertToCSV(data) {
  if (data.length === 0) return "";
  
  try {
    // Extract headers from the first job object
    const headers = Object.keys(data[0]);
    let csv = headers.join(",") + "\n";
    
    for (const row of data) {
      const values = headers.map(header => {
        const value = row[header] || "";
        // Escape quotes and handle commas in the data
        return `"${String(value).replace(/"/g, '""').replace(/\n/g, ' ').replace(/\r/g, ' ')}"`;
      });
      csv += values.join(",") + "\n";
    }
    
    return csv;
  } catch (csvError) {
    console.error("Error converting to CSV:", csvError);
    // Return a simpler CSV with fewer columns if there's an error
    return createSimpleCSV(data);
  }
}

// Create a simpler CSV with just the essential columns
function createSimpleCSV(data) {
  if (data.length === 0) return "";
  
  const essentialFields = ['jobTitle', 'companyName', 'location', 'employmentType', 'salaryRange', 'jobUrl'];
  let csv = essentialFields.join(",") + "\n";
  
  for (const job of data) {
    const values = essentialFields.map(field => {
      const value = job[field] || "";
      return `"${String(value).replace(/"/g, '""').replace(/\n/g, ' ')}"`;
    });
    csv += values.join(",") + "\n";
  }
  
  return csv;
}