// DOM elements
const extractionStatusEl = document.getElementById('extraction-status');
const progressTextEl = document.getElementById('progress-text');
const progressBarEl = document.getElementById('progress-bar');
const jobCountEl = document.getElementById('job-count');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const exportBtn = document.getElementById('export-btn');
const resetBtn = document.getElementById('reset-btn');
const exportFormatEl = document.getElementById('export-format');
const delayInputEl = document.getElementById('delay-input');

// State variables
let isExtracting = false;
let jobCount = 0;
let statusInterval = null;

// Initialize popup
document.addEventListener('DOMContentLoaded', function() {
  // Get current extraction status
  updateStatus();
  
  // Set up event listeners
  startBtn.addEventListener('click', startExtraction);
  stopBtn.addEventListener('click', stopExtraction);
  exportBtn.addEventListener('click', exportData);
  resetBtn.addEventListener('click', resetData);
  
  // Load settings from storage
  chrome.storage.local.get(['extractionDelay'], function(result) {
    if (result.extractionDelay) {
      delayInputEl.value = result.extractionDelay;
    }
  });
  
  // Save settings when changed
  delayInputEl.addEventListener('change', function() {
    chrome.storage.local.set({
      extractionDelay: parseInt(delayInputEl.value)
    });
  });
});

// Function to update status
function updateStatus() {
  chrome.runtime.sendMessage({ action: "getStatus" }, function(response) {
    if (!response) return;
    
    isExtracting = response.isExtracting;
    jobCount = response.jobCount;
    
    // Update UI based on status
    if (isExtracting) {
      extractionStatusEl.textContent = 'Running';
      extractionStatusEl.style.color = '#4caf50';
      startBtn.disabled = true;
      stopBtn.disabled = false;
      exportBtn.disabled = true;
      
      // Update progress
      const currentPage = response.currentPage;
      const totalPages = response.totalPages;
      progressTextEl.textContent = `${currentPage}/${totalPages} pages`;
      progressBarEl.value = (currentPage / totalPages) * 100;
      progressBarEl.max = 100;
      
      // Start status polling if not already running
      if (!statusInterval) {
        statusInterval = setInterval(updateStatus, 1000);
      }
    } else {
      if (jobCount > 0) {
        extractionStatusEl.textContent = 'Completed';
        extractionStatusEl.style.color = '#4caf50';
      } else {
        extractionStatusEl.textContent = 'Not running';
        extractionStatusEl.style.color = '#f44336';
      }
      
      startBtn.disabled = false;
      stopBtn.disabled = true;
      exportBtn.disabled = jobCount === 0;
      
      // Stop status polling
      if (statusInterval) {
        clearInterval(statusInterval);
        statusInterval = null;
      }
    }
    
    // Update job count with animation if it changes
    if (parseInt(jobCountEl.textContent) !== jobCount) {
      jobCountEl.style.transition = 'color 0.3s';
      jobCountEl.style.color = '#4caf50';
      jobCountEl.textContent = jobCount;
      
      setTimeout(() => {
        jobCountEl.style.color = '';
      }, 500);
    }
  });
}

// Start the extraction process
function startExtraction() {
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    if (tabs.length > 0) {
      chrome.runtime.sendMessage({
        action: "startExtraction",
        tabId: tabs[0].id
      }, function(response) {
        if (response) {
          isExtracting = true;
          updateStatus();
        }
      });
    }
  });
}

// Stop the extraction process
function stopExtraction() {
  chrome.runtime.sendMessage({ action: "stopExtraction" }, function(response) {
    if (response) {
      isExtracting = false;
      updateStatus();
    }
  });
}

// Export collected data
function exportData() {
  const format = exportFormatEl.value;
  chrome.runtime.sendMessage({
    action: "exportData",
    format: format
  }, function(response) {
    // Show feedback that export has started
    if (response) {
      exportBtn.textContent = "Exporting...";
      setTimeout(() => {
        exportBtn.textContent = "Export Data";
      }, 1000);
    }
  });
}

// Reset all data
function resetData() {
  chrome.runtime.sendMessage({ action: "resetData" }, function(response) {
    if (response) {
      jobCount = 0;
      updateStatus();
    }
  });
}