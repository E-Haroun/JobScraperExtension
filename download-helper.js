// This is a content script that helps with downloading when the chrome.downloads API fails
// Create a new file called download-helper.js and add it to your manifest's content_scripts

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "triggerDownload") {
      try {
        // Create a download link
        const link = document.createElement('a');
        link.download = message.filename;
        link.href = window.location.href; // Use the current data URL
        link.style.display = 'none';
        
        // Add to the DOM and click
        document.body.appendChild(link);
        link.click();
        
        // Clean up
        setTimeout(() => {
          document.body.removeChild(link);
          sendResponse({ status: "downloaded" });
        }, 100);
      } catch (error) {
        console.error("Download helper error:", error);
        sendResponse({ status: "error", error: error.message });
      }
      return true; // Keep the message channel open for the sendResponse
    }
  });
  
  // Add a listener that triggers when this script loads on a data URL page
  if (window.location.href.startsWith('data:')) {
    window.addEventListener('load', () => {
      // Create a helpful UI for the user since they're seeing the raw data
      const container = document.createElement('div');
      container.style.cssText = 'position:fixed; top:0; left:0; right:0; background:#4285F4; color:white; padding:15px; text-align:center; z-index:9999; font-family:Arial, sans-serif;';
      
      container.innerHTML = `
        <h2>Job Data Extractor - Download</h2>
        <p>Your file is ready to download. If it doesn't download automatically, please right-click anywhere on this page and select "Save As..."</p>
        <button id="download-now" style="padding:10px 20px; margin:10px; background:white; color:#4285F4; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">Download Now</button>
      `;
      
      document.body.prepend(container);
      
      // Add click handler for the download button
      document.getElementById('download-now').addEventListener('click', () => {
        const suggestedName = window.location.href.includes('json') ? 'job_data.json' : 'job_data.csv';
        
        const link = document.createElement('a');
        link.download = suggestedName;
        link.href = window.location.href;
        link.click();
      });
    });
  }